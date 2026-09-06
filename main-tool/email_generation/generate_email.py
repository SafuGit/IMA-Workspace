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
- Read the transcript and top comments. Look for a specific, memorable moment (a relatable joke, a visible setup quirk, a strong opinion, an aside).
- Apply the 'a person would know' filter: avoid dry changelog summaries or deep-cut technical jargon. Pick something a real viewer watching once would actually remember.
- Cross-check against top comments:
  - If a top comment reacted to the same moment, tag it [comment-backed].
  - If only in transcript, tag it [transcript-only].
- Provide 2-3 concise hook candidates written in Safwan's voice.
- State which hook is recommended as the lead and why.

### Step 2: Generate Outreach Email
- Write a short cold email from Safwan to the creator.
- Subject line: 2-4 words, lowercase, internal-looking (e.g. 'channel sponsorships', 'quick question').
- Opener: Greet the creator by name or channel name ('Hey [Name],').
- Hook: Open with the recommended hook smoothly, using Safwan's light humor or shared identity as a fellow tech/builder enthusiast ('Jokes aside...', 'As a fellow...').
- Core Value: Introduce Fylint as a brokerage connecting tech/AI creators with B2B SaaS sponsors. Emphasize that there are NO upfront fees (we only get paid when a brand deal closes).
- CTA: Low-friction peer ask ('Worth a quick chat to see if we can line up some sponsors?').
- Sign-off: 'Best, Safwan | Fylint'.
- QA: Strictly follow spam-word-checker rules (no banned hype/pressure words, no marketing fluff).

### Step 3: The Last Look
Before finalizing the email draft, apply these eight non-mechanical checks to ensure the email gets answered:
1. Would a stranger know I watched the video? Not "did I mention the video". Would they know.
2. Is there one sentence here that only I could have written? If every sentence is one another drafter would also produce, the email is a template with good grammar.
3. Does the offer follow from the hook, or merely sit under it?
4. Would I be glad to receive this? Not flattered. Glad.
5. Is there anything in here that is about me? Cut it.
6. Could the creator reply with a single word? If answering takes thought, it will take a week.
7. Am I claiming anything I could not defend if they asked "how do you know?" That includes the read.
8. Does it sound composed? Composed is the tell. Read it aloud one more time.

Format your response clearly with:
### 1. Personalization Hooks
### 2. Outreach Draft
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
    email_section = ""

    if "### 1. Personalization Hooks" in output and "### 2. Outreach Draft" in output:
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
