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
