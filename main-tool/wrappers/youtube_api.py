import html
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import requests
import yt_dlp
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://www.googleapis.com/youtube/v3"
API_KEY = os.getenv("YOUTUBE_API_KEY")

def _extract_video_id(url: str) -> str:
    """Extract the YouTube video ID from common YouTube URL formats."""

    if len(url) == 11 and re.match(r"^[a-zA-Z0-9_-]{11}$", url):
        return url

    patterns = [
        r"(?:youtube\.com/watch\?v=)([^&]+)",
        r"(?:youtu\.be/)([^?&]+)",
        r"(?:youtube\.com/shorts/)([^?&]+)",
        r"(?:youtube\.com/embed/)([^?&]+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)

    raise ValueError("Invalid YouTube URL")


def _fetch_video_details(url: str) -> dict:
    """Fetch title, description, and comments for a YouTube video with minimized token usage."""

    video_id = _extract_video_id(url)

    # 1. Video metadata - use `fields` parameter to fetch only title and description
    response = requests.get(
        f"{BASE_URL}/videos",
        params={
            "part": "snippet",
            "id": video_id,
            "key": API_KEY,
            "fields": "items(snippet(title,description))",
        },
        timeout=10,
    )
    response.raise_for_status()

    data = response.json()

    if not data.get("items"):
        raise ValueError("YouTube video not found")

    snippet = data["items"][0]["snippet"]

    title = snippet.get("title", "").strip()
    description = snippet.get("description", "").strip()

    # 2. Comments - use `fields` and `textOriginal` (plain text without HTML tags) to minimize tokens
    comments = []
    next_page_token = None

    while len(comments) < 100:
        params = {
            "part": "snippet",
            "videoId": video_id,
            "maxResults": min(100, 100 - len(comments)),
            "order": "relevance",
            "key": API_KEY,
            "fields": "nextPageToken,items/snippet/topLevelComment/snippet(textOriginal,authorDisplayName,likeCount,publishedAt)",
        }

        if next_page_token:
            params["pageToken"] = next_page_token

        response = requests.get(
            f"{BASE_URL}/commentThreads",
            params=params,
            timeout=10,
        )
        response.raise_for_status()

        data = response.json()

        for item in data.get("items", []):
            comment = item.get("snippet", {}).get("topLevelComment", {}).get("snippet", {})
            text = comment.get("textOriginal", "").strip()
            if text:
                comments.append({
                    "text": text,
                    "author": comment.get("authorDisplayName", ""),
                    "likes": comment.get("likeCount", 0),
                    "published_at": comment.get("publishedAt", ""),
                })

        next_page_token = data.get("nextPageToken")

        if not next_page_token:
            break

    return {
        "video_id": video_id,
        "title": title,
        "description": description,
        "comments": comments,
    }


def _ensure_deno() -> bool:
    """Return True if the `deno` executable is on PATH, False otherwise."""
    return shutil.which("deno") is not None


def _clean_vtt(vtt_path: Path) -> str:
    """
    Convert a raw VTT subtitle file into a timestamped transcript.

    Parses cue start times, deduplicates YouTube's progressive rolling captions,
    and formats them into ~15-second timestamped blocks (e.g. '[01:23] text...').
    This gives downstream models exact timestamp references for every spoken line.
    """
    with open(vtt_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    def _parse_ts(ts_str: str) -> tuple[str, int]:
        parts = ts_str.strip().split(":")
        if len(parts) == 3:
            h, m, s = parts
            sec = int(h) * 3600 + int(m) * 60 + float(s)
        elif len(parts) == 2:
            m, s = parts
            sec = int(m) * 60 + float(s)
        else:
            sec = float(parts[0])
        mins = int(sec // 60)
        secs = int(sec % 60)
        return f"{mins:02d}:{secs:02d}", int(sec)

    time_regex = re.compile(r"(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->")

    cues: list[tuple[str, int, str]] = []
    curr_ts = "00:00"
    curr_sec = 0

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")):
            continue
        m = time_regex.search(line)
        if m:
            curr_ts, curr_sec = _parse_ts(m.group(1))
            continue

        clean = re.sub(r"<[^>]+>", "", line)
        clean = html.unescape(clean).strip()
        if not clean:
            continue

        # Deduplicate YouTube's rolling caption pattern
        if cues and clean.startswith(cues[-1][2]):
            cues[-1] = (cues[-1][0], cues[-1][1], clean)
        elif cues and cues[-1][2].startswith(clean):
            continue
        elif not cues or clean != cues[-1][2]:
            cues.append((curr_ts, curr_sec, clean))

    if not cues:
        return ""

    # Group into ~15-second blocks with [MM:SS] tags
    grouped_blocks: list[str] = []
    last_block_sec = -999
    curr_block_text: list[str] = []
    curr_block_ts = "00:00"

    for ts, sec, text in cues:
        if sec - last_block_sec >= 15:
            if curr_block_text:
                grouped_blocks.append(f"[{curr_block_ts}] " + " ".join(curr_block_text))
            curr_block_ts = ts
            last_block_sec = sec
            curr_block_text = [text]
        else:
            curr_block_text.append(text)

    if curr_block_text:
        grouped_blocks.append(f"[{curr_block_ts}] " + " ".join(curr_block_text))

    return "\n".join(grouped_blocks)


def _check_captions(url: str, lang: str = "en") -> str | None:
    """
    Download auto-generated captions for a YouTube video via yt-dlp and
    return the cleaned transcript as a plain string, or None if unavailable.

    Strategy:
      Attempt 1 — yt-dlp without --remote-components (no Deno needed).
                  Works for the majority of videos.
      Attempt 2 — yt-dlp with --remote-components ejs:github (requires Deno).
                  Fallback for videos behind YouTube's JS challenge protection.

    Args:
        url:  Full YouTube URL or raw video ID.
        lang: BCP-47 language code for the subtitle track (default: 'en').

    Returns:
        Cleaned transcript string, or None if no captions are available.
    """
    video_id = _extract_video_id(url)
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"

    with tempfile.TemporaryDirectory(prefix="yt_subs_") as tmp_dir:

        output_template = str(Path(tmp_dir) / "%(id)s.%(ext)s")

        # Base yt-dlp arguments shared by both attempts.
        #
        # Key decisions vs the original approach:
        #   - No --extractor-args: the TV/embedded client restriction caused
        #     silent failures when no JS runtime (Deno) is present. The default
        #     web client works fine for subtitle-only requests.
        #   - --sub-format vtt/best instead of --convert-subs vtt: native VTT
        #     download requires no ffmpeg. --convert-subs would silently drop
        #     the file if ffmpeg is missing.
        #   - --sub-lang en.* matches en, en-orig, en-US, etc.
        #   - --write-sub in addition to --write-auto-sub captures manually
        #     uploaded subtitle tracks too.
        base_args = [
            sys.executable, "-m", "yt_dlp",
            "--write-auto-sub",             # auto-generated captions
            "--write-sub",                  # also grab manual subs if present
            "--skip-download",
            "--sub-lang", f"{lang}.*",      # en.* → en, en-orig, en-US, etc.
            "--sub-format", "vtt/best",     # prefer native VTT — no ffmpeg needed
            "--output", output_template,
            "--quiet",
            "--no-warnings",
        ]

        # ── Attempt 1: no Deno required ─────────────────────────────────────
        subprocess.run(
            base_args + [canonical_url],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

        vtt_files = list(Path(tmp_dir).glob("*.vtt"))

        # ── Attempt 2: with --remote-components (Deno needed) ───────────────
        if not vtt_files and _ensure_deno():
            subprocess.run(
                base_args + ["--remote-components", "ejs:github", canonical_url],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            vtt_files = list(Path(tmp_dir).glob("*.vtt"))

        if not vtt_files:
            return None

        transcript = _clean_vtt(vtt_files[0])
        return transcript if transcript else None




def _download_audio(
    url: str,
    output_dir: str | None = None,
    max_seconds: int | None = None,
) -> str:
    """Download the audio track of a YouTube video using yt-dlp.

    Used as a fallback when no caption track is available, so the audio
    can be passed to a speech-to-text API (e.g. Groq Whisper).

    Args:
        url:         Full YouTube video URL or video ID.
        output_dir:  Directory to save the audio file. Defaults to a
                     system temp directory that persists until the caller
                     deletes it.
        max_seconds: If set, only download this many seconds from the start
                     of the video (e.g. 300 for the first 5 minutes).
                     Pass None to download the full audio track.

    Returns:
        Absolute path to the downloaded audio file (.m4a).

    Raises:
        RuntimeError: If yt-dlp fails to download the audio.
    """
    video_id = _extract_video_id(url)
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"

    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="yt_audio_")

    output_template = os.path.join(output_dir, f"{video_id}.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "web"]
            }
        },
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "m4a",
            "preferredquality": "128",
        }],
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "retries": 3,
        "fragment_retries": 3,
    }

    # Trim to first max_seconds without downloading the rest of the stream
    if max_seconds is not None:
        ydl_opts["download_ranges"] = yt_dlp.utils.download_range_func(
            None, [(0, max_seconds)]
        )
        ydl_opts["force_keyframes_at_cuts"] = False

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(canonical_url, download=True)

        audio_path = os.path.join(output_dir, f"{video_id}.m4a")

        if not os.path.exists(audio_path):
            for fname in os.listdir(output_dir):
                if fname.startswith(video_id):
                    audio_path = os.path.join(output_dir, fname)
                    break

        if not os.path.exists(audio_path):
            raise RuntimeError(f"Audio file not found after download in {output_dir!r}")

        return audio_path

    except yt_dlp.utils.DownloadError as e:
        raise RuntimeError(f"yt-dlp failed to download audio: {e}") from e