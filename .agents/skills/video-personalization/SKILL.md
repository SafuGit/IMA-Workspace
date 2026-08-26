---
name: video-personalization
description: Research a target's YouTube video (via SERP API discovery + transcript + top comments) and extract a personalization hook for outreach — a detail an ordinary viewer would notice, not a technical deep-cut, cross-checked against what top comments actually reacted to. Use this whenever prepping an outreach email/DM that references a specific video, whenever the user says "find the personalization" or "find a hook" for a creator or brand, or whenever raw video data (transcript + comments) needs to become an actual usable email detail instead of a generic compliment. Always hand the resulting hook to the safwan-voice skill before it goes into a draft.
---

# Video Personalization Research

Turns a YouTube video into 2-3 usable personalization hooks for outreach — not a summary, not a technical breakdown, a detail a real viewer would remember.

## Pipeline

1. **Discover / resolve the video.** If given a URL, skip discovery. If given a creator name + topic, use a SERP API (e.g. SerpApi's YouTube or Google engine) to find the specific recent video. See `references/serp-api-usage.md`.
2. **Pull transcript + top comments.** SERP APIs return search results and metadata, not transcripts — get the transcript via a captions library and the top comments via the YouTube Data API. See `references/transcript-and-comments.md`. `scripts/fetch_video_data.py` does both in one call and returns a single JSON blob (title, transcript, top N comments sorted by relevance).
3. **Read the transcript for detail candidates, not a summary.** Do not write "this video covers X, Y, Z." Look for a specific moment: a joke, a strong opinion, an aside, a visible object/setup detail, a phrase repeated, something a person half-paying-attention would still remember. Reject candidates that require expert knowledge to appreciate (see the filter below).
4. **Cross-check against top comments.** If a comment independently reacts to the same moment you flagged, that's a stronger hook — it's community-validated, not just something you personally noticed. If the top comments cluster around a moment you hadn't flagged, consider it too. Note in your output which hooks (if any) are comment-backed.
5. **Write 2-3 hook candidates in Safwan's voice**, per `safwan-voice` skill rules — not a report, not a generic "great video!" line. Each candidate should be a sentence or two, ready to drop into an outreach draft, e.g. "loved the minimal dotfiles in your Arch/Hyprland video" — specific, short, not a technical dissertation.

## The "a person would know" filter

This is the most important rule. A hook fails if it requires:
- Reading documentation, changelogs, or source code to understand
- Recognizing a specific version number, config flag, or internal tool name a casual viewer wouldn't clock
- Domain expertise beyond "watched this video once, paying normal attention"

A hook passes if it's something like: a joke the creator made, an opinion they stated strongly, something visible in their setup/background, a callback to something they said, a reaction to a guest, a recurring bit/phrase, something relatable about their delivery or pacing.

Rule of thumb: if explaining the hook to someone requires a follow-up sentence of technical context, it's too deep. If they'd just get it, it's right.

## Avoiding AI slop

Do not write hook candidates or summaries using AI-tell phrasing. See `references/ai-slop-blocklist.md` for the specific list, but the short version: no "delve," "dive into," "unpack," "leverage," "game-changer," "elevate," "seamless," "in today's landscape," "it's worth noting," "isn't just X, it's Y" constructions, or generic superlatives ("amazing," "incredible," "phenomenal"). Write the hook the way Safwan would actually type it — see the `safwan-voice` skill's reference samples for the real register (contractions, comma-chained thoughts, understated rather than hyped).

## Output format

Return:
- Video title/URL
- 1-2 sentence factual summary (for your own context, not for the email)
- 2-3 hook candidates, each tagged `[comment-backed]` or `[transcript-only]`
- A one-line recommendation on which hook to lead with and why

Then, if the user wants the full draft, hand off to `safwan-voice` (and `cold-email` / `spam-word-checker` for structure/deliverability) rather than writing the email here.

## Evaluating output

See `evals/eval-cases.md` for test prompts and a qualitative checklist (no slop phrases, no over-technical detail, at least one comment cross-check attempted, sounds like a real person watched the video).
