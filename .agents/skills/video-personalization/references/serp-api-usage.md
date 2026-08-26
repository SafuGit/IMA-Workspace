# SERP API Usage

A SERP API (SerpApi, or similar) gives you search-engine results programmatically — useful for **discovery** (finding a specific video when you only have a creator name/topic, or finding a brand's recent sponsorship mentions). It does **not** return video transcripts or comments — those need separate calls (see `transcript-and-comments.md`).

## When to use this step

- You have a creator/brand name but not a specific video URL
- You want to find *which* recent video is the relevant one (e.g. "their most recent sponsored integration")
- You want to sanity-check whether a brand/creator partnership is public and how it's being talked about

If you already have the video URL, skip straight to transcript + comments.

## Example request (SerpApi, YouTube engine)

```
GET https://serpapi.com/search.json
  ?engine=youtube
  &search_query=<creator name> <topic, e.g. "Arch Hyprland">
  &api_key=<SERPAPI_KEY>
```

Response includes video results with `link`, `title`, `channel`, `published_date`, `views`, `length` — enough to pick the right video before pulling its transcript.

## Example request (SerpApi, Google engine — for brand/partnership discovery)

```
GET https://serpapi.com/search.json
  ?engine=google
  &q=<brand> sponsorship <creator OR "integration">
  &api_key=<SERPAPI_KEY>
```

Useful for the brand-outreach side: confirming a brand actively runs integration sponsorships and finding public writeups/LinkedIn posts (like Carlin's CTR/watch-time post) before pitching.

## Notes

- Store `SERPAPI_KEY` as an environment variable, never hardcoded
- Rate limits vary by plan — batch discovery queries rather than firing one per creator in a loop without checking your quota
- Discovery is a filter step, not the research itself — once you have the right URL, move to the transcript/comments step for the actual personalization material
