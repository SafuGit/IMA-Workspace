import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { RejectionReason, YtChannel } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing channel id" }, { status: 400 });
    }

    const dataSql = `
      SELECT
        c.channel_id,
        c.channel_handle,
        c.channel_name,
        c.description,
        c.profile_photo_url,
        c.banner_photo_url,
        c.subscriber_count,
        c.avg_views,
        c.avg_engagement_rate,
        c.videos_last_month,
        c.valid,
        c.rejection_reason,
        c.last_fetched_at,
        c.created_at,
        c.updated_at,
        dv.video_id AS discovery_video_id,
        dv.title AS discovery_video_title,
        dv.thumbnail_url AS discovery_thumbnail_url
      FROM yt_channels c
      LEFT JOIN LATERAL (
        SELECT v.video_id, v.title, v.thumbnail_url
        FROM yt_videos v
        WHERE v.channel_id = c.channel_id
        ORDER BY (v.found_via_keyword_id IS NOT NULL) DESC, v.published_at DESC NULLS LAST
        LIMIT 1
      ) dv ON TRUE
      WHERE c.channel_id = $1
      LIMIT 1
    `;

    const channels = await query<YtChannel>(dataSql, [id]);
    if (channels.length === 0) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    return NextResponse.json({ channel: channels[0] });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch channel";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, reason } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing channel id" }, { status: 400 });
    }

    if (action === "approve") {
      await query(
        `UPDATE yt_channels
         SET valid = TRUE, rejection_reason = NULL, updated_at = now()
         WHERE channel_id = $1`,
        [id]
      );
      return NextResponse.json({ success: true, valid: true });
    }

    if (action === "reject") {
      const validReasons: RejectionReason[] = [
        "followers",
        "avg views",
        "bad engagement rate",
        "woman",
        "bad content",
        "unrelated",
        "other",
      ];

      const rejectionReason = validReasons.includes(reason) ? reason : "other";

      await query(
        `UPDATE yt_channels
         SET valid = FALSE, rejection_reason = $1::channel_rejection_reason, updated_at = now()
         WHERE channel_id = $2`,
        [rejectionReason, id]
      );
      return NextResponse.json({ success: true, valid: false, rejection_reason: rejectionReason });
    }

    if (action === "reset") {
      await query(
        `UPDATE yt_channels
         SET valid = NULL, rejection_reason = NULL, updated_at = now()
         WHERE channel_id = $1`,
        [id]
      );
      return NextResponse.json({ success: true, valid: null });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to update channel";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
