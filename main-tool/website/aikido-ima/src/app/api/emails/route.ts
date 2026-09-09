import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { InfluencerEmail } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending"; // pending | sent | all
    const channelId = searchParams.get("channelId");

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (status === "pending") {
      conditions.push("e.outreach_draft IS NOT NULL AND e.outreach_sent_at IS NULL");
    } else if (status === "sent") {
      conditions.push("e.outreach_sent_at IS NOT NULL");
    }

    if (channelId) {
      conditions.push(`e.channel_id = $${pIdx}`);
      params.push(channelId);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        e.id,
        e.channel_id,
        c.channel_name,
        c.channel_handle,
        c.profile_photo_url,
        e.video_id,
        v.title AS video_title,
        e.email_address,
        e.transcript,
        e.outreach_commentary,
        e.outreach_draft,
        e.outreach_generated_at,
        e.outreach_email,
        e.outreach_sent_at,
        e.followup_commentary,
        e.followup_draft,
        e.created_at,
        e.updated_at
      FROM influencer_emails e
      JOIN yt_channels c ON c.channel_id = e.channel_id
      LEFT JOIN yt_videos v ON v.video_id = e.video_id
      ${whereClause}
      ORDER BY
        CASE WHEN e.outreach_sent_at IS NULL THEN 0 ELSE 1 END,
        e.outreach_generated_at DESC NULLS LAST,
        e.created_at DESC
      LIMIT 100
    `;

    const emails = await query<InfluencerEmail>(sql, params);
    return NextResponse.json({ emails });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch emails";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      channel_id,
      video_id,
      video_title,
      outreach_draft,
      outreach_commentary,
      transcript,
      email_address,
    } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "Missing required 'channel_id'" }, { status: 400 });
    }

    if (!outreach_draft || typeof outreach_draft !== "string" || !outreach_draft.trim()) {
      return NextResponse.json({ error: "Missing or empty 'outreach_draft'" }, { status: 400 });
    }

    // 1. Determine email address (either provided, or handle-based fallback)
    let contactEmail = email_address?.trim();
    if (!contactEmail) {
      try {
        const chRows = await query<{ channel_handle: string | null }>(
          "SELECT channel_handle FROM yt_channels WHERE channel_id = $1",
          [channel_id]
        );
        const handle = chRows[0]?.channel_handle?.replace(/^@/, "");
        contactEmail = handle ? `${handle}@creators.youtube` : `contact@${channel_id}.com`;
      } catch {
        contactEmail = `contact@${channel_id}.com`;
      }
    }

    // 2. Ensure video exists in yt_videos if video_id is provided, to satisfy foreign key
    let effectiveVideoId = video_id || null;
    if (effectiveVideoId) {
      try {
        await query(
          `INSERT INTO yt_videos (video_id, channel_id, title, created_at, updated_at)
           VALUES ($1, $2, $3, now(), now())
           ON CONFLICT (video_id) DO UPDATE
           SET title = COALESCE(EXCLUDED.title, yt_videos.title), updated_at = now()`,
          [effectiveVideoId, channel_id, video_title || "Target Video"]
        );
      } catch (videoErr) {
        console.warn("Could not upsert yt_videos row, setting video_id to null:", videoErr);
        effectiveVideoId = null;
      }
    }

    // 3. Insert into influencer_emails
    const insertSql = `
      INSERT INTO influencer_emails (
        channel_id,
        video_id,
        email_address,
        transcript,
        outreach_commentary,
        outreach_draft,
        outreach_generated_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now(), now(), now())
      RETURNING id
    `;

    const res = await query<{ id: number }>(insertSql, [
      channel_id,
      effectiveVideoId,
      contactEmail,
      transcript || null,
      outreach_commentary || null,
      outreach_draft.trim(),
    ]);

    return NextResponse.json({
      success: true,
      id: res[0]?.id,
      message: "Draft saved to Review Hub successfully",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to save draft";
    console.error("Failed to save email draft:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
