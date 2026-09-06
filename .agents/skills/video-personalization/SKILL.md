---
name: video-personalization
description: Research a target's YouTube video (via SERP API discovery + transcript + top comments) and extract a personalization hook for outreach — a detail an ordinary viewer would notice, not a technical deep-cut, cross-checked against what top comments actually reacted to. Use this whenever prepping an outreach email/DM that references a specific video, whenever the user says "find the personalization" or "find a hook" for a creator or brand, or whenever raw video data (transcript + comments) needs to become an actual usable email detail instead of a generic compliment. Always hand the resulting hook to the safwan-voice skill before it goes into a draft.
---

# Video Personalization Research

Turns a YouTube video into 2-3 usable personalization hooks for outreach — not a summary, not a technical breakdown, a detail a real viewer would remember.

## Pipeline

1. **Discover / resolve the video.** If given a URL, skip discovery. If given a creator name + topic, use a SERP API (e.g. SerpApi's YouTube or Google engine) to find the specific recent video. See `references/serp-api-usage.md`.
2. **Pull transcript + top comments.** SERP APIs return search results and metadata, not transcripts — get the transcript via a captions library and the top comments via the YouTube Data API. See `references/transcript-and-comments.md`. `scripts/fetch_video_data.py` does both in one call and returns a single JSON blob (title, transcript, top N comments sorted by relevance).
3. **Read the transcript for detail candidates that bridge to creator value.** Do not write "this video covers X, Y, Z." Look for a specific moment: a visible setup detail, a clear opinion, how they explained a difficult concept, or a relatable delivery style that their audience loved. Crucially: reject throwaway jokes or isolated trivia that cannot logically connect to their content quality or sponsor appeal. The offer must follow from the hook.
4. **Cross-check against top comments.** If a comment independently reacts to the same moment you flagged, that's a stronger hook — it's community-validated, not just something you personally noticed. If the top comments cluster around a moment you hadn't flagged (e.g. viewers praising how clear the tutorial was or asking what tools they use), consider it too. Note in your output which hooks (if any) are comment-backed.
5. **Write 2-3 hook candidates that flow naturally into the point**, per `safwan-voice` skill rules — not a report, not an isolated gag, not a generic "great video!" line. Each candidate should be a sentence or two that seamlessly bridges into why brands in their niche want to work with them or how their audience engages.

## The "a person would know" filter

This is the most important rule. A hook fails if it requires:
- Reading documentation, changelogs, or source code to understand
- Recognizing a specific version number, config flag, or internal tool name a casual viewer wouldn't clock
- Domain expertise beyond "watched this video once, paying normal attention"
- Relying on a throwaway joke that requires a clunky "Jokes aside" transition to get to business

A hook passes if it's something like: a visible detail in their setup/workflow, a relatable opinion, how they uniquely paced or simplified a concept, a community running joke that reflects strong audience loyalty, or something specific that proves real viewership and leads directly into sponsor fit.

Rule of thumb: if explaining the hook to someone requires a follow-up sentence of technical context, it's too deep. If they'd just get it, and it naturally sets up why brands want to work with them, it's right.

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
