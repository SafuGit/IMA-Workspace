"""
run_brand.py
------------
Root runner for Step 1: Brand Discovery.
Runs link extraction and brand profiling from video descriptions.

Usage:
    python run_brand.py
    python run_brand.py --batch-size 200
"""

import sys
from pathlib import Path

# Add main-tool/omar-finder to path
_OMAR_FINDER = Path(__file__).resolve().parent / "main-tool" / "omar-finder"
if str(_OMAR_FINDER) not in sys.path:
    sys.path.insert(0, str(_OMAR_FINDER))

from run_brand import main

if __name__ == "__main__":
    main()
