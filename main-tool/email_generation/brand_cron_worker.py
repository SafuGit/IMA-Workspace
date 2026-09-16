"""
email_generation/brand_cron_worker.py
--------------------------------------
Automated overnight / batch worker that takes approved brands,
discovers contact emails if missing, runs the Observation Engine,
and drafts 4-element brand pitches on behalf of responded creators.
"""

import os
import sys
import argparse
import json
import urllib.request
from pathlib import Path
from typing import Any

# Ensure main-tool/ root is on sys.path
_MAIN_TOOL = Path(__file__).resolve().parent.parent
if str(_MAIN_TOOL) not in sys.path:
    sys.path.insert(0, str(_MAIN_TOOL))

# Also ensure omar-finder is on path
_OMAR_FINDER = _MAIN_TOOL / "omar-finder"
if str(_OMAR_FINDER) not in sys.path:
    sys.path.insert(0, str(_OMAR_FINDER))

import db.brands as db_brands
from workflows.contact_finder import find_and_save_brand_contact
from workflows.brand_pitch import generate_brand_pitch
from email_generation.cron_worker import get_discord_config, send_discord_log


def fetch_approved_brands_needing_pitches(limit: int = 20, brand_id: int | None = None) -> list[dict[str, Any]]:
    """
    Find brands with status = 'approved' or 'contact_found' that do not have
    an outreach draft in brand_emails yet.
    """
    with db_brands.get_cursor(commit=False) as cur:
        if brand_id:
            cur.execute("SELECT * FROM brands WHERE id = %s", (brand_id,))
            return [dict(r) for r in cur.fetchall()]

        sql = """
            SELECT b.*
            FROM brands b
            WHERE b.status IN ('approved', 'contact_found')
              AND b.id NOT IN (
                  SELECT brand_id FROM brand_emails WHERE outreach_draft IS NOT NULL
              )
            ORDER BY b.composite_score DESC NULLS LAST, b.total_sponsored_videos DESC
            LIMIT %s
        """
        cur.execute(sql, (limit,))
        return [dict(r) for r in cur.fetchall()]


def run_brand_cron_batch(batch_size: int = 20, dry_run: bool = False, brand_id: int | None = None) -> dict[str, Any]:
    """Execute pitch generation batch for approved brands."""
    brands = fetch_approved_brands_needing_pitches(limit=batch_size, brand_id=brand_id)
    print(f"\n[brand_cron] Identified {len(brands)} approved brands needing pitch drafts.")

    if dry_run:
        print("[brand_cron] DRY RUN active — printing queue:")
        for idx, b in enumerate(brands, 1):
            print(f"  {idx}. {b.get('brand_name') or b['registered_domain']} (Score: {b.get('composite_score')}, Status: {b['status']})")
        return {"dry_run": True, "count": len(brands), "brands": [b["registered_domain"] for b in brands]}

    send_discord_log(f"🚀 **Fylint Brand Batch Started**: Processing up to {len(brands)} approved brand pitches.")

    success_count = 0
    errors = []

    for b in brands:
        b_id = b["id"]
        domain = b["registered_domain"]
        b_name = b.get("brand_name") or domain
        print(f"\n────────────────────────────────────────────────────────")
        print(f"[brand_cron] Processing brand: {b_name} ({domain})")

        # 1. Contact check
        if not b.get("contact_email"):
            print(f"[brand_cron] Contact missing for {domain}, running contact finder …")
            try:
                contact_res = find_and_save_brand_contact(b_id)
                if contact_res and contact_res.get("contact_email"):
                    b["contact_email"] = contact_res["contact_email"]
            except Exception as ce:
                print(f"[brand_cron] Contact discovery error: {ce}")

        # 2. Pitch Generation
        try:
            pitch_res = generate_brand_pitch(brand_id=b_id)
            print(f"[brand_cron] ✅ Generated pitch draft for {b_name} (Email ID: {pitch_res['email_id']})")
            success_count += 1
        except Exception as pe:
            err_msg = f"Failed to draft pitch for {b_name}: {pe}"
            print(f"[brand_cron] ❌ {err_msg}")
            errors.append(err_msg)

    summary_msg = f"✨ **Fylint Brand Batch Finished**: Successfully generated {success_count}/{len(brands)} brand pitches."
    if errors:
        summary_msg += f"\n⚠️ Encountered {len(errors)} errors."
    send_discord_log(summary_msg)

    return {
        "total_attempted": len(brands),
        "success_count": success_count,
        "errors": errors,
    }


def main():
    parser = argparse.ArgumentParser(description="Fylint Brand Outreach Pitch Worker")
    parser.add_argument("--batch-size", type=int, default=20, help="Number of brands to draft pitches for")
    parser.add_argument("--dry-run", action="store_true", help="Preview brands without generating LLM drafts")
    parser.add_argument("--brand-id", type=int, default=None, help="Target a specific brand ID")

    args = parser.parse_args()
    run_brand_cron_batch(batch_size=args.batch_size, dry_run=args.dry_run, brand_id=args.brand_id)


if __name__ == "__main__":
    main()
