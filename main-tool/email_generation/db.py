"""
email_generation/db.py
----------------------
Database utilities for storing and retrieving video transcripts, comments,
and metadata in PostgreSQL.
"""

import os
import json
from typing import Any, Optional
import psycopg2
import psycopg2.extras
from pathlib import Path
from dotenv import load_dotenv

# Find and load .env file if available
_aikido_env = Path(__file__).resolve().parent.parent / "website" / "aikido-ima" / ".env.local"
if _aikido_env.exists():
    load_dotenv(_aikido_env)

for parent in Path(__file__).resolve().parents:
    env_candidate = parent / ".env"
    if env_candidate.exists():
        load_dotenv(env_candidate)
        break
    env_local = parent / ".env.local"
    if env_local.exists():
        load_dotenv(env_local)
        break


def get_db_connection():
    """Connect to PostgreSQL database using environment variables."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.getenv("DB_NAME", "aikido_ima_safwano"),
        user=os.getenv("DB_USER", "app_user_safwano"),
        password=os.getenv("DB_PASSWORD", "aikido_app_password"),
        connect_timeout=5,
    )


TRANSCRIPTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS transcripts (
    video_id      TEXT PRIMARY KEY,
    channel_id    TEXT,
    title         TEXT,
    description   TEXT,
    transcript    TEXT,
    comments      JSONB,
    source        TEXT,
    metadata      JSONB,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_channel_id ON transcripts (channel_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_fetched_at ON transcripts (fetched_at);
"""


def ensure_transcripts_table() -> bool:
    """Ensure transcripts table exists in database."""
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(TRANSCRIPTS_TABLE_SQL)
                conn.commit()
            return True
        finally:
            conn.close()
    except Exception as e:
        print(f"[DB Warning] Could not verify transcripts table: {e}")
        return False


def get_cached_transcript(video_id: str) -> Optional[dict[str, Any]]:
    """
    Retrieve cached transcript, comments, and metadata for a video_id.
    Returns None if not found or DB unreachable.
    """
    if not video_id:
        return None
    try:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT video_id, channel_id, title, description, transcript, comments, source, metadata
                    FROM transcripts
                    WHERE video_id = %s
                    LIMIT 1
                    """,
                    (video_id,),
                )
                row = cur.fetchone()
                if row and row.get("transcript"):
                    comments = row.get("comments")
                    if isinstance(comments, str):
                        try:
                            comments = json.loads(comments)
                        except Exception:
                            comments = []
                    return {
                        "video_id": row["video_id"],
                        "channel_id": row.get("channel_id") or "",
                        "title": row.get("title") or "",
                        "description": row.get("description") or "",
                        "comments": comments or [],
                        "transcript": row["transcript"],
                        "source": row.get("source") or "database_cache",
                        "metadata": row.get("metadata") or {},
                    }
        finally:
            conn.close()
    except Exception as e:
        # Silently fail on connection error so offline execution works
        pass
    return None


def save_transcript_record(
    video_id: str,
    channel_id: Optional[str] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
    transcript: Optional[str] = None,
    comments: Optional[list[dict[str, Any]]] = None,
    source: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> bool:
    """
    Save or update a video's transcript, comments, description, and metadata in PostgreSQL.
    """
    if not video_id:
        return False
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO transcripts (
                        video_id, channel_id, title, description, transcript, comments, source, metadata, fetched_at, updated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, now(), now()
                    )
                    ON CONFLICT (video_id) DO UPDATE SET
                        channel_id  = COALESCE(EXCLUDED.channel_id, transcripts.channel_id),
                        title       = COALESCE(EXCLUDED.title, transcripts.title),
                        description = COALESCE(EXCLUDED.description, transcripts.description),
                        transcript  = COALESCE(EXCLUDED.transcript, transcripts.transcript),
                        comments    = COALESCE(EXCLUDED.comments, transcripts.comments),
                        source      = COALESCE(EXCLUDED.source, transcripts.source),
                        metadata    = COALESCE(EXCLUDED.metadata, transcripts.metadata),
                        fetched_at  = now(),
                        updated_at  = now()
                    """,
                    (
                        video_id,
                        channel_id or None,
                        title or None,
                        description or None,
                        transcript or None,
                        json.dumps(comments) if comments is not None else None,
                        source or None,
                        json.dumps(metadata) if metadata is not None else None,
                    ),
                )
                conn.commit()
            return True
        finally:
            conn.close()
    except Exception as e:
        print(f"[DB Warning] Failed to save transcript for {video_id} to DB: {e}")
        return False
