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


def _ensure_netscape_cookies(path: Path) -> None:
    """Ensure the cookies.txt file begins with the required Netscape header."""
    try:
        content = path.read_text(encoding="utf-8", errors="ignore").strip()
        if content and not content.startswith("# Netscape HTTP Cookie File"):
            header = "# Netscape HTTP Cookie File\n# https://curl.se/docs/http-cookies.html\n\n"
            path.write_text(header + content + "\n", encoding="utf-8")
    except Exception:
        pass


def _get_cookies_path() -> str | None:
    """Find a cookies.txt file if available for YouTube authentication."""
    cookies_path = os.getenv("YOUTUBE_COOKIES_PATH")
    if cookies_path and os.path.exists(cookies_path):
        _ensure_netscape_cookies(Path(cookies_path))
        return str(cookies_path)
    for candidate in [
        Path.cwd() / "cookies.txt",
        Path(__file__).resolve().parent.parent / "cookies.txt",
        Path(__file__).resolve().parent.parent.parent / "cookies.txt",
    ]:
        if candidate.exists():
            _ensure_netscape_cookies(candidate)
            return str(candidate)
    return None


def _get_session_with_cookies() -> requests.Session:
    """Build a requests.Session, loading cookies.txt if available."""
    session = requests.Session()
    session.headers.update({"Accept-Language": "en-US,en;q=0.9"})
    cookies_file = _get_cookies_path()
    if cookies_file:
        try:
            import http.cookiejar
            cj = http.cookiejar.MozillaCookieJar(cookies_file)
            cj.load(ignore_discard=True, ignore_expires=True)
            session.cookies = cj
        except Exception as e:
            print(f"      [cookies] Warning loading {cookies_file}: {e}")
    return session


def _format_snippets_into_blocks(snippets) -> str | None:
    if not snippets:
        return None
    grouped_blocks: list[str] = []
    last_block_sec = -999
    curr_block_text: list[str] = []
    curr_block_ts = "00:00"

    for s in snippets:
        sec = int(s.start)
        mins = sec // 60
        secs = sec % 60
        ts = f"{mins:02d}:{secs:02d}"
        text = s.text.replace("\n", " ").strip()
        if not text:
            continue

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

    return "\n".join(grouped_blocks) if grouped_blocks else None


def _fetch_from_api_instance(api, video_id: str, lang: str = "en"):
    tl = api.list(video_id)
    t = None
    try:
        t = tl.find_transcript([lang, f"{lang}-US", f"{lang}-GB", f"{lang}-orig"])
    except Exception:
        pass
    if not t:
        try:
            t = tl.find_generated_transcript([lang])
        except Exception:
            pass
    if not t:
        for item in tl:
            if getattr(item, "language_code", "").startswith(lang):
                t = item
                break
    if not t:
        t = next(iter(tl), None)
    if not t:
        return None
    return t.fetch()


def _fetch_captions_via_transcript_api(video_id: str, lang: str = "en") -> str | None:
    """Fetch captions using youtube_transcript_api with automatic proxy rotation on IpBlocked."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        print("      [captions] ⚠ youtube_transcript_api is not installed (run: pip install youtube-transcript-api)")
        return None

    # 1. First attempt: Direct / cookie-authenticated session
    try:
        session = _get_session_with_cookies()
        api = YouTubeTranscriptApi(http_client=session)
        snippets = _fetch_from_api_instance(api, video_id, lang)
        if snippets:
            return _format_snippets_into_blocks(snippets)
    except Exception as direct_err:
        is_ip_blocked = (
            "IpBlocked" in type(direct_err).__name__
            or "RequestBlocked" in type(direct_err).__name__
            or "blocking requests from your IP" in str(direct_err)
        )
        if not is_ip_blocked:
            print(f"      [captions] ⚠ Caption lookup error: {type(direct_err).__name__} - {direct_err}")
            return None
        print("      [captions] ⚠ VPS IP is blocked by YouTube. Rotating through proxy pool …")

    # 2. Second attempt: Rotate through proxies from PostgreSQL `proxies` table
    try:
        from .proxy_manager import get_active_proxies, record_proxy_result, seed_working_proxies
        from youtube_transcript_api.proxies import GenericProxyConfig

        proxies = get_active_proxies(limit=12)
        if not proxies:
            print("      [proxies] No active proxies in database. Auto-fetching fresh working proxies …")
            seed_working_proxies(max_to_find=8)
            proxies = get_active_proxies(limit=12)

        for p in proxies:
            proxy_url = f"{p['protocol']}://{p['ip']}:{p['port']}"
            try:
                cfg = GenericProxyConfig(http_url=proxy_url, https_url=proxy_url)
                api = YouTubeTranscriptApi(proxy_config=cfg)
                snippets = _fetch_from_api_instance(api, video_id, lang)
                if snippets:
                    record_proxy_result(p['id'], success=True)
                    print(f"      [proxies] ✅ Retrieved transcript via proxy ({p['ip']}:{p['port']})")
                    return _format_snippets_into_blocks(snippets)
            except Exception:
                record_proxy_result(p['id'], success=False)
                continue
    except Exception as e:
        print(f"      [proxies] Proxy rotation encountered an error: {e}")

    return None


def _check_captions(url: str, lang: str = "en") -> str | None:
    """
    Download auto-generated captions for a YouTube video and
    return the cleaned transcript as a plain string, or None if unavailable.

    Strategy:
      Attempt 0 — youtube_transcript_api (instant, works on VPS/datacenter IPs, no yt-dlp).
      Attempt 1 — yt-dlp without --remote-components (no Deno needed).
      Attempt 2 — yt-dlp with --remote-components ejs:github (requires Deno).

    Args:
        url:  Full YouTube URL or raw video ID.
        lang: BCP-47 language code for the subtitle track (default: 'en').

    Returns:
        Cleaned transcript string, or None if no captions are available.
    """
    video_id = _extract_video_id(url)

    # ── Attempt 0: youtube_transcript_api (fastest, no bot check) ───────────
    transcript_api_result = _fetch_captions_via_transcript_api(video_id, lang=lang)
    if transcript_api_result:
        return transcript_api_result

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
            "--sub-lang", f"{lang}.*,{lang}", # en.*, en
            "--sub-format", "vtt/best",     # prefer native VTT — no ffmpeg needed
            "--output", output_template,
            "--no-warnings",
        ]

        cookies_file = _get_cookies_path()
        if cookies_file:
            base_args.extend(["--cookies", cookies_file])

        # ── Attempt 1: no Deno required ─────────────────────────────────────
        proc1 = subprocess.run(
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
        "format": "bestaudio/best/ba*/b*",
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

    # Automatically detect cookies.txt to bypass datacenter bot detection
    cookies_file = _get_cookies_path()
    if cookies_file:
        ydl_opts["cookiefile"] = str(cookies_file)
    else:
        # Fallback clients when no cookies are provided
        ydl_opts["extractor_args"] = {
            "youtube": {
                "player_client": ["android", "web"]
            }
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