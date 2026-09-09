import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { EmailApiSettings, GeneratedEmailResponse, GeneratedHook, GeneratedDraft } from "@/lib/types";

function parseMarkdownOutput(output: string, videoId: string): {
  hooks: GeneratedHook[];
  recommendation?: string;
  subject_lines: { primary: string; alternative_1: string; alternative_2: string };
  drafts: Record<string, GeneratedDraft>;
} {
  const hooks: GeneratedHook[] = [];
  const subject_lines = { primary: "", alternative_1: "", alternative_2: "" };
  const drafts: Record<string, GeneratedDraft> = {};

  // 1. Parse Hooks
  const hookRegex = /-\s+\*\*Hook\s+\d+\*\*\s*(?:`?\[?(comment-backed|transcript-only)\]?`?)?:\s*"?([^\n"]+)"?\s*\n\s*-\s+\*\*Timestamp:?\*\*\s*([^\n]+)\s*\n\s*-\s+\*\*Video Link:?\*\*\s*([^\n]+)\s*\n\s*-\s+\*\*What happens:?\*\*\s*([^\n]+)/gi;
  let match: RegExpExecArray | null;
  let hookIndex = 1;

  while ((match = hookRegex.exec(output)) !== null) {
    const tag = (match[1] || "transcript-only").toLowerCase();
    const text = (match[2] || "").trim().replace(/^"|"$/g, "");
    const timestamp = (match[3] || "").trim();
    const link = (match[4] || "").trim();
    const what_happens = (match[5] || "").trim();

    hooks.push({
      tag,
      text,
      timestamp,
      video_link: link,
      what_happens,
      is_recommended: hookIndex === 1 || output.toLowerCase().includes(`hook ${hookIndex} is recommended`),
    });
    hookIndex++;
  }

  // Recommendation
  const recMatch = output.match(/\*\*Recommendation:?\*\*\s*([^\n]+)/i);
  const recommendation = recMatch ? recMatch[1].trim() : undefined;

  // 2. Parse Subject Lines
  const subjPrimary = output.match(/-\s+\*\*Primary:?\*\*\s*([^\n]+)/i);
  const subjAlt1 = output.match(/-\s+\*\*Alternative\s*1:?\*\*\s*([^\n]+)/i);
  const subjAlt2 = output.match(/-\s+\*\*Alternative\s*2:?\*\*\s*([^\n]+)/i);

  if (subjPrimary) subject_lines.primary = subjPrimary[1].trim();
  if (subjAlt1) subject_lines.alternative_1 = subjAlt1[1].trim();
  if (subjAlt2) subject_lines.alternative_2 = subjAlt2[1].trim();

  // 3. Parse Drafts
  const draftSpecs = [
    { key: "option_a", name: "Viewer Trust & Monetization", regex: /####\s+Option A[^\n]*:\s*\n([\s\S]*?)(?=####\s+Option B|$)/i, subj: subject_lines.primary },
    { key: "option_b", name: "Software Category Fit", regex: /####\s+Option B[^\n]*:\s*\n([\s\S]*?)(?=####\s+Option C|$)/i, subj: subject_lines.alternative_1 },
    { key: "option_c", name: "Production Pipeline & Calendar", regex: /####\s+Option C[^\n]*:\s*\n([\s\S]*?)$/i, subj: subject_lines.alternative_2 },
  ];

  for (const spec of draftSpecs) {
    const draftMatch = output.match(spec.regex);
    if (draftMatch) {
      const body = draftMatch[1].trim();
      const words = body.split(/\s+/).filter(Boolean).length;
      drafts[spec.key] = {
        name: spec.name,
        subject: spec.subj || subject_lines.primary,
        body,
        word_count: words,
      };
    }
  }

  return { hooks, recommendation, subject_lines, drafts };
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { videoUrl, channelId, channelName, model, customSettings } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: "Missing required 'videoUrl'" }, { status: 400 });
    }

    // Retrieve settings: prefer customSettings from client (if provided), or query DB
    let settings: EmailApiSettings | null = customSettings || null;

    if (!settings || !settings.apiUrl) {
      try {
        const rows = await query<{ value: any }>(
          "SELECT value FROM system_settings WHERE key = 'email_generation_api'"
        );
        if (rows.length > 0 && rows[0].value) {
          settings = rows[0].value as EmailApiSettings;
        }
      } catch (dbErr) {
        console.warn("Could not load settings from DB:", dbErr);
      }
    }

    if (!settings || !settings.apiUrl || settings.apiUrl.trim() === "") {
      return NextResponse.json({
        error: "Email Generation API is not configured. Please set up the API in Settings first.",
        needsSetup: true,
      }, { status: 400 });
    }

    const apiUrl = settings.apiUrl.trim();
    const apiKey = settings.apiKey?.trim();
    const effectiveModel = model || settings.model || "gemini-3.1-pro-high";
    const timeoutSeconds = settings.timeoutSeconds || 180;

    console.log(`[API Dispatch] Forwarding generation to: ${apiUrl} (model: ${effectiveModel})`);

    // Prepare fixed JSON request payload
    const payload = {
      video_url: videoUrl,
      channel_id: channelId || null,
      channel_name: channelName || null,
      model: effectiveModel,
      additional_instructions: settings.additionalInstructions || undefined,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Fylint-Web-Dispatch/1.0",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["X-API-Key"] = apiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        return NextResponse.json({
          error: `API request timed out after ${timeoutSeconds} seconds. Please check your API server performance.`,
        }, { status: 504 });
      }
      return NextResponse.json({
        error: `Failed to reach configured API at ${apiUrl}: ${fetchErr.message || fetchErr}`,
      }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!upstreamResponse.ok) {
      const errText = await upstreamResponse.text().catch(() => "");
      return NextResponse.json({
        error: `Upstream API returned HTTP ${upstreamResponse.status}: ${errText || upstreamResponse.statusText}`,
      }, { status: upstreamResponse.status });
    }

    const responseData = await upstreamResponse.json();

    // Check if upstream returned standard format
    if (responseData.hooks && responseData.drafts) {
      return NextResponse.json(responseData);
    }

    // If upstream returned raw markdown text in raw_output or text field, parse it
    const rawMarkdown = responseData.raw_output || responseData.text || responseData.output || responseData.email || "";
    const videoId = responseData.video_id || "";
    const parsed = parseMarkdownOutput(rawMarkdown, videoId);

    const formattedResponse: GeneratedEmailResponse = {
      success: true,
      video_id: videoId || responseData.video_id,
      title: responseData.title || "Target Video",
      channel_id: responseData.channel_id || channelId,
      channel_name: responseData.channel_name || channelName,
      hooks: parsed.hooks.length > 0 ? parsed.hooks : (responseData.hooks || []),
      recommendation: parsed.recommendation || responseData.recommendation,
      subject_lines: parsed.subject_lines.primary ? parsed.subject_lines : (responseData.subject_lines || { primary: "", alternative_1: "", alternative_2: "" }),
      drafts: Object.keys(parsed.drafts).length > 0 ? parsed.drafts : (responseData.drafts || {}),
      raw_output: rawMarkdown,
      video_data: responseData.video_data,
    };

    return NextResponse.json(formattedResponse);

  } catch (error: any) {
    console.error("[API Dispatch Error]:", error);
    return NextResponse.json({
      error: error.message || "An unexpected error occurred during email generation",
    }, { status: 500 });
  }
}
