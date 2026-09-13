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
import json
import urllib.request
import urllib.error

def get_discord_config() -> tuple[str, str]:
    """Retrieve dynamic Discord webhook URL and user ping from database settings or environment."""
    url = os.getenv("DISCORD_WEBHOOK_URL", "")
    ping = os.getenv("DISCORD_USER_PING", "<@871313769723228160>")
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM system_settings WHERE key IN ('email_generation_api', 'discord_webhook')")
            rows = cur.fetchall()
            for r in rows:
                val = r[0] if isinstance(r[0], dict) else json.loads(r[0])
                if val.get("discordWebhookUrl"):
                    url = val["discordWebhookUrl"].strip()
                if val.get("discordUserPing"):
                    ping = val["discordUserPing"].strip()
        conn.close()
    except Exception:
        pass
    return url, ping


def send_discord_log(message: str) -> None:
    """Send log notification to dynamic Discord webhook."""
    webhook_url, _ = get_discord_config()
    if not webhook_url:
        return
    try:
        data = json.dumps({"content": message}).encode("utf-8")
        req = urllib.request.Request(
            webhook_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Fylint-Cron-Notifier/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception as e:
        print(f"  [Discord Log Warning] Failed to post log to webhook: {e}")


from email_generation.generate_email import run_pipeline


def get_db_connection():
    """Connect to PostgreSQL database using environment variables."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.getenv("DB_NAME", "aikido_ima_safwano"),
        user=os.getenv("DB_USER", "app_user_safwano"),
        password=os.getenv("DB_PASSWORD", "aikido_app_password"),
    )


def fetch_approved_creators_needing_emails(limit: int = 20, channel_id: str | None = None) -> list[dict[str, Any]]:
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
                      AND COALESCE(c.videos_last_month, 0) > 0
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


import time
from datetime import datetime, timezone, timedelta

# Bangladesh Standard Time (UTC+6)
BST_ZONE = timezone(timedelta(hours=6))


def run_cron_batch(batch_size: int = 20, dry_run: bool = False, target_channel_id: str | None = None) -> dict[str, Any]:
    print("\n" + "═" * 65)
    print(f"  Fylint Automated Daily Outreach Generator (Target: {batch_size} approved creators)")
    print("═" * 65)

    creators = fetch_approved_creators_needing_emails(limit=batch_size, channel_id=target_channel_id)
    if not creators:
        print("  No approved creators found needing outreach drafts.")
        print("  Tip: Go to the web dashboard /channels to review & approve candidates.\n")
        return {"success": True, "total": 0, "processed": 0, "errors": 0, "creators": []}

    print(f"  Found {len(creators)} approved creator(s) ready for email generation.\n")

    if dry_run:
        print("  [DRY-RUN MODE] Selected creators for batch:")
        for idx, c in enumerate(creators, 1):
            sub_str = f"{c.get('subscriber_count', 0):,} subs" if c.get("subscriber_count") else "subs N/A"
            print(f"    {idx}. {c.get('channel_name')} ({sub_str}) | Video: {c.get('video_title') or 'N/A'}")
        print("\n  Dry-run complete. No emails were generated.")
        return {"success": True, "total": len(creators), "processed": 0, "errors": 0, "dry_run": True}

    # Ping user and announce daily cron start on Discord
    _, user_ping = get_discord_config()
    send_discord_log(
        f"🚀 {user_ping} **Daily cron is running!**\n"
        f"Found **{len(creators)}** approved creator(s) queued for outreach draft generation."
    )

    processed = 0
    errors = 0
    generated_list = []

    for idx, c in enumerate(creators, 1):
        channel_id = c["channel_id"]
        channel_name = c["channel_name"]
        video_id = c.get("video_id")
        sub_str = f" ({c.get('subscriber_count', 0):,} subs)" if c.get("subscriber_count") else ""
        video_title = c.get("video_title") or "N/A"
        handle = c.get("channel_handle") or channel_id

        print(f"  [{idx}/{len(creators)}] Processing creator: {channel_name} …")

        # Discord log: show each approved creator it's emailing
        send_discord_log(
            f"📨 **[{idx}/{len(creators)}] Emailing Approved Creator:** **{channel_name}** (`{handle}`){sub_str}\n"
            f"• **Video:** {video_title}\n"
            f"• **Status:** Generating personalized hook & drafts..."
        )

        if not video_id:
            print(f"    ⚠ Skipped {channel_name}: No scraped videos found in DB.")
            send_discord_log(f"⚠️ **[{idx}/{len(creators)}] Skipped {channel_name}:** No videos found in database.")
            continue

        try:
            # 1. Run pipeline (transcript + top comments + hook extraction + agy Gemini prompt)
            pipeline_res = run_pipeline(video_id)

            drafts_data = pipeline_res.get("drafts") or {}
            subj_data = pipeline_res.get("subject_lines") or {}
            hooks_data = pipeline_res.get("hooks") or []

            # If pipeline returned structured drafts, build clean multi-draft string
            if drafts_data and ("option_a" in drafts_data or "option_b" in drafts_data):
                draft_parts = ["=== ACTIVE_KEY: option_a ===\n"]
                for key, name in [
                    ("option_a", "Agency Deal Sourcing"),
                    ("option_b", "Rate Negotiation & Placement"),
                    ("option_c", "Production Calendar Roster"),
                ]:
                    d = drafts_data.get(key, {})
                    subj = (
                        d.get("subject")
                        or subj_data.get(
                            "primary"
                            if key == "option_a"
                            else ("alternative_1" if key == "option_b" else "alternative_2")
                        )
                        or ""
                    )
                    body = d.get("body") or ""
                    draft_parts.append(f"=== DRAFT_START: {key} | {name} ===")
                    draft_parts.append(f"Subject: {subj}")
                    draft_parts.append(f"Body:\n{body.strip()}")
                    draft_parts.append("=== DRAFT_END ===\n")
                draft = "\n".join(draft_parts).strip()
            else:
                draft = pipeline_res.get("raw_output") or pipeline_res.get("email") or ""

            # Build structured commentary if hooks and subject lines exist
            commentary_parts = []
            if subj_data.get("primary") or subj_data.get("alternative_1") or subj_data.get("alternative_2"):
                sl_part = "=== SUBJECT_LINES ===\n"
                if subj_data.get("primary"):
                    sl_part += f"Primary: {subj_data['primary']}\n"
                if subj_data.get("alternative_1"):
                    sl_part += f"Alternative: {subj_data['alternative_1']}\n"
                if subj_data.get("alternative_2"):
                    sl_part += f"Alternative: {subj_data['alternative_2']}\n"
                commentary_parts.append(sl_part.strip())

            if isinstance(hooks_data, list) and hooks_data:
                hooks_part = "=== HOOKS ===\n"
                for h_idx, h in enumerate(hooks_data, 1):
                    tag = h.get("tag") or "transcript-only"
                    ts = h.get("timestamp") or "00:00"
                    txt = h.get("text") or ""
                    analysis = h.get("what_happens") or ""
                    link = h.get("video_link") or ""
                    is_rec = "true" if h.get("is_recommended") else "false"
                    hooks_part += f"--- HOOK {h_idx} [{tag} | {ts}] ---\n"
                    hooks_part += f"Text: {txt}\n"
                    if link:
                        hooks_part += f"Video Link: {link}\n"
                    if analysis:
                        hooks_part += f"Analysis: {analysis}\n"
                    if h.get("is_recommended"):
                        hooks_part += f"Recommended: {is_rec}\n"
                    hooks_part += "\n"
                commentary_parts.append(hooks_part.strip())

            if commentary_parts:
                commentary = "\n\n".join(commentary_parts).strip()
            else:
                raw_hooks = pipeline_res.get("hooks")
                commentary = str(raw_hooks) if raw_hooks else "Personalized hook based on video topic and viewer comments."

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
            generated_list.append({"channel_id": channel_id, "channel_name": channel_name, "video_id": video_id})

            send_discord_log(
                f"✅ **[{idx}/{len(creators)}] Saved:** **{channel_name}** - Draft generated & saved to Review Hub."
            )
        except Exception as e:
            errors += 1
            print(f"    ✗ Error generating for {channel_name}: {e}")
            send_discord_log(f"❌ **[{idx}/{len(creators)}] Error for {channel_name}:** `{e}`")

    print("\n" + "═" * 65)
    print(f"  Daily Batch Complete: {processed} generated, {errors} failed out of {len(creators)} candidates.")
    print("  Drafts are ready for review at http://localhost:3000/emails (or VPS dashboard)")
    print("═" * 65 + "\n")

    # Discord log: completion summary
    send_discord_log(
        f"🏁 **Daily Outreach Cron Finished!**\n"
        f"• **Successfully Generated:** {processed}/{len(creators)}\n"
        f"• **Errors:** {errors}\n"
        f"👉 Ready to inspect at: http://aikidoima.duckdns.org/emails"
    )

    return {
        "success": True,
        "total": len(creators),
        "processed": processed,
        "errors": errors,
        "creators": generated_list,
    }


def get_cron_schedule_config() -> tuple[str, int]:
    """Retrieve dynamic daily cron run time (HH:MM) and batch size from database settings or defaults."""
    target_time = "13:05"
    batch_size = 20
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM system_settings WHERE key IN ('email_generation_api', 'cron_settings')")
            rows = cur.fetchall()
            for r in rows:
                val = r[0] if isinstance(r[0], dict) else json.loads(r[0])
                if val.get("dailyCronTime"):
                    target_time = str(val["dailyCronTime"]).strip()
                if val.get("dailyCronBatchSize"):
                    batch_size = int(val["dailyCronBatchSize"])
        conn.close()
    except Exception:
        pass
    return target_time, batch_size


def run_scheduler_loop(target_time_str: str | None = None, batch_size: int | None = None):
    """
    Run continuously and trigger the daily outreach generation dynamically at the configured time.
    Reads dailyCronTime and dailyCronBatchSize directly from system_settings on every tick.
    """
    print(f"\n[Cron Daemon] Started dynamic daily outreach scheduler.")
    last_run_date = None
    last_reported_time = None

    while True:
        # Dynamically read latest settings from DB if not overridden explicitly
        db_time, db_batch = get_cron_schedule_config()
        active_time = target_time_str if (target_time_str and target_time_str != "13:05") else db_time
        active_batch = batch_size if (batch_size and batch_size != 20) else db_batch

        parts = active_time.split(":")
        target_hour = int(parts[0])
        target_minute = int(parts[1]) if len(parts) > 1 else 0

        if last_reported_time != active_time:
            print(f"[Cron Daemon] Active schedule set to: {target_hour:02d}:{target_minute:02d} BST (UTC+6) | Batch: {active_batch} creators", flush=True)
            last_reported_time = active_time

        now_bst = datetime.now(BST_ZONE)
        today_str = now_bst.strftime("%Y-%m-%d")

        if now_bst.hour == target_hour and now_bst.minute == target_minute and last_run_date != today_str:
            print(f"\n[Cron Daemon] >>> SCHEDULE TRIGGERED at {now_bst.strftime('%Y-%m-%d %H:%M:%S BST')} (Target: {active_time}) <<<", flush=True)
            try:
                run_cron_batch(batch_size=active_batch)
                last_run_date = today_str
            except Exception as err:
                print(f"[Cron Daemon Error] {err}")

        time.sleep(15)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fylint Daily Outreach Batch Generator (20 Approved Creators)")
    parser.add_argument("--batch-size", type=int, default=20, help="Number of creators to draft (default: 20)")
    parser.add_argument("--dry-run", action="store_true", help="Print selected creators without calling AI")
    parser.add_argument("--channel-id", type=str, default=None, help="Run generation for a specific channel ID")
    parser.add_argument("--daemon", action="store_true", help="Run as background scheduler daemon")
    parser.add_argument("--schedule", type=str, default="13:05", help="Daily time to run in HH:MM (BST, default 13:05)")
    parser.add_argument("--now", action="store_true", help="Run batch immediately before entering daemon or exit")

    args = parser.parse_args()

    if args.now or not args.daemon:
        run_cron_batch(
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            target_channel_id=args.channel_id,
        )

    if args.daemon:
        run_scheduler_loop(target_time_str=args.schedule, batch_size=args.batch_size)


