"""
email_generation/cron_worker.py
--------------------------------
Automated overnight / morning worker that finds the top approved creators
and generates 20-30 personalized cold outreach emails using the Fylint skills
so Safwan can wake up, inspect the drafts in the UI, and dispatch them.

Usage:
    # Run morning batch (default 25 creators):
    python email_generation/cron_worker.py

    # Dry-run mode (see which 25 creators would be processed without running LLM):
    python email_generation/cron_worker.py --dry-run

    # Custom batch size:
    python email_generation/cron_worker.py --batch-size 30

    # Single channel target:
    python email_generation/cron_worker.py --channel-id UC_x5XG1OV2P6uZZ5FSM9Ttw
"""

import os
import sys
import argparse
from pathlib import Path
from typing import Any
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Ensure main-tool/ root is on sys.path
_MAIN_TOOL = Path(__file__).resolve().parent.parent
if str(_MAIN_TOOL) not in sys.path:
    sys.path.insert(0, str(_MAIN_TOOL))

# Find and load .env file
_ENV_PATH = next(
    (parent / ".env" for parent in Path(__file__).resolve().parents if (parent / ".env").exists()),
    None
)
if _ENV_PATH:
    load_dotenv(_ENV_PATH)

from email_generation.generate_email import run_pipeline


def get_db_connection():
    """Connect to PostgreSQL database using environment variables."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.getenv("DB_NAME", "aikido_ima"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
    )


def fetch_approved_creators_needing_emails(limit: int = 25, channel_id: str | None = None) -> list[dict[str, Any]]:
    """
    Query top approved creators (valid = TRUE) who don't have an outreach draft yet,
    joined with their best/latest video for personalization.
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if channel_id:
                sql = """
                    SELECT
                        c.channel_id,
                        c.channel_name,
                        c.channel_handle,
                        c.subscriber_count,
                        c.avg_views,
                        c.avg_engagement_rate,
                        v.video_id,
                        v.title AS video_title
                    FROM yt_channels c
                    LEFT JOIN LATERAL (
                        SELECT video_id, title
                        FROM yt_videos
                        WHERE channel_id = c.channel_id
                        ORDER BY published_at DESC NULLS LAST, view_count DESC
                        LIMIT 1
                    ) v ON TRUE
                    WHERE c.channel_id = %s
                """
                cur.execute(sql, (channel_id,))
            else:
                sql = """
                    SELECT
                        c.channel_id,
                        c.channel_name,
                        c.channel_handle,
                        c.subscriber_count,
                        c.avg_views,
                        c.avg_engagement_rate,
                        v.video_id,
                        v.title AS video_title
                    FROM yt_channels c
                    JOIN LATERAL (
                        SELECT video_id, title
                        FROM yt_videos
                        WHERE channel_id = c.channel_id
                        ORDER BY published_at DESC NULLS LAST, view_count DESC
                        LIMIT 1
                    ) v ON TRUE
                    WHERE c.valid = TRUE
                      AND c.channel_id NOT IN (
                          SELECT channel_id FROM influencer_emails WHERE outreach_draft IS NOT NULL
                      )
                    ORDER BY c.avg_views DESC NULLS LAST, c.avg_engagement_rate DESC NULLS LAST
                    LIMIT %s
                """
                cur.execute(sql, (limit,))

            rows = cur.fetchall()
            return [dict(r) for r in rows]
    finally:
        conn.close()


def save_generated_email(
    channel_id: str,
    video_id: str | None,
    email_address: str,
    transcript: str | None,
    outreach_commentary: str | None,
    outreach_draft: str | None,
) -> None:
    """Save generated outreach email into the influencer_emails table."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            sql = """
                INSERT INTO influencer_emails (
                    channel_id,
                    video_id,
                    email_address,
                    transcript,
                    outreach_commentary,
                    outreach_draft,
                    outreach_generated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, now())
                ON CONFLICT DO NOTHING
            """
            cur.execute(
                sql,
                (
                    channel_id,
                    video_id,
                    email_address,
                    transcript,
                    outreach_commentary,
                    outreach_draft,
                ),
            )
            conn.commit()
    finally:
        conn.close()


def run_cron_batch(batch_size: int = 25, dry_run: bool = False, target_channel_id: str | None = None) -> None:
    print("\n" + "═" * 65)
    print(f"  Fylint Automated Morning Outreach Generator (Target: {batch_size})")
    print("═" * 65)

    creators = fetch_approved_creators_needing_emails(limit=batch_size, channel_id=target_channel_id)
    if not creators:
        print("  No approved creators found needing outreach drafts.")
        print("  Tip: Go to the web dashboard /channels to review & approve candidates.\n")
        return

    print(f"  Found {len(creators)} approved creator(s) ready for email generation.\n")

    if dry_run:
        print("  [DRY-RUN MODE] Selected creators for overnight batch:")
        for idx, c in enumerate(creators, 1):
            sub_str = f"{c.get('subscriber_count', 0):,} subs" if c.get("subscriber_count") else "subs N/A"
            print(f"    {idx}. {c.get('channel_name')} ({sub_str}) | Video: {c.get('video_title') or 'N/A'}")
        print("\n  Dry-run complete. No emails were generated.")
        return

    processed = 0
    errors = 0

    for idx, c in enumerate(creators, 1):
        channel_id = c["channel_id"]
        channel_name = c["channel_name"]
        video_id = c.get("video_id")

        print(f"  [{idx}/{len(creators)}] Processing creator: {channel_name} …")

        if not video_id:
            print(f"    ⚠ Skipped {channel_name}: No scraped videos found in DB.")
            continue

        try:
            # 1. Run pipeline (transcript + top comments + hook extraction + agy Gemini prompt)
            pipeline_res = run_pipeline(video_id)

            draft = pipeline_res.get("raw_output") or pipeline_res.get("email") or ""
            commentary = pipeline_res.get("hooks") or "Personalized hook based on video topic and viewer comments."
            transcript = pipeline_res.get("transcript") or ""

            # Standard outreach contact placeholder or handle
            email_address = f"contact@{c.get('channel_handle') or channel_id}.com"

            # 2. Save directly to influencer_emails
            save_generated_email(
                channel_id=channel_id,
                video_id=video_id,
                email_address=email_address,
                transcript=transcript[:5000] if transcript else None,
                outreach_commentary=commentary,
                outreach_draft=draft,
            )

            print(f"    ✓ Draft saved to DB for {channel_name}!")
            processed += 1
        except Exception as e:
            errors += 1
            print(f"    ✗ Error generating for {channel_name}: {e}")

    print("\n" + "═" * 65)
    print(f"  Morning Batch Complete: {processed} generated, {errors} failed.")
    print("  Drafts are ready for review at http://localhost:3000/emails (or VPS dashboard)")
    print("═" * 65 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fylint Morning Outreach Batch Generator")
    parser.add_argument("--batch-size", type=int, default=25, help="Number of creators to draft (default: 25)")
    parser.add_argument("--dry-run", action="store_true", help="Print selected creators without calling AI")
    parser.add_argument("--channel-id", type=str, default=None, help="Run generation for a specific channel ID")

    args = parser.parse_args()
    run_cron_batch(
        batch_size=args.batch_size,
        dry_run=args.dry_run,
        target_channel_id=args.channel_id,
    )
