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
    Convert a raw VTT subtitle file into a clean continuous text string.

    Strips timestamps, WebVTT headers, inline styling/timing tags (<c>,
    <00:00:00.000>), and deduplicates YouTube's progressive caption rolls
    (where each cue repeats the previous line plus one new word).
    """
    with open(vtt_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    tokens: list[str] = []

    for raw_line in lines:
        line = raw_line.strip()

        # Skip WebVTT structural lines
        if (
            not line
            or line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE"))
            or "-->" in line
        ):
            continue

        # Strip inline tags: <c>, </c>, <00:00:00.000>, <b>, etc.
        line = re.sub(r"<[^>]+>", "", line)
        line = html.unescape(line).strip()

        if not line:
            continue

        # Deduplicate YouTube's rolling caption pattern:
        #   cue N:   "hello world"
        #   cue N+1: "hello world how"   ← extends previous → replace
        #   cue N+2: "world how"         ← prefix of current → skip
        if tokens and line.startswith(tokens[-1]):
            tokens[-1] = line           # extend
        elif tokens and tokens[-1].startswith(line):
            continue                    # subset of what we already have
        elif not tokens or line != tokens[-1]:
            tokens.append(line)

    full_text = " ".join(tokens)
    return re.sub(r"\s+", " ", full_text).strip()


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
        ydl_opts["force_keyframes_at_cuts"] = True

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