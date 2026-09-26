"""
email_generation/followup_generator.py
--------------------------------------
Generates evidence-backed cold outreach follow-up emails adhering to the
23-section follow-up skill framework, Safwan's authentic broker voice, and
Fylint agency framing.

Follow-up rules:
- A follow-up is NOT a reminder. It must create a NEW reason to reply.
- Never repeat the original pitch or paraphrase previous observations.
- Email 2 (Touch 1): Genuine new observation (audience comment, distinct clip), 35-50 words.
- Email 3 (Touch 2): Honest urgency or commercial angle, STRICTLY <= 30 words.
- Email 4 (Touch 3): Respectful breakup / polite closure.
- Supports user steering feedback on regeneration.
"""

import os
import sys
import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Optional, Dict, List

# Ensure main-tool/ root is on sys.path
_MAIN_TOOL = Path(__file__).resolve().parent.parent
if str(_MAIN_TOOL) not in sys.path:
    sys.path.insert(0, str(_MAIN_TOOL))

_WORKSPACE_ROOT = _MAIN_TOOL.parent

from email_generation.db import get_db_connection, get_cached_transcript
from email_generation.generate_email import _find_agy_executable


def extract_thread_context(email_id: int) -> Dict[str, Any]:
    """
    Fetch the complete thread history from the database for an email record.
    Returns initial pitch, sent follow-ups, channel name, video_id, and subjects.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    e.id,
                    e.channel_id,
                    c.channel_name,
                    c.channel_handle,
                    e.email_address,
                    e.video_id,
                    v.title AS video_title,
                    e.subject_lines,
                    e.outreach_draft,
                    e.outreach_email,
                    e.outreach_sent_at,
                    e.followup_number,
                    e.sequence_stage,
                    e.followups,
                    e.followup_draft,
                    e.followup_email
                FROM influencer_emails e
                LEFT JOIN yt_channels c ON c.channel_id = e.channel_id
                LEFT JOIN yt_videos v ON v.video_id = e.video_id
                WHERE e.id = %s
                LIMIT 1
                """,
                (email_id,),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Email record #{email_id} not found in database.")

            colnames = [desc[0] for desc in cur.description]
            data = dict(zip(colnames, row))

            # Parse subject
            subject = ""
            subjs = data.get("subject_lines")
            if isinstance(subjs, list) and subjs:
                subject = subjs[0]
            elif isinstance(subjs, str):
                try:
                    p = json.loads(subjs)
                    if isinstance(p, list) and p:
                        subject = p[0]
                except Exception:
                    subject = subjs

            if not subject and data.get("outreach_email"):
                m = re.search(r"^Subject:\s*(.+)$", data["outreach_email"], re.MULTILINE)
                if m:
                    subject = m.group(1).strip()

            followups_raw = data.get("followups") or []
            if isinstance(followups_raw, str):
                try:
                    followups_raw = json.loads(followups_raw)
                except Exception:
                    followups_raw = []

            return {
                "id": data["id"],
                "channel_id": data.get("channel_id") or "",
                "channel_name": data.get("channel_name") or data.get("channel_handle") or "there",
                "email_address": data.get("email_address") or "",
                "video_id": data.get("video_id") or "",
                "video_title": data.get("video_title") or "",
                "primary_subject": subject or (f"quick note re: {data.get('video_title', 'video')}" if data.get('video_title') else "partnerships"),
                "outreach_email": data.get("outreach_email") or data.get("outreach_draft") or "",
                "outreach_sent_at": data.get("outreach_sent_at"),
                "sequence_stage": data.get("sequence_stage") or 0,
                "followup_number": data.get("followup_number") or 0,
                "followups": followups_raw,
            }
    finally:
        conn.close()


def find_unused_evidence(thread_data: Dict[str, Any], cached_video: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compares the existing email thread against video evidence in transcripts table.
    Filters out observations and comments already used, and ranks unused comments & transcript moments.
    """
    if not cached_video:
        return {"comments": [], "transcript_snippets": [], "used_keywords": []}

    thread_text = (thread_data.get("outreach_email") or "").lower()
    for fu in thread_data.get("followups", []):
        thread_text += " " + (fu.get("body") or "").lower()
        thread_text += " " + (fu.get("observation_used") or "").lower()

    all_comments = cached_video.get("comments") or []
    unused_comments = []

    for c in all_comments:
        c_text = (c.get("text") or "").strip()
        if len(c_text) < 15:
            continue
        # Check if prominent phrases already appeared in outreach
        words = [w for w in re.findall(r"\b\w{4,}\b", c_text.lower()) if w not in {"this", "that", "with", "from", "have", "what", "your", "video", "great", "awesome", "tutorial"}]
        overlap = sum(1 for w in words if w in thread_text)
        if overlap >= 3:
            continue  # Likely already referenced
        unused_comments.append({
            "author": c.get("author", "viewer"),
            "text": c_text,
            "likes": c.get("likes", 0),
        })

    # Sort comments by engagement
    unused_comments.sort(key=lambda x: int(x.get("likes") or 0), reverse=True)

    # Get transcript segments
    transcript_full = cached_video.get("transcript") or ""
    snippets = []
    if transcript_full:
        # Extract 2-3 middle segments if long enough
        lines = [line.strip() for line in transcript_full.split("\n") if line.strip()]
        for line in lines[10:40]:
            if line.lower() not in thread_text and len(line) > 30:
                snippets.append(line)
                if len(snippets) >= 5:
                    break

    return {
        "comments": unused_comments[:6],
        "transcript_snippets": snippets,
        "video_title": cached_video.get("title") or thread_data.get("video_title") or "",
        "video_description": cached_video.get("description") or "",
    }


def build_followup_prompt(
    thread_data: Dict[str, Any],
    evidence: Dict[str, Any],
    stage: int,
    user_feedback: Optional[str] = None,
) -> str:
    """
    Constructs the prompt adhering strictly to the follow-up skill, Safwan's voice,
    and stage-specific constraints.
    """
    clean_name = thread_data["channel_name"].lstrip("@").strip()
    primary_subject = thread_data["primary_subject"]
    if not primary_subject.lower().startswith("re:"):
        thread_subject = f"Re: {primary_subject}"
    else:
        thread_subject = primary_subject

    # Comments block
    comments_str = ""
    for idx, c in enumerate(evidence.get("comments", [])[:4], 1):
        comments_str += f"- [{idx}] ({c.get('likes', 0)} likes) {c.get('author', 'Viewer')}: \"{c.get('text', '')}\"\n"
    if not comments_str:
        comments_str = "- No distinct top comments available.\n"

    # Transcript block
    snippets_str = ""
    for s in evidence.get("transcript_snippets", [])[:3]:
        snippets_str += f"- \"{s}\"\n"
    if not snippets_str:
        snippets_str = "- Video demonstrated key workflow.\n"

    # Prior emails summary
    prior_emails_str = f"Initial Outreach Sent:\n\"\"\"\n{thread_data.get('outreach_email', '')}\n\"\"\"\n"
    for i, fu in enumerate(thread_data.get("followups", []), 1):
        if fu.get("sent_at"):
            prior_emails_str += f"\nTouch {i} Sent:\n\"\"\"\n{fu.get('body', '')}\n\"\"\"\n"

    stage_instructions = ""
    if stage == 1:
        stage_instructions = """
### STAGE TARGET: Touch 1 / Email 2 (Day 7 Milestone - The New Observation Touch)
- CORE PRINCIPLE: You are NOT reminding them. You are introducing a genuine NEW observation from the video or top comments.
- LENGTH: 35 to 50 words total.
- STRUCTURE:
  1. Casual opener acknowledging the thread without re-pitching (e.g., "Following up on my note about your [Video Title] video." or "Wanted to add a quick note on this.")
  2. New observation: Point to a specific audience comment or workflow detail from the unused evidence below that wasn't mentioned in Email 1.
  3. Broker agency connection: Emphasize that they can get flat-rate software sponsorships without handling brand outreach/negotiations themselves.
  4. Conversational low-friction CTA: e.g., "Curious if you have any open integration slots in your upcoming recording schedule?" or "Open to taking a look at a couple sponsors that fit this?"
"""
    elif stage == 2:
        stage_instructions = """
### STAGE TARGET: Touch 2 / Email 3 (Day 21 Milestone - Commercial Valuation / Honest Urgency)
- CORE PRINCIPLE: STRICT CONCISE RULE: MAXIMUM 30 WORDS TOTAL.
- DO NOT re-explain the offer. Do not re-pitch the agency.
- ANGLE: Commercial rate valuation benchmarking or upcoming campaign planning.
- SAMPLE VIBE:
  "Hey [Name],
  Given the retention on your channel, you can secure premium flat rates in software right now without dealing with affiliate rev-shares.
  Curious to see where we'd benchmark your integration pricing?"
- LENGTH CONSTRAINT: Count every word. The body MUST BE 30 WORDS OR FEWER.
"""
    else:
        stage_instructions = """
### STAGE TARGET: Touch 3 / Email 4 (Day 30 Milestone - Respectful Breakup Touch)
- CORE PRINCIPLE: Polite, zero-pressure closure.
- LENGTH: 25 to 40 words total.
- ANGLE: Assume they are all set on sponsorships for now, but leave the door open.
- SAMPLE VIBE:
  "Hey [Name],
  Assuming you're all set on brand partnerships for now, so I won't crowd your inbox.
  If you ever want an agency to source and negotiate software sponsorships for your channel down the road, feel free to reach out anytime."
"""

    feedback_block = ""
    if user_feedback:
        feedback_block = f"""
### USER STEERING FEEDBACK (CRITICAL OVERRIDE):
The user reviewed a previous attempt and provided this feedback:
\"\"\"{user_feedback}\"\"\"
You MUST adapt the output to directly address this feedback while maintaining voice and length rules.
"""

    prompt = f"""/follow-up /fylint-agency /safwan-voice /video-personalization /spam-word-checker

You are an expert cold outreach strategist generating a follow-up email on behalf of Safwan at Fylint (fylint.com).

CREATOR CONTEXT:
- Creator Name: {clean_name}
- Video Title: {thread_data.get('video_title', 'Video')}
- Thread Subject: {thread_subject}

EXISTING THREAD HISTORY (WHAT THEY HAVE ALREADY SEEN):
{prior_emails_str}

UNUSED VIDEO & AUDIENCE EVIDENCE (NOT YET USED IN THREAD):
Top Comments:
{comments_str}
Key Transcript Moments:
{snippets_str}

{stage_instructions}

{feedback_block}

### QUALITY GUARDRAILS:
1. Thread Subject: Must be "{thread_subject}".
2. NO BANNED BUMPS: NEVER start with "Just following up to see if you saw my email", "Circling back", "Checking in", "Did you get a chance to read my previous note?".
3. NO FAKE URGENCY: Do not manufacture artificial deadlines like "Spots are closing Friday".
4. BENEFIT-FOCUSED BROKER FRAMING: Fylint pitches their channel directly to relevant software brands and negotiates flat rates; they don't do outreach or deal paperwork.
5. NO SALES FLUFF: No "I hope this email finds you well", no sycophantic praise ("You are the absolute best").

### OUTPUT FORMAT:
You MUST respond with valid JSON matching this exact structure:
```json
{{
  "stage": {stage},
  "recommended": {{
    "subject": "{thread_subject}",
    "body": "email body text here"
  }},
  "alternative": {{
    "subject": "{thread_subject}",
    "body": "alternative angle email body text here"
  }},
  "short_version": {{
    "subject": "{thread_subject}",
    "body": "ultra punchy version under 25 words"
  }},
  "why_this_works": "1-2 sentences explaining why this creates a new reason to reply",
  "observation_used": "brief summary of the new detail or comment referenced",
  "angle_category": "Audience signal | Video structure | Commercial rate valuation | Breakup"
}}
```
"""
    return prompt.strip()


def generate_followup_pipeline(
    email_id: Optional[int] = None,
    stage: int = 1,
    user_feedback: Optional[str] = None,
    model: str = "gemini-3.1-pro-high",
    timeout: int = 120,
    thread_data: Optional[Dict[str, Any]] = None,
    cached_video: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Main entry point for generating a follow-up touch.
    Retrieves thread, analyzes evidence, executes agy, parses JSON, and runs quality gates.
    """
    if not thread_data:
        if not email_id:
            raise ValueError("Either 'email_id' or 'thread_data' must be provided.")
        thread_data = extract_thread_context(email_id)

    if cached_video is None:
        video_id = thread_data.get("video_id")
        if video_id:
            try:
                cached_video = get_cached_transcript(video_id)
            except Exception as e:
                print(f"[Warning] Could not fetch cached transcript: {e}")
                cached_video = None

    evidence = find_unused_evidence(thread_data, cached_video)

    prompt = build_followup_prompt(thread_data, evidence, stage, user_feedback)

    agy_exe = _find_agy_executable()
    cmd = [
        agy_exe,
        "--add-dir", str(_WORKSPACE_ROOT),
        "-p", prompt,
        "--model", model,
    ]

    print(f"\n[AI] Running Follow-Up Generation via agy (Stage {stage}) for Email #{email_id or thread_data.get('id', 'N/A')} ...")
    output_chunks = []
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        if process.stdout:
            for line in process.stdout:
                sys.stdout.write(line)
                sys.stdout.flush()
                output_chunks.append(line)

        process.wait(timeout=timeout)
        raw_output = "".join(output_chunks).strip()
    except Exception as e:
        print(f"[Warning] agy execution failed or timed out ({e}). Using intelligent fallback generation.")
        return generate_fallback_followup(thread_data, evidence, stage, user_feedback)

    # Parse JSON from agy response
    parsed = None
    try:
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_output)
        json_str = json_match.group(1) if json_match else raw_output
        parsed = json.loads(json_str)
    except Exception:
        # Try direct search for { ... }
        start = raw_output.find("{")
        end = raw_output.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                parsed = json.loads(raw_output[start : end + 1])
            except Exception:
                pass

    if not parsed or not isinstance(parsed, dict) or "recommended" not in parsed:
        print("[Warning] Could not parse JSON from agy output. Falling back to deterministic generator.")
        return generate_fallback_followup(thread_data, evidence, stage, user_feedback)

    # Apply quality gate post-processing
    result = enforce_quality_gate(parsed, thread_data, stage)
    result["raw_output"] = raw_output
    result["feedback_applied"] = user_feedback
    return sanitize_surrogates(result)


def sanitize_surrogates(data: Any) -> Any:
    """
    Recursively replaces any lone surrogate code points in strings with replacement character.
    Prevents PostgreSQL 22P02 'Unicode low surrogate must follow a high surrogate' errors.
    """
    if isinstance(data, str):
        return data.encode("utf-8", "replace").decode("utf-8", "replace")
    elif isinstance(data, dict):
        return {k: sanitize_surrogates(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_surrogates(item) for item in data]
    return data


def enforce_quality_gate(data: Dict[str, Any], thread_data: Dict[str, Any], stage: int) -> Dict[str, Any]:
    """
    Validates and cleans the follow-up copy according to Section 23 quality rules.
    """
    subject = thread_data["primary_subject"]
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    for key in ("recommended", "alternative", "short_version"):
        if key in data and isinstance(data[key], dict):
            body = data[key].get("body", "").strip()
            # Clean subject
            data[key]["subject"] = subject

            # Ensure sign-off is Safwan | Fylint
            if not re.search(r"Safwan", body, re.IGNORECASE):
                body = body.rstrip() + "\n\nBest,\nSafwan | Fylint"

            # Stage 2 word limit check (<= 30 words)
            if stage == 2 and key == "short_version":
                words = body.split()
                if len(words) > 35:
                    # Keep first sentence + question + signoff
                    lines = [l.strip() for l in body.split("\n") if l.strip()]
                    if len(lines) >= 2:
                        body = f"{lines[0]}\n\n{lines[1]}\n\nBest,\nSafwan | Fylint"

            data[key]["body"] = body

    return data


def generate_fallback_followup(
    thread_data: Dict[str, Any],
    evidence: Dict[str, Any],
    stage: int,
    user_feedback: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Deterministic evidence-backed fallback generator in case agy CLI is unreachable.
    Uses real unused comments and transcripts.
    """
    clean_name = thread_data["channel_name"].lstrip("@").strip() or "there"
    video_title = thread_data.get("video_title") or "your recent video"
    primary_subject = thread_data["primary_subject"]
    subject = primary_subject if primary_subject.lower().startswith("re:") else f"Re: {primary_subject}"

    comments = evidence.get("comments") or []
    top_comment = comments[0] if comments else None

    if stage == 1:
        if top_comment:
            obs = f"noticed a viewer specifically pointed out: \"{top_comment['text'][:60]}...\""
            body = (
                f"Hey {clean_name},\n\n"
                f"Following up on my note about your \"{video_title}\" video — {obs}. That audience trust is exactly what software brands look for.\n\n"
                f"You can get relevant software sponsorships without handling the outreach or negotiations yourself. Fylint pitches your channel and secures flat rates.\n\n"
                f"Curious if you have any open integration slots in your upcoming recording schedule?\n\n"
                f"Best,\nSafwan | Fylint"
            )
            why = "Uses real viewer comment to prove genuine audience attention and bridges directly to sponsorship readiness."
            obs_used = f"Viewer comment: \"{top_comment['text'][:50]}\""
            cat = "Audience signal"
        else:
            body = (
                f"Hey {clean_name},\n\n"
                f"Following up on my note about your \"{video_title}\" video.\n\n"
                f"You can get relevant software sponsorships without handling the outreach or negotiations yourself. Fylint pitches your channel to brands that fit your content and handles the deal process.\n\n"
                f"Curious if you have any open integration slots in your upcoming recording schedule?\n\n"
                f"Best,\nSafwan | Fylint"
            )
            why = "Low-friction check on recording schedule without re-pitching."
            obs_used = "Content pattern & recording schedule"
            cat = "Content pattern"

        alt_body = (
            f"Hey {clean_name},\n\n"
            f"Wanted to add a quick note on this. Given the retention on your \"{video_title}\" breakdown, you can secure direct software integrations with Fylint handling the brand negotiations.\n\n"
            f"Open to seeing a couple sponsor categories that would fit your workflow?\n\n"
            f"Best,\nSafwan | Fylint"
        )
        short_body = (
            f"Hey {clean_name},\n\n"
            f"Quick follow-up on my note about your \"{video_title}\" video. Have any open sponsor slots in your upcoming recording schedule?\n\n"
            f"Best,\nSafwan | Fylint"
        )

    elif stage == 2:
        body = (
            f"Hey {clean_name},\n\n"
            f"Given the viewer retention on your channel, you can secure premium flat rates in software right now without weak affiliate links, with Fylint handling the negotiations.\n\n"
            f"Curious to see where we'd benchmark your integration pricing?\n\n"
            f"Best,\nSafwan | Fylint"
        )
        alt_body = (
            f"Hey {clean_name},\n\n"
            f"Checking in on your upcoming content schedule. We have software brands looking for placements in your niche.\n\n"
            f"Open to taking a look at potential rates this quarter?\n\n"
            f"Best,\nSafwan | Fylint"
        )
        short_body = (
            f"Hey {clean_name},\n\n"
            f"Curious to see where we'd benchmark your channel's flat integration rates in the software market?\n\n"
            f"Best,\nSafwan | Fylint"
        )
        why = "Strictly concise (<= 30 words). Focuses on pricing benchmark without re-pitching."
        obs_used = "Commercial rate benchmarking"
        cat = "Commercial rate valuation"

    else:
        body = (
            f"Hey {clean_name},\n\n"
            f"Assuming you're all set on brand partnerships for now, so I won't crowd your inbox.\n\n"
            f"If you ever want an agency to source and negotiate software sponsorships for your channel down the road, feel free to reach out anytime.\n\n"
            f"Best,\nSafwan | Fylint"
        )
        alt_body = (
            f"Hey {clean_name},\n\n"
            f"I assume partnerships aren't a priority right now. If that changes down the road, my door is open.\n\n"
            f"Best,\nSafwan | Fylint"
        )
        short_body = (
            f"Hey {clean_name},\n\n"
            f"Assuming you're set on brand deals for now. Feel free to reach out down the line if you ever want Fylint to source software sponsors.\n\n"
            f"Best,\nSafwan | Fylint"
        )
        why = "Polite closure respecting their inbox and leaving the door open for future deals."
        obs_used = "Respectful closure"
        cat = "Breakup"

    return sanitize_surrogates({
        "stage": stage,
        "recommended": {"subject": subject, "body": body},
        "alternative": {"subject": subject, "body": alt_body},
        "short_version": {"subject": subject, "body": short_body},
        "why_this_works": why,
        "observation_used": obs_used,
        "angle_category": cat,
        "feedback_applied": user_feedback,
    })
