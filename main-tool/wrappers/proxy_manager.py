"""
wrappers/proxy_manager.py
--------------------------
Manages a rotating pool of HTTP/HTTPS proxies stored in the PostgreSQL `proxies` table.
Used to bypass datacenter IP restrictions on the YouTube Transcript API.
"""

import os
import sys
import re
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

_LAST_WORKING_PROXY: str | None = None

def get_last_working_proxy() -> str | None:
    """Return the most recently validated working proxy (if any)."""
    return _LAST_WORKING_PROXY


def fetch_proxydb_proxies(limit: int = 100) -> list[str]:
    """Fetch high-anonymity HTTPS proxies directly from ProxyDB (https://proxydb.net/).

    Parses href="/IP/PORT#PROTOCOL" links to cleanly bypass hidden honeypot elements.
    Returns a list of 'ip:port' strings.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    seen: set[str] = set()
    proxies: list[str] = []

    for offset in range(0, 105, 15):
        url = f"https://proxydb.net/?protocol=https&offset={offset}"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=5) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                matches = re.findall(
                    r'href="/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/([0-9]+)#([a-zA-Z0-9]+)"',
                    html,
                )
                for ip, port, proto in matches:
                    if proto.lower() == "https":
                        p = f"{ip}:{port}"
                        if p not in seen:
                            seen.add(p)
                            proxies.append(p)
                            if len(proxies) >= limit:
                                return proxies
        except Exception:
            continue

    # Fallback to secondary HTTPS elite source if ProxyDB returned fewer than 40
    if len(proxies) < 40:
        try:
            req = urllib.request.Request(
                "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=3500&country=all&ssl=yes&anonymity=elite",
                headers=headers,
            )
            with urllib.request.urlopen(req, timeout=4) as resp:
                for line in resp.read().decode("utf-8", errors="ignore").splitlines():
                    p = line.strip()
                    if p and ":" in p and p not in seen:
                        seen.add(p)
                        proxies.append(p)
                        if len(proxies) >= limit:
                            break
        except Exception:
            pass

    return proxies


def _save_working_proxy_safe(proxy_str: str) -> None:
    """Best-effort insertion/update of a verified working proxy into PostgreSQL."""
    try:
        parts = proxy_str.split(":")
        if len(parts) != 2:
            return
        ip, port = parts[0], int(parts[1])
        conn = get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO proxies (ip, port, protocol, is_active, failure_count, last_used_at)
                    VALUES (%s, %s, 'http', TRUE, 0, now())
                    ON CONFLICT (ip, port) DO UPDATE
                    SET is_active = TRUE, failure_count = 0, last_used_at = now(), updated_at = now()
                    """,
                    (ip, port),
                )
        conn.close()
    except Exception:
        pass


def fetch_captions_via_proxydb(
    video_id: str,
    lang: str = "en",
    max_workers: int = 25,
    probe_timeout: float = 3.0,
) -> tuple[list[Any] | None, str | None]:
    """Fetch captions for a YouTube video by rotating directly through fresh ProxyDB proxies.

    Uses a fast 0-byte ping to YouTube's generate_204 endpoint to instantly filter
    out dead proxies, then immediately retrieves captions using youtube_transcript_api.

    Returns:
        (snippets, winning_proxy_str) or (None, None).
    """
    global _LAST_WORKING_PROXY
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api.proxies import GenericProxyConfig
        import requests
    except ImportError:
        return None, None

    # If we already have a validated working proxy, test it first
    if _LAST_WORKING_PROXY:
        try:
            cfg = GenericProxyConfig(http_url=f"http://{_LAST_WORKING_PROXY}", https_url=f"http://{_LAST_WORKING_PROXY}")
            api = YouTubeTranscriptApi(proxy_config=cfg)
            tl = api.list(video_id)
            t = None
            try:
                t = tl.find_transcript([lang, f"{lang}-US", f"{lang}-GB", f"{lang}-orig"])
            except Exception:
                pass
            if not t:
                try:
                    t = tl.find_generated_transcript([lang])
                except Exception:
                    pass
            if not t:
                t = next(iter(tl), None)
            if t:
                snippets = t.fetch()
                return snippets, _LAST_WORKING_PROXY
        except Exception:
            _LAST_WORKING_PROXY = None

    candidates = fetch_proxydb_proxies(limit=90)
    if not candidates:
        return None, None

    print(f"      [proxies] Scraped {len(candidates)} fresh HTTPS candidates from ProxyDB. Probing concurrently …")

    def _worker(proxy: str):
        proxy_url = f"http://{proxy}"
        try:
            cfg = GenericProxyConfig(http_url=proxy_url, https_url=proxy_url)
            session = requests.Session()
            session.proxies = cfg.to_requests_dict()
            session.headers.update({
                "Accept-Language": "en-US",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            })
            # Fast 0-byte ping: tests SSL CONNECT tunnel in milliseconds without downloading 1MB HTML
            r = session.get("https://www.youtube.com/generate_204", timeout=probe_timeout)
            if r.status_code not in (200, 204):
                return None

            # Tunnel verified! Now fetch transcript
            api = YouTubeTranscriptApi(proxy_config=cfg, http_client=session)
            tl = api.list(video_id)
            t = None
            try:
                t = tl.find_transcript([lang, f"{lang}-US", f"{lang}-GB", f"{lang}-orig"])
            except Exception:
                pass
            if not t:
                try:
                    t = tl.find_generated_transcript([lang])
                except Exception:
                    pass
            if not t:
                t = next(iter(tl), None)
            if t:
                snippets = t.fetch()
                return proxy, snippets
        except Exception:
            pass
        return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_worker, p): p for p in candidates}
        for fut in concurrent.futures.as_completed(futures):
            res = fut.result()
            if res and res[1]:
                winning_proxy, snippets = res
                _LAST_WORKING_PROXY = winning_proxy
                for f in futures:
                    f.cancel()
                _save_working_proxy_safe(winning_proxy)
                return snippets, winning_proxy

    return None, None


def fetch_free_proxy_candidates(limit: int = 150) -> list[str]:
    """Fetch raw proxy list candidates from ProxyDB and public GitHub repositories."""
    candidates = fetch_proxydb_proxies(limit=limit // 2)
    sources = [
        "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
        "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
        "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=4000&country=all&ssl=all&anonymity=all",
    ]
    for url in sources:
        if len(candidates) >= limit:
            break
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
