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
    const minViews = Number(searchParams.get("minViews")) || 0;
    const minEngagement = Number(searchParams.get("minEngagement")) || 0;
    const rejectionReason = searchParams.get("rejectionReason") || "";
    const sortBy = searchParams.get("sortBy") || "created_at";
    const sortOrder = (searchParams.get("sortOrder") || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit")) || 25));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    // Tab condition
    if (tab === "qualified") {
      // Qualified Creators category: 25K-1M subs, >25K avg views, >1% engagement
      conditions.push("c.subscriber_count > 25000 AND c.subscriber_count < 1000000");
      conditions.push("c.avg_views > 25000");
      conditions.push("(c.avg_engagement_rate > 1 OR (c.avg_engagement_rate <= 1 AND c.avg_engagement_rate > 0.01))");

      const scope = searchParams.get("scope") || "unreviewed";
      if (scope === "unreviewed") {
        conditions.push("c.valid IS NULL");
      } else if (scope === "approved") {
        conditions.push("c.valid = TRUE");
      } else if (scope === "rejected") {
        conditions.push("c.valid = FALSE");
      }
      // If scope === "all", do not filter on valid
    } else if (tab === "unreviewed") {
      conditions.push("c.valid IS NULL");
      const unreviewedFilter = searchParams.get("unreviewedFilter");
      if (unreviewedFilter === "non-qualified") {
        conditions.push("NOT (c.subscriber_count > 25000 AND c.subscriber_count < 1000000 AND c.avg_views > 25000 AND (c.avg_engagement_rate > 1 OR (c.avg_engagement_rate <= 1 AND c.avg_engagement_rate > 0.01)))");
      }
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

    // Min views
    if (minViews > 0) {
      conditions.push(`c.avg_views >= $${pIdx}`);
      params.push(minViews);
      pIdx++;
    }

    // Min engagement rate
    if (minEngagement > 0) {
      conditions.push(`(c.avg_engagement_rate >= $${pIdx} OR (c.avg_engagement_rate <= 1 AND c.avg_engagement_rate >= ($${pIdx}::float / 100.0)))`);
      params.push(minEngagement);
      pIdx++;
    }

    // Rejection reason filter
    if (rejectionReason.trim()) {
      conditions.push(`c.rejection_reason::text = $${pIdx}`);
      params.push(rejectionReason.trim());
      pIdx++;
    }

    // Exclude already emailed creators from Channel Triage across all categories
    conditions.push("NOT EXISTS (SELECT 1 FROM influencer_emails e WHERE e.channel_id = c.channel_id AND e.outreach_sent_at IS NOT NULL)");

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count query
    const countSql = `SELECT COUNT(*)::int AS total FROM yt_channels c ${whereClause}`;
    const countRes = await query<{ total: number }>(countSql, params);
    const total = countRes[0]?.total || 0;

    // Valid sort columns map for injection safety
    const validSortColumns: Record<string, string> = {
      subscribers: "c.subscriber_count",
      subscriber_count: "c.subscriber_count",
      views: "c.avg_views",
      avg_views: "c.avg_views",
      engagement: "c.avg_engagement_rate",
      avg_engagement_rate: "c.avg_engagement_rate",
      created_at: "c.created_at",
      date: "c.created_at",
      name: "c.channel_name",
      channel_name: "c.channel_name",
    };

    let orderClause = `ORDER BY ${validSortColumns[sortBy] || "c.created_at"} ${sortOrder} NULLS LAST, c.channel_id ASC`;
    if (!sortBy || sortBy === "default") {
      orderClause = `ORDER BY
        CASE WHEN c.valid IS NULL THEN 0 WHEN c.valid = TRUE THEN 1 ELSE 2 END ASC,
        c.created_at DESC`;
    }

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
      ${orderClause}
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    params.push(limit, offset);
    const [channels, countsRes] = await Promise.all([
      query<YtChannel>(dataSql, params),
      query<{
        qualified: number;
        unreviewed: number;
        approved: number;
        rejected: number;
        all: number;
      }>(`
        SELECT
          COUNT(*) FILTER (
            WHERE valid IS NULL
              AND subscriber_count > 25000
              AND subscriber_count < 1000000
              AND avg_views > 25000
              AND (avg_engagement_rate > 1 OR (avg_engagement_rate <= 1 AND avg_engagement_rate > 0.01))
              AND NOT EXISTS (SELECT 1 FROM influencer_emails e WHERE e.channel_id = yt_channels.channel_id AND e.outreach_sent_at IS NOT NULL)
          )::int AS qualified,
          COUNT(*) FILTER (
            WHERE valid IS NULL
              AND NOT EXISTS (SELECT 1 FROM influencer_emails e WHERE e.channel_id = yt_channels.channel_id AND e.outreach_sent_at IS NOT NULL)
          )::int AS unreviewed,
          COUNT(*) FILTER (
            WHERE valid = TRUE
              AND NOT EXISTS (SELECT 1 FROM influencer_emails e WHERE e.channel_id = yt_channels.channel_id AND e.outreach_sent_at IS NOT NULL)
          )::int AS approved,
          COUNT(*) FILTER (
            WHERE valid = FALSE
              AND NOT EXISTS (SELECT 1 FROM influencer_emails e WHERE e.channel_id = yt_channels.channel_id AND e.outreach_sent_at IS NOT NULL)
          )::int AS rejected,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (SELECT 1 FROM influencer_emails e WHERE e.channel_id = yt_channels.channel_id AND e.outreach_sent_at IS NOT NULL)
          )::int AS all
        FROM yt_channels
      `),
    ]);

    const tabCounts = countsRes[0] || { qualified: 0, unreviewed: 0, approved: 0, rejected: 0, all: 0 };

    return NextResponse.json({
      channels,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      tabCounts,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch channels";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
