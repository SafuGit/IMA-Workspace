"""
email_generation/transcript.py
--------------------------------
Orchestrates the full YouTube data pipeline:

  YouTube URL
     ↓
  YouTube Data API  →  title, description, comments
     ↓
  Check captions (yt-dlp VTT)
     ↓
  Captions available?
     ├── YES → transcript = captions  (no Groq quota used)
     └── NO  → yt-dlp audio → faster-whisper local transcription

Usage
-----
  As a callable:
      from email_generation.transcript import get_video_data
      data = get_video_data("https://youtube.com/watch?v=...")

  As a script (from main-tool/ directory):
      python email_generation/transcript.py https://youtube.com/watch?v=...
      python email_generation/transcript.py     # interactive prompt
"""

import sys
import os
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Make sure `main-tool/` is on sys.path when run directly ─────────────────
# This lets `from wrappers.xxx import ...` resolve whether the file is run as
# a script (python email-generation/transcript.py) or imported as a package.
_ROOT = Path(__file__).resolve().parent.parent   # main-tool/
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from wrappers.youtube_api import (
    _fetch_video_details,
    _check_captions,
    _download_audio,
)
from wrappers.transcription import _transcribe_local


# ── Public return type ───────────────────────────────────────────────────────

def get_video_data(url: str) -> dict:
    """
    Run the full YouTube data pipeline for a given URL.

    Steps:
      1. Fetch title, description, and top comments via YouTube Data API.
      2. Attempt to download captions via yt-dlp (free, no quota).
      3. If captions unavailable, download audio and transcribe locally
         using faster-whisper (tiny.en, int8, CPU).

    Args:
        url: Full YouTube URL or 11-character video ID.

    Returns:
        {
            "video_id":    str,
            "title":       str,
            "description": str,
            "comments":    list[dict],   # [{text, author, likes, published_at}]
            "transcript":  str | None,   # None only if all methods fail
            "source":      "captions" | "local_transcription" | "none",
        }
    """

    # ── Step 1: YouTube Data API ─────────────────────────────────────────────
    print(f"[1/3] Fetching video details …")
    details = _fetch_video_details(url)

    video_id    = details["video_id"]
    title       = details["title"]
    description = details["description"]
    comments    = details["comments"]

    print(f"      Title    : {title}")
    print(f"      Comments : {len(comments)} fetched")

    # ── Step 2: Try captions first ───────────────────────────────────────────
    print(f"[2/3] Checking captions …")
    transcript = _check_captions(url)
    source = "none"

    if transcript:
        word_count = len(transcript.split())
        print(f"      ✅ Captions found  ({word_count} words) — no Groq quota used")
        source = "captions"

    # ── Step 3: Fallback — local transcription ───────────────────────────────
    else:
        print(f"      ❌ No captions — falling back to local transcription …")
        print(f"[3/3] Downloading audio (first 5 min) + transcribing locally …")
        try:
            transcript = _transcribe_local(url, benchmark=True)
            if transcript:
                word_count = len(transcript.split())
                print(f"      ✅ Transcription complete ({word_count} words)")
                source = "local_transcription"
            else:
                print(f"      ⚠  Transcription returned empty result")
        except Exception as e:
            print(f"      ❌ Transcription failed: {e}")
            transcript = None

    return {
        "video_id":    video_id,
        "title":       title,
        "description": description,
        "comments":    comments,
        "transcript":  transcript,
        "source":      source,
    }


# ── CLI entrypoint ───────────────────────────────────────────────────────────

def _print_summary(data: dict) -> None:
    """Print a short human-readable summary of the result."""
    print()
    print("━" * 56)
    print("  Result Summary")
    print("━" * 56)
    print(f"  Video ID    : {data['video_id']}")
    print(f"  Title       : {data['title'][:60]}")
    print(f"  Description : {len(data['description'])} chars")
    print(f"  Comments    : {len(data['comments'])}")
    print(f"  Transcript  : {len((data['transcript'] or '').split())} words")
    print(f"  Source      : {data['source']}")
    print("━" * 56)

    if data["transcript"]:
        preview = " ".join(data["transcript"].split()[:40])
        print(f"\n  Transcript preview:\n  {preview} …")
    print()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        video_url = sys.argv[1].strip()
    else:
        video_url = input("Enter YouTube URL: ").strip()

    if not video_url:
        print("No URL provided. Exiting.")
        sys.exit(1)

    result = get_video_data(video_url)
    _print_summary(result)
