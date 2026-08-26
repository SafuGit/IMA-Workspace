#!/usr/bin/env python3
"""
fetch_video_data.py — pulls transcript + top comments for a YouTube video
into a single JSON blob, ready for the video-personalization skill's
hook-extraction step.

Requires:
    pip install youtube-transcript-api google-api-python-client

Environment variables:
    YOUTUBE_API_KEY   - required for top comments
    SERPAPI_KEY       - optional, only needed if you're resolving a video
                        from a creator name/topic instead of a direct URL
                        (see references/serp-api-usage.md)

Usage:
    python3 fetch_video_data.py <video_id_or_url> [--comments N]
"""

import argparse
import json
import os
import re
import sys

from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi
from googleapiclient.discovery import build

load_dotenv()


def extract_video_id(url_or_id: str) -> str:
    match = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url_or_id)
    if match:
        return match.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url_or_id):
        return url_or_id
    raise ValueError(f"Couldn't extract a video ID from: {url_or_id}")


def get_transcript(video_id: str) -> str:
    try:
        chunks = YouTubeTranscriptApi.get_transcript(video_id)
        return " ".join(c["text"] for c in chunks)
    except Exception as e:
        print(f"[warning] transcript unavailable ({e}); continuing without it", file=sys.stderr)
        return ""


def get_top_comments(video_id: str, api_key: str, max_results: int = 20) -> list:
    if not api_key:
        print("[warning] YOUTUBE_API_KEY not set; skipping comments", file=sys.stderr)
        return []
    youtube = build("youtube", "v3", developerKey=api_key)
    try:
        response = (
            youtube.commentThreads()
            .list(part="snippet", videoId=video_id, order="relevance", maxResults=max_results)
            .execute()
        )
    except Exception as e:
        print(f"[warning] comments unavailable ({e})", file=sys.stderr)
        return []
    comments = []
    for item in response.get("items", []):
        snippet = item["snippet"]["topLevelComment"]["snippet"]
        comments.append(snippet["textDisplay"])
    return comments


def get_title(video_id: str, api_key: str) -> str:
    if not api_key:
        return ""
    youtube = build("youtube", "v3", developerKey=api_key)
    try:
        response = youtube.videos().list(part="snippet", id=video_id).execute()
        items = response.get("items", [])
        return items[0]["snippet"]["title"] if items else ""
    except Exception:
        return ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video", help="Video URL or ID")
    parser.add_argument("--comments", type=int, default=20, help="Number of top comments to fetch")
    args = parser.parse_args()

    video_id = extract_video_id(args.video)
    api_key = os.environ.get("YOUTUBE_API_KEY", "")

    result = {
        "video_id": video_id,
        "title": get_title(video_id, api_key),
        "transcript": get_transcript(video_id),
        "top_comments": get_top_comments(video_id, api_key, args.comments),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
