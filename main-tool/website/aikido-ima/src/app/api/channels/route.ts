import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { YtChannel } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "unreviewed";
    const search = searchParams.get("search") || "";
    const minSubs = Number(searchParams.get("minSubs")) || 0;
    const maxSubs = Number(searchParams.get("maxSubs")) || 0;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit")) || 25));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    // Tab condition
    if (tab === "unreviewed") {
      conditions.push("c.valid IS NULL");
    } else if (tab === "approved") {
      conditions.push("c.valid = TRUE");
    } else if (tab === "rejected") {
      conditions.push("c.valid = FALSE");
    }

    // Search condition
    if (search.trim()) {
      conditions.push(`(c.channel_name ILIKE $${pIdx} OR c.channel_handle ILIKE $${pIdx} OR c.channel_id ILIKE $${pIdx})`);
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    // Sub limits
    if (minSubs > 0) {
      conditions.push(`c.subscriber_count >= $${pIdx}`);
      params.push(minSubs);
      pIdx++;
    }
    if (maxSubs > 0) {
      conditions.push(`c.subscriber_count <= $${pIdx}`);
      params.push(maxSubs);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count query
    const countSql = `SELECT COUNT(*)::int AS total FROM yt_channels c ${whereClause}`;
    const countRes = await query<{ total: number }>(countSql, params);
    const total = countRes[0]?.total || 0;

    // Data query with discovery video details
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
        WHERE v.channel_id = c.channel_id AND v.found_via_keyword_id IS NOT NULL
        LIMIT 1
      ) dv ON TRUE
      ${whereClause}
      ORDER BY
        CASE WHEN c.valid IS NULL THEN 0 WHEN c.valid = TRUE THEN 1 ELSE 2 END ASC,
        c.created_at DESC
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    params.push(limit, offset);
    const channels = await query<YtChannel>(dataSql, params);

    return NextResponse.json({
      channels,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch channels";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
