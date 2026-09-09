"""
scripts/update_proxies.py
--------------------------
Scrapes public free proxy lists, tests their connectivity against YouTube,
and inserts validated active proxies into the PostgreSQL `proxies` table.

Usage:
    python main-tool/scripts/update_proxies.py
    python main-tool/scripts/update_proxies.py --target 15
"""

import os
import sys
import argparse
from pathlib import Path

# Ensure main-tool/ root is on sys.path
_MAIN_TOOL = Path(__file__).resolve().parent.parent
if str(_MAIN_TOOL) not in sys.path:
    sys.path.insert(0, str(_MAIN_TOOL))

from wrappers.proxy_manager import (
    ensure_proxies_table,
    seed_working_proxies,
    get_active_proxies,
)

def main():
    parser = argparse.ArgumentParser(description="Fetch and seed working proxies for YouTube transcript scraping.")
    parser.add_argument("--target", type=int, default=10, help="Target number of working proxies to find (default: 10)")
    args = parser.parse_args()

    print("=" * 60)
    print("  Proxy Manager: Seeding Working Proxies")
    print("=" * 60)

    print("[1/3] Ensuring PostgreSQL 'proxies' table exists …")
    table_ok = ensure_proxies_table()
    if table_ok:
        print("      ✅ 'proxies' table is ready in PostgreSQL.")
    else:
        print("      ⚠ Unable to connect to DB, continuing with fallback mode.")

    print(f"[2/3] Fetching candidates & testing YouTube connectivity (target: {args.target}) …")
    added = seed_working_proxies(max_to_find=args.target)
    print(f"      ✅ Successfully tested and inserted {added} working proxies.")

    print("[3/3] Current active proxies in database:")
    active = get_active_proxies(limit=10)
    if active:
        for p in active:
            print(f"      - {p['protocol']}://{p['ip']}:{p['port']} (failures: {p.get('failure_count', 0)})")
    else:
        print("      No active proxies currently recorded.")

    print("\nDone!")

if __name__ == "__main__":
    main()
