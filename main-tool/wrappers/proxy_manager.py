"""
wrappers/proxy_manager.py
--------------------------
Manages a rotating pool of HTTP/HTTPS proxies stored in the PostgreSQL `proxies` table.
Used to bypass datacenter IP restrictions on the YouTube Transcript API.
"""

import os
import sys
import time
import urllib.request
import concurrent.futures
from pathlib import Path
from typing import Any
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Ensure .env is loaded
_ENV_PATH = next(
    (parent / ".env" for parent in Path(__file__).resolve().parents if (parent / ".env").exists()),
    None
)
if _ENV_PATH:
    load_dotenv(_ENV_PATH)

PROXIES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS proxies (
  id              BIGSERIAL PRIMARY KEY,
  ip              INET NOT NULL,
  port            INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  protocol        TEXT NOT NULL DEFAULT 'http' CHECK (protocol IN ('http', 'https', 'socks5')),
  username        TEXT,
  password        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at    TIMESTAMPTZ,
  failure_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ip, port)
);
CREATE INDEX IF NOT EXISTS idx_proxies_is_active ON proxies (is_active) WHERE is_active = TRUE;
"""

def get_db_connection():
    """Create a database connection using environment variables."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.getenv("DB_NAME", "aikido_ima_safwano"),
        user=os.getenv("DB_USER", "app_user_safwano"),
        password=os.getenv("DB_PASSWORD", ""),
        connect_timeout=5,
    )

def ensure_proxies_table() -> bool:
    """Ensure the proxies table exists in the database."""
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(PROXIES_TABLE_SQL)
        conn.close()
        return True
    except Exception as e:
        # DB connection might not be available in standalone mode
        return False

def get_active_proxies(limit: int = 15) -> list[dict[str, Any]]:
    """Retrieve active proxies from the database ordered by oldest used."""
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, ip::text, port, protocol, username, password
                    FROM proxies
                    WHERE is_active = TRUE
                    ORDER BY last_used_at ASC NULLS FIRST, failure_count ASC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []

def record_proxy_result(proxy_id: int, success: bool) -> None:
    """Update proxy status after a request attempt."""
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor() as cur:
                if success:
                    cur.execute(
                        """
                        UPDATE proxies
                        SET last_used_at = now(),
                            failure_count = 0,
                            is_active = TRUE,
                            updated_at = now()
                        WHERE id = %s
                        """,
                        (proxy_id,),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE proxies
                        SET failure_count = failure_count + 1,
                            is_active = (failure_count + 1 < 4),
                            updated_at = now()
                        WHERE id = %s
                        """,
                        (proxy_id,),
                    )
        conn.close()
    except Exception:
        pass

def test_proxy_for_youtube(proxy_str: str, timeout: float = 3.5) -> bool:
    """Test if a proxy can connect to YouTube without triggering an IP ban."""
    proxy_url = f"http://{proxy_str}" if not proxy_str.startswith("http") else proxy_str
    try:
        proxy_handler = urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})
        opener = urllib.request.build_opener(proxy_handler)
        req = urllib.request.Request(
            "https://www.youtube.com/generate_204",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with opener.open(req, timeout=timeout) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False

def fetch_free_proxy_candidates(limit: int = 150) -> list[str]:
    """Fetch raw proxy list candidates from public GitHub repositories."""
    sources = [
        "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
        "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
        "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=4000&country=all&ssl=all&anonymity=all",
    ]
    candidates: list[str] = []
    for url in sources:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                lines = resp.read().decode("utf-8", errors="ignore").splitlines()
                for line in lines:
                    line = line.strip()
                    if line and ":" in line and not line.startswith("#"):
                        candidates.append(line)
                        if len(candidates) >= limit:
                            return candidates
        except Exception:
            continue
    return candidates

def seed_working_proxies(max_to_find: int = 10) -> int:
    """Scrape, test, and insert working proxies into the database."""
    ensure_proxies_table()
    candidates = fetch_free_proxy_candidates(limit=100)
    if not candidates:
        return 0

    working: list[str] = []

    def _check(p: str):
        if test_proxy_for_youtube(p):
            return p
        return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=25) as executor:
        for res in executor.map(_check, candidates):
            if res:
                working.append(res)
                if len(working) >= max_to_find:
                    break

    if not working:
        return 0

    inserted = 0
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor() as cur:
                for p in working:
                    try:
                        parts = p.split(":")
                        ip, port = parts[0], int(parts[1])
                        cur.execute(
                            """
                            INSERT INTO proxies (ip, port, protocol, is_active, failure_count)
                            VALUES (%s, %s, 'http', TRUE, 0)
                            ON CONFLICT (ip, port) DO UPDATE
                            SET is_active = TRUE, failure_count = 0, updated_at = now()
                            """,
                            (ip, port),
                        )
                        inserted += 1
                    except Exception:
                        continue
        conn.close()
    except Exception:
        pass

    return inserted
