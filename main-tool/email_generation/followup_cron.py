"""
email_generation/followup_cron.py
---------------------------------
Automated background worker that checks sent outreach emails and automatically
schedules and drafts follow-up messages at:
- Day 3 (Touch 1: Slot check / open integration inquiry)
- Day 7 (Touch 2: Commercial rate valuation benchmarking)
- Day 21 (Touch 3: Respectful breakup touch)

Stops immediately if creator responded.

Usage:
    # Run once to check and generate all due follow-up drafts:
    python email_generation/followup_cron.py

    # Dry-run mode (see what is due without updating database):
    python email_generation/followup_cron.py --dry-run

    # Force regenerate drafts even if already present:
    python email_generation/followup_cron.py --force

    # Run continuously as daemon (e.g. check every 6 hours):
    python email_generation/followup_cron.py --daemon --interval-hours 6
"""

import os
import sys
import time
import argparse
from datetime import datetime, timezone, timedelta
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


def get_db_connection():
    """Connect to PostgreSQL database using environment variables."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.getenv("DB_NAME", "aikido_ima"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
    )


def ensure_columns(conn):
    """Ensure creator_responded_at column exists in influencer_emails."""
    try:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE influencer_emails ADD COLUMN IF NOT EXISTS creator_responded_at TIMESTAMPTZ;")
        conn.commit()
    except Exception as e:
        conn.rollback()
        # Non-fatal if DB user lacks alter permissions


def generate_followup_copy(stage: int, creator_name: str, video_title: str, original_subject: str = "") -> dict[str, str]:
    """
    Generates follow-up email copy adhering strictly to Safwan's voice and Fylint agency framing.
    Broker/agency framing: we pitch the channel directly to software brands and negotiate flat rates.
    Short, crisp, low friction, zero fluff, zero generic spam triggers.
    """
    clean_name = creator_name.lstrip("@").strip() if creator_name else "there"
    clean_video = video_title.strip() if video_title else "your recent tutorial"

    if original_subject:
        subj = original_subject if original_subject.lower().startswith("re:") else f"Re: {original_subject}"
    else:
        subj = f"Re: {clean_video}"

    if stage == 1:
        # Day 3: Quick broker touch - open recording slots inquiry (~35 words)
        body = (
            f"Hey {clean_name},\n\n"
            f"Following up on my note about your \"{clean_video}\" video.\n\n"
            f"We work as a sponsorship brokerage for tech creators, pitching your channel directly to relevant software brands and negotiating flat rates so you don't deal with the admin.\n\n"
            f"Curious if you have any open integration slots in your upcoming recording schedule?\n\n"
            f"Best,\nSafwan | Fylint"
        )
    elif stage == 2:
        # Day 7: Commercial valuation angle (~35 words)
        body = (
            f"Hey {clean_name},\n\n"
            f"Wanted to circle back on this. Given the retention and viewer trust on your channel, your tutorials command premium flat rates in the current software sponsor market.\n\n"
            f"Curious to see where we'd benchmark your integration pricing?\n\n"
            f"Best,\nSafwan | Fylint"
        )
    else:
        # Day 21: Respectful breakup touch (~30 words)
        body = (
            f"Hey {clean_name},\n\n"
            f"Assuming you're all set on brand partnerships for now, so I won't crowd your inbox.\n\n"
            f"If you ever want an agency to source and negotiate software sponsorships for your channel down the road, feel free to reach out anytime.\n\n"
            f"Best,\nSafwan | Fylint"
        )

    return {"subject": subj, "body": body}


def check_and_generate_followups(dry_run: bool = False, force: bool = False) -> dict[str, int]:
    """Check sent outreach emails and generate due follow-up drafts."""
    conn = get_db_connection()
    ensure_columns(conn)

    counts = {
        "checked": 0,
        "due": 0,
        "generated": 0,
        "responded": 0,
        "completed": 0,
        "scheduled": 0,
    }

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            sql = """
                SELECT
                    e.id,
                    e.channel_id,
                    c.channel_name,
                    c.channel_handle,
                    e.video_id,
                    v.title AS video_title,
                    e.email_address,
                    e.outreach_draft,
                    e.outreach_commentary,
                    e.outreach_sent_at,
                    e.followup_commentary,
                    e.followup_draft,
                    e.followup_generated_at,
                    e.followup_sent_at,
                    e.creator_responded_at
                FROM influencer_emails e
                JOIN yt_channels c ON c.channel_id = e.channel_id
                LEFT JOIN yt_videos v ON v.video_id = e.video_id
                WHERE e.outreach_sent_at IS NOT NULL
                ORDER BY e.outreach_sent_at ASC
            """
            cur.execute(sql)
            rows = cur.fetchall()

        now = datetime.now(timezone.utc)
        print(f"\n[Followup Cron] Running check at {now.isoformat()} | Found {len(rows)} sent outreach records.")

        for r in rows:
            counts["checked"] += 1
            channel_name = r["channel_name"] or "Creator"
            video_title = r["video_title"] or "recent video"
            commentary = r["followup_commentary"] or ""

            # Check if creator responded
            responded_at = r.get("creator_responded_at")
            if not responded_at and "=== CREATOR_RESPONDED:" in commentary:
                for line in commentary.splitlines():
                    if "=== CREATOR_RESPONDED:" in line:
                        part = line.replace("=== CREATOR_RESPONDED:", "").replace("===", "").strip()
                        if part != "false":
                            responded_at = part

            if responded_at:
                counts["responded"] += 1
                continue

            # Sent touches
            fu1_sent = "=== FU1_SENT:" in commentary or (bool(r["followup_sent_at"]) and "=== FU2_SENT:" not in commentary and "=== FU3_SENT:" not in commentary)
            fu2_sent = "=== FU2_SENT:" in commentary
            fu3_sent = "=== FU3_SENT:" in commentary

            if fu3_sent:
                counts["completed"] += 1
                continue

            sent_at = r["outreach_sent_at"]
            if not sent_at:
                continue

            # Normalize sent_at to timezone-aware UTC
            if sent_at.tzinfo is None:
                sent_at = sent_at.replace(tzinfo=timezone.utc)

            day3 = sent_at + timedelta(days=3)
            day7 = sent_at + timedelta(days=7)
            day21 = sent_at + timedelta(days=21)

            # Determine stage
            if fu2_sent:
                stage = 3
                target_date = day21
            elif fu1_sent:
                stage = 2
                target_date = day7
            else:
                stage = 1
                target_date = day3

            if now >= target_date:
                counts["due"] += 1
                existing_draft = r["followup_draft"]

                if not existing_draft or force:
                    draft_obj = generate_followup_copy(
                        stage=stage,
                        creator_name=channel_name,
                        video_title=video_title,
                        original_subject="",
                    )
                    formatted_draft = f"Subject: {draft_obj['subject']}\n\nBody:\n{draft_obj['body']}"

                    if dry_run:
                        print(f"  [DRY-RUN] Would generate Stage {stage} draft for {channel_name} ({r['email_address']}): \"{draft_obj['subject']}\"")
                    else:
                        with conn.cursor() as update_cur:
                            update_cur.execute(
                                """
                                UPDATE influencer_emails
                                SET followup_draft = %s,
                                    followup_generated_at = now(),
                                    updated_at = now()
                                WHERE id = %s
                                """,
                                (formatted_draft, r["id"]),
                            )
                        conn.commit()
                        counts["generated"] += 1
                        print(f"  [OK] Generated Stage {stage} draft for {channel_name} ({r['email_address']})")
                else:
                    print(f"  [READY] Stage {stage} draft already prepared for {channel_name}")
            else:
                diff = target_date - now
                hours = int(diff.total_seconds() // 3600)
                days = hours // 24
                rem_hours = hours % 24
                time_str = f"{days}d {rem_hours}h" if days > 0 else f"{rem_hours}h"
                counts["scheduled"] += 1
                # print(f"  [SCHEDULED] Stage {stage} for {channel_name} due in {time_str}")

        print(f"[Followup Cron] Summary: Checked: {counts['checked']} | Due: {counts['due']} | Generated: {counts['generated']} | Scheduled: {counts['scheduled']} | Responded: {counts['responded']} | Completed: {counts['completed']}\n")
        return counts
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Automated Follow-up Cron Worker for Fylint Outreach")
    parser.add_argument("--dry-run", action="store_true", help="Preview due follow-ups without modifying database")
    parser.add_argument("--force", action="store_true", help="Force regenerate follow-up drafts")
    parser.add_argument("--daemon", action="store_true", help="Run continuously in a background loop")
    parser.add_argument("--interval-hours", type=float, default=6.0, help="Interval in hours when running as daemon")
    args = parser.parse_args()

    if args.daemon:
        print(f"[Followup Cron] Starting daemon loop every {args.interval_hours} hours...")
        while True:
            try:
                check_and_generate_followups(dry_run=args.dry_run, force=args.force)
            except Exception as e:
                print(f"[Followup Cron Error] {e}", file=sys.stderr)
            time.sleep(args.interval_hours * 3600)
    else:
        check_and_generate_followups(dry_run=args.dry_run, force=args.force)


if __name__ == "__main__":
    main()
