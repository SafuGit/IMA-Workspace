# Transcript + Top Comments

Two separate data sources, both needed for a good hook: the transcript (what was said/shown) and the top comments (what actually landed with the audience).

## Transcript

Use a captions library rather than a SERP API — `youtube-transcript-api` (Python) is the simplest option:

```python
from youtube_transcript_api import YouTubeTranscriptApi

video_id = "y-vWWYP3q3g"  # from the URL
transcript = YouTubeTranscriptApi.get_transcript(video_id)
full_text = " ".join(chunk["text"] for chunk in transcript)
```

Not every video has captions (auto-generated or manual). If this fails, fall back to describing the video from its title/description/thumbnail via the SERP API result, and lean more heavily on comments for signal, and flag in the output that the hook is lower-confidence without a transcript.

## Top comments

Use the YouTube Data API v3 `commentThreads` endpoint, sorted by `relevance` (YouTube's own "top comments" ranking, not chronological):

```
GET https://www.googleapis.com/youtube/v3/commentThreads
  ?part=snippet
  &videoId=<video_id>
  &order=relevance
  &maxResults=20
  &key=<YOUTUBE_API_KEY>
```

Pull the top ~10-20. You're looking for:
- Repeated reactions to the same moment/joke/opinion (signals what actually resonated)
- Anything the creator themselves replied to (heart/pinned comments carry extra weight)
- General sentiment/tone of the audience, useful context even without a specific callback

## Combining them

`scripts/fetch_video_data.py` wraps both calls and returns:

```json
{
  "video_id": "...",
  "title": "...",
  "transcript": "...",
  "top_comments": ["...", "..."]
}
```

Feed this JSON into the SKILL.md workflow rather than raw API responses — it's already the shape the hook-extraction step expects.
