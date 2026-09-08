"""
email_generation/generate_email.py
----------------------------------
Generates personalized creator outreach emails using Antigravity CLI (agy)
powered by Gemini 3.1 Pro and the workspace skills:

  - /fylint-agency        : Fylint context, brokerage model (no upfront fees)
  - /video-personalization: Viewer-accessible hooks, comment cross-checking
  - /safwan-voice         : Safwan's authentic tone, jokes, 'quick chat' CTA
  - /cold-email           : Short, peer-level B2B cold outreach structure
  - /influencer-marketing : Creator partnership fit and rate alignment
  - /spam-word-checker    : Deliverability and spam trigger guardrails

Pipeline:
  YouTube URL / Video Data
             ↓
  transcript.py (Title, Description, Comments, Captions/Transcript)
             ↓
  Find Personalization Hook (comment-backed vs transcript-only)
             ↓
  Generate Cold Outreach Email via agy (Gemini 3.1 Pro)
"""

import os
import sys
import shutil
import subprocess
import re
from pathlib import Path
from typing import Any

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Ensure main-tool/ root is on sys.path
_MAIN_TOOL = Path(__file__).resolve().parent.parent
if str(_MAIN_TOOL) not in sys.path:
    sys.path.insert(0, str(_MAIN_TOOL))

# Workspace root (where .agents/skills/ reside)
_WORKSPACE_ROOT = _MAIN_TOOL.parent

from email_generation.transcript import get_video_data


def _find_agy_executable() -> str:
    """Locate the agy executable on PATH or in standard user installation locations."""
    # 1. PATH lookup
    agy_path = shutil.which("agy") or shutil.which("agy.exe")
    if agy_path:
        return agy_path

    # 2. Known standard Windows install paths
    user_home = Path.home()
    candidates = [
        user_home / "AppData" / "Local" / "agy" / "bin" / "agy.exe",
        user_home / ".gemini" / "antigravity" / "bin" / "agy.exe",
        user_home / ".agy" / "bin" / "agy.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    raise FileNotFoundError(
        "Antigravity CLI (agy) executable not found. "
        "Ensure 'agy' is installed and available in PATH."
    )


def _format_comments_block(comments: list[dict[str, Any]], max_comments: int = 15) -> str:
    """Format top comments into a readable block for the prompt."""
    if not comments:
        return "No comments available."

    lines = []
    for i, c in enumerate(comments[:max_comments], 1):
        author = c.get("author", "viewer")
        likes = c.get("likes", 0)
        text = c.get("text", "").replace("\n", " ").strip()
        like_str = f" ({likes} likes)" if likes else ""
        lines.append(f"{i}. {author}{like_str}: {text}")
    return "\n".join(lines)


def _format_transcript_block(transcript: str | None, max_words: int = 2200) -> str:
    """Format transcript, truncating to max_words to stay well within command line limits."""
    if not transcript:
        return "No transcript available. Use video title, description, and comments only."

    words = transcript.split()
    if len(words) > max_words:
        return " ".join(words[:max_words]) + " ... [transcript truncated for brevity]"
    return transcript


def build_agy_prompt(video_data: dict[str, Any]) -> str:
    """
    Construct the comprehensive prompt for agy invoking the relevant skills.
    """
    title = video_data.get("title", "Untitled Video")
    video_id = video_data.get("video_id", "")
    description = (video_data.get("description") or "")[:1000].strip()
    comments_block = _format_comments_block(video_data.get("comments", []))
    transcript_block = _format_transcript_block(video_data.get("transcript"))

    prompt = f"""/fylint-agency /video-personalization /safwan-voice /cold-email /influencer-marketing /spam-word-checker

You are an expert influencer marketer writing outreach emails on behalf of Safwan at Fylint (fylint.com).
Your task is two-fold:
1. Find high-converting personalization hooks from the video details below.
2. Draft a personalized cold outreach email to the creator offering brand sponsorship representation.

TARGET VIDEO DETAILS:
- Title: {title}
- Video ID: {video_id}
- Description: {description or 'N/A'}
- Top Comments:
{comments_block}

- Transcript (first 5 minutes):
{transcript_block}

INSTRUCTIONS:

### Step 1: Find Personalization Hooks
- Read the timestamped transcript and top comments. Look for a specific, memorable moment that bridges to the creator's value (e.g. how clearly they explain difficult concepts, an opinion their audience strongly agreed with, a unique workflow or aesthetic, a relatable perspective).
- CRITICAL: Reject throwaway jokes or isolated trivia (like cookie preferences or random tangents) that cannot logically connect to why sponsors want them.
- Apply the 'a person would know' filter: avoid dry changelog summaries or deep-cut technical jargon. Pick something a real viewer watching once would actually remember.
- Cross-check against top comments:
  - If a top comment reacted to the same moment, tag it [comment-backed].
  - If only in transcript, tag it [transcript-only].
- For each of the 2-3 hook candidates, provide:
  1. The hook copy written in Safwan's voice that naturally bridges into the creator's content value. Tagged `[comment-backed]` or `[transcript-only]`.
  2. **Timestamp Range**: The exact time range where this occurs based on the [MM:SS] cues in the transcript (e.g. `08:14 – 08:45`).
  3. **Clickable Link**: Direct URL with timestamp parameter: `https://www.youtube.com/watch?v={video_id}&t={{start_seconds}}s` (convert start MM:SS to total seconds, e.g. 01:26 -> 86s).
  4. **What happens in this clip**: 1-2 plain, factual sentences describing what the creator physically demonstrates or says at that moment. (Safwan hasn't watched the whole video himself — this gives him instant clarity so he never sounds like he's faking it).
- State which hook is recommended as the lead and why.

### Step 2: Generate 3 Distinct Outreach Email Drafts
- STRICT LENGTH: Each email must be 50 to 80 words total (Absolute maximum 90 words). The shorter the email, the higher the reply rate.
- Subject Lines (Provide 3 completely distinct, video-specific options):
  - BANNED SALES WORDS: Never use generic agency/sales words like 'sponsorships', 'sponsorship', 'partnerships', 'collab', 'brand deals', 'business inquiry', 'proposal'.
  - BANNED FILLER TEMPLATES: NEVER use generic canned subject lines:
    * "doing it the hard way" / "a simpler way" / "the easy way"
    * "quick thought safwan" / "5 mins? safwan" / "2 mins?" (NEVER put the sender's own name "Safwan" in the subject line!)
    * "fix this one thing" / "save this email" / "inbox noise"
    * "quick question" / "quick chat" / "quick thought"
  - DYNAMIC GENERATION REQUIREMENT:
    All 3 subject lines MUST be 100% tailored to the actual video topic, tools, and workflows (2–4 words, all lowercase):
    * Primary (Tool / Feature Focus): 2–3 words referencing a specific feature, tool, or prompt mechanism demonstrated in the video.
    * Alternative 1 (Workflow / Demo Focus): 2–3 words referencing the creator's specific workflow or real-world example used in the tutorial.
    * Alternative 2 (Niche Integration Inquiry): 2–4 words referencing integrations or tools in this specific niche (e.g. ai tools, dev workflow, tutorial tooling) without sales buzzwords.
  - Provide 1 primary subject line and 2 alternative options. All 3 must be completely unique and specific to this creator's video.

- ZERO BOILERPLATE & BANNED STOCK CLICHÉS:
  The following phrases are strictly BANNED because they sound like automated agency templates:
  - "vetted B2B brands" / "vetted B2B software brands"
  - "lowball inbox pitches" / "skip lowball pitches" / "sorting through lowball offers" / "inbox pitches"
  - "line up B2B sponsors" / "line up sponsors"
  - "negotiation back-and-forth" / "skip the negotiation"
  - "stay 100% focused on creating content" / "focus on making videos"
  - "so you don't have to waste time"
  - "Worth a quick chat?" / "Worth exploring for your next video?" / "Curious to see what that looks like?"

- STRICT HONESTY — ZERO FABRICATED SPONSORS:
  NEVER claim to have active brand clients, signed budgets, or specific companies waiting (e.g. BANNED: "I have a couple AI tools looking for integrations", "A brand asked me to reach out to you"). Safwan represents creators to pitch their channels to B2B brands and negotiate deals; he does NOT have pre-signed contracts in hand.

- DRAFTS VARIETY REQUIREMENT:
  Generate THREE (3) completely distinct outreach email drafts (Draft A, Draft B, Draft C). Each draft must pair with a different hook from Step 1, take a completely different angle on the partnership, use fresh phrasing and vocabulary, and end with a uniquely tailored CTA:

  * **Draft A: Viewer Trust & Monetization Angle** (pairs with Hook 1)
    - Hook: Bridge from Hook 1 directly to the creator's audience trust.
    - Offer: 1 casual sentence framing how high tutorial retention / instructional clarity positions the channel to command premium flat sponsorship rates rather than standard affiliate cuts.
    - CTA: Tailored question asking about their sponsorship pricing benchmarks or rate structure (answerable in 1 word).

  * **Draft B: Software Category Fit Angle** (pairs with Hook 2)
    - Hook: Bridge from Hook 2 into the specific software category relevant to this tutorial (e.g. dev tooling, workflow automation, AI apps).
    - Offer: 1 casual sentence explaining that Safwan pitches tech channels directly to software companies in that exact space to secure integration spots.
    - CTA: Tailored question asking if they'd be open to seeing a couple company ideas that fit their upcoming videos.

  * **Draft C: Production Pipeline & Calendar Angle** (pairs with Hook 3)
    - Hook: Bridge from Hook 3 into the creator's upcoming production flow.
    - Offer: 1 casual sentence offering to represent their channel and pitch upcoming video topics to relevant brands ahead of time.
    - CTA: Tailored question asking if they have any open integration slots in their upcoming recording schedule.

- Structure for each draft:
  - Greeting: "Hey [Name],"
  - Paragraph 1: Hook & Bridge (~25-35 words)
  - Paragraph 2: Honest Creator Benefit (~15-20 words, no banned clichés)
  - CTA: Dynamic, low-friction closing question (~5-10 words, answerable in 1 word)
  - Sign-off: "Best, Safwan | Fylint"

### Step 3: The Last Look
Before finalizing, verify:
1. Is each email strictly between 50 and 80 words?
2. Did any draft use ANY of the banned stock clichés ("lowball inbox pitches", "vetted B2B brands", "negotiation back-and-forth", "Worth a quick chat?")? If yes, rewrite it completely!
3. Are all 3 drafts genuinely different in phrasing, angle, and CTA?
4. Are all claims 100% honest (no phantom sponsors or fake budgets)?
5. Would a stranger know I watched the video?
6. Could the creator reply to each CTA with a single word?
7. Did any subject line use banned templates ("doing it the hard way", "quick thought safwan", "the easy way", "a simpler way")? Are all 3 subject lines 100% unique and specific to the tools and workflows in this video?

Format your response clearly with:
### 1. Personalization Hooks
- **Hook 1** `[comment-backed / transcript-only]`: "..."
  - **Timestamp:** MM:SS – MM:SS
  - **Video Link:** https://www.youtube.com/watch?v={video_id}&t=...s
  - **What happens:** ...
(repeat for Hook 2 & 3)

**Recommendation:** ...

### 2. Subject Line Options
- **Primary:** ...
- **Alternative 1:** ...
- **Alternative 2:** ...

### 3. Outreach Drafts
#### Option A (Monetization & Flat Rates):
...

#### Option B (Software Category Fit):
...

#### Option C (Production Pipeline):
...
"""
    return prompt.strip()


def generate_hook_and_email(
    video_data: dict[str, Any],
    model: str = "gemini-3.1-pro-high",
    timeout: int = 180,
) -> dict[str, Any]:
    """
    Run the hook and email generation via agy subprocess with the specified model.

    Args:
        video_data: Video data dictionary from transcript.py (or get_video_data).
        model: Model identifier in agy (default: 'gemini-3.1-pro-high').
        timeout: Subprocess timeout in seconds.

    Returns:
        {
            "video_id": str,
            "title": str,
            "model_used": str,
            "raw_output": str,
            "hooks": str,
            "subject_lines": str,
            "email": str,
        }
    """
    agy_exe = _find_agy_executable()
    prompt = build_agy_prompt(video_data)

    cmd = [
        agy_exe,
        "--add-dir", str(_WORKSPACE_ROOT),
        "-p", prompt,
        "--model", model,
    ]

    print(f"\n[AI] Running Antigravity CLI (agy) with model: {model} …")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(f"agy execution timed out after {timeout} seconds") from e

    if result.returncode != 0:
        err_msg = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"agy failed with exit code {result.returncode}: {err_msg}")

    output = result.stdout.strip()

    # Parse sections if formatted with standard headers
    hooks_section = ""
    subject_section = ""
    email_section = ""

    draft_split = re.split(r"### 3\.\s+Outreach Drafts?", output)
    if len(draft_split) > 1:
        email_section = draft_split[1].strip()
        before_draft = draft_split[0]

        if "### 2. Subject Line Options" in before_draft:
            parts_2 = before_draft.split("### 2. Subject Line Options")
            subject_section = parts_2[1].strip()
            if "### 1. Personalization Hooks" in parts_2[0]:
                hooks_section = parts_2[0].split("### 1. Personalization Hooks")[1].strip()
            else:
                hooks_section = parts_2[0].strip()
        else:
            hooks_section = before_draft.strip()
    elif "### 1. Personalization Hooks" in output and "### 2. Outreach Draft" in output:
        parts = output.split("### 2. Outreach Draft")
        hooks_part = parts[0].split("### 1. Personalization Hooks")[-1]
        hooks_section = hooks_part.strip()
        email_section = parts[1].strip()
    else:
        hooks_section = output
        email_section = output

    return {
        "video_id": video_data.get("video_id", ""),
        "title": video_data.get("title", ""),
        "model_used": model,
        "raw_output": output,
        "hooks": hooks_section,
        "subject_lines": subject_section,
        "email": email_section,
    }


def run_pipeline(
    url_or_id: str,
    model: str = "gemini-3.1-pro-high",
) -> dict[str, Any]:
    """
    End-to-end pipeline:
      YouTube URL -> YouTube Data API & Captions -> agy -> Hook & Cold Email
    """
    print("=" * 60)
    print("  Fylint YouTube Outreach Pipeline")
    print("=" * 60)

    # 1. Fetch details, comments, captions/transcript
    video_data = get_video_data(url_or_id)

    # 2. Generate hook and email via agy
    generation_result = generate_hook_and_email(video_data, model=model)

    return {**video_data, **generation_result}


def _print_pipeline_result(result: dict[str, Any]) -> None:
    """Nicely print the generated hooks and email to console."""
    print("\n" + "═" * 60)
    print(f"  TARGET: {result.get('title', 'Unknown')}")
    print(f"  URL   : https://www.youtube.com/watch?v={result.get('video_id', '')}")
    print(f"  SOURCE: {result.get('source', 'unknown')}")
    print("═" * 60 + "\n")

    if result.get("raw_output"):
        print(result["raw_output"])
    print("\n" + "═" * 60 + "\n")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_url = sys.argv[1].strip()
    else:
        target_url = input("Enter YouTube URL or Video ID: ").strip()

    if not target_url:
        print("No URL provided. Exiting.")
        sys.exit(1)

    res = run_pipeline(target_url)
    _print_pipeline_result(res)
