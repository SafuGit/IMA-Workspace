import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { StatisticsData } from "@/lib/types";

export async function GET() {
  try {
    const [
      coreStatsRows,
      reasonsStats,
      subBuckets,
      topKeywords,
    ] = await Promise.all([
      // Comprehensive Core Pipeline, Keyword, and Database Storage Metrics
      query<{
        total_channels: number | string;
        fetched_channels: number | string;
        qualified_channels: number | string;
        need_review_channels: number | string;
        need_review_qualified: number | string;
        approved_channels: number | string;
        rejected_channels: number | string;
        total_videos: number | string;
        total_keywords: number | string;
        used_keywords: number | string;
        unused_keywords: number | string;
        drafted_emails: number | string;
        sent_emails: number | string;
        channels_size: string;
        videos_size: string;
        db_size: string;
      }>(`
        WITH channel_stats AS (
            SELECT
                COUNT(*)::int AS total_channels,

                COUNT(*) FILTER (
                    WHERE subscriber_count > 25000
                      AND subscriber_count < 1000000
                )::int AS fetched_channels,

                COUNT(*) FILTER (
                    WHERE subscriber_count > 25000
                      AND subscriber_count < 1000000
                      AND avg_views > 25000
                      AND (avg_engagement_rate > 1 OR (avg_engagement_rate <= 1 AND avg_engagement_rate > 0.01))
                )::int AS qualified_channels,

                COUNT(*) FILTER (
                    WHERE valid IS NULL
                )::int AS need_review_channels,

                COUNT(*) FILTER (
                    WHERE valid IS NULL
                      AND subscriber_count > 25000
                      AND subscriber_count < 1000000
                      AND avg_views > 25000
                      AND (avg_engagement_rate > 1 OR (avg_engagement_rate <= 1 AND avg_engagement_rate > 0.01))
                )::int AS need_review_qualified,

                COUNT(*) FILTER (
                    WHERE valid = TRUE
                )::int AS approved_channels,

                COUNT(*) FILTER (
                    WHERE valid = FALSE
                )::int AS rejected_channels
            FROM yt_channels
        ),
        video_stats AS (
            SELECT
                COUNT(*)::int AS total_videos
            FROM yt_videos
        ),
        keyword_stats AS (
            SELECT
                COUNT(*)::int AS total_keywords,
                COUNT(*) FILTER (
                    WHERE used_in_current_cycle
                )::int AS used_keywords,
                COUNT(*) FILTER (
                    WHERE NOT used_in_current_cycle
                )::int AS unused_keywords
            FROM keywords
        ),
        email_stats AS (
            SELECT
                COUNT(*) FILTER (WHERE outreach_draft IS NOT NULL)::int AS drafted_emails,
                COUNT(*) FILTER (WHERE outreach_sent_at IS NOT NULL)::int AS sent_emails
            FROM influencer_emails
        ),
        db_sizes AS (
            SELECT
                ROUND(
                    pg_total_relation_size('yt_channels') / (1024.0 * 1024.0),
                    2
                )::text || ' MB' AS channels_size,

                ROUND(
                    pg_total_relation_size('yt_videos') / (1024.0 * 1024.0),
                    2
                )::text || ' MB' AS videos_size,

                ROUND(
                    pg_database_size(current_database()) / (1024.0 * 1024.0),
                    2
                )::text || ' MB' AS db_size
        )
        SELECT *
        FROM channel_stats
        CROSS JOIN video_stats
        CROSS JOIN keyword_stats
        CROSS JOIN email_stats
        CROSS JOIN db_sizes;
      `),

      // Rejection Breakdown (Bin Analysis)
      query<{ reason: string; count: number | string }>(`
        SELECT
          rejection_reason::text AS reason,
          COUNT(*)::int AS count
        FROM yt_channels
        WHERE rejection_reason IS NOT NULL
        GROUP BY rejection_reason
        ORDER BY count DESC
      `),

      // Subscriber Distribution
      query<{ bucket: string; count: number | string }>(`
        SELECT
          CASE
            WHEN subscriber_count < 25000 THEN '< 25K'
            WHEN subscriber_count < 50000 THEN '25K - 50K'
            WHEN subscriber_count < 100000 THEN '50K - 100K'
            WHEN subscriber_count < 250000 THEN '100K - 250K'
            WHEN subscriber_count < 500000 THEN '250K - 500K'
            WHEN subscriber_count < 1000000 THEN '500K - 1M'
            ELSE '> 1M'
          END AS bucket,
          COUNT(*)::int AS count
        FROM yt_channels
        WHERE subscriber_count IS NOT NULL
        GROUP BY bucket
        ORDER BY MIN(subscriber_count) ASC
      `),

      // Top 8 Performing Keywords by Approved Channels
      query<{ keyword: string; total: number | string; approved: number | string }>(`
        SELECT
          k.text AS keyword,
          COUNT(ck.channel_id)::int AS total,
          COUNT(c.channel_id) FILTER (WHERE c.valid = TRUE)::int AS approved
        FROM keywords k
        JOIN yt_channel_keywords ck ON ck.keyword_id = k.id
        LEFT JOIN yt_channels c ON c.channel_id = ck.channel_id
        GROUP BY k.id
        HAVING COUNT(c.channel_id) FILTER (WHERE c.valid = TRUE) > 0
        ORDER BY COUNT(c.channel_id) FILTER (WHERE c.valid = TRUE) DESC
        LIMIT 8
      `),
    ]);

    const core = coreStatsRows[0] || {
      total_channels: 0,
      fetched_channels: 0,
      qualified_channels: 0,
      need_review_channels: 0,
      need_review_qualified: 0,
      approved_channels: 0,
      rejected_channels: 0,
      total_videos: 0,
      total_keywords: 0,
      used_keywords: 0,
      unused_keywords: 0,
      drafted_emails: 0,
      sent_emails: 0,
      channels_size: "0 MB",
      videos_size: "0 MB",
      db_size: "0 MB",
    };

    const totalKeywords = Number(core.total_keywords || 0);
    const usedKeywords = Number(core.used_keywords || 0);
    const unusedKeywords = Number(core.unused_keywords || 0);
    const cycleProgress =
      totalKeywords > 0 ? Number(((usedKeywords / totalKeywords) * 100).toFixed(1)) : 0;

    const response: StatisticsData = {
      overview: {
        totalChannels: Number(core.total_channels || 0),
        fetchedChannels: Number(core.fetched_channels || 0),
        qualifiedChannels: Number(core.qualified_channels || 0),
        needReviewChannels: Number(core.need_review_channels || 0),
        needReviewQualified: Number(core.need_review_qualified || 0),
        approvedChannels: Number(core.approved_channels || 0),
        rejectedChannels: Number(core.rejected_channels || 0),
        totalVideos: Number(core.total_videos || 0),
        totalKeywords,
        usedKeywords,
        unusedKeywords,
        keywordCycleProgressPct: cycleProgress,
        channelsSize: core.channels_size || "0 MB",
        videosSize: core.videos_size || "0 MB",
        dbSize: core.db_size || "0 MB",
        draftedEmails: Number(core.drafted_emails || 0),
        sentEmails: Number(core.sent_emails || 0),
      },
      funnel: {
        total: Number(core.total_channels || 0),
        fetched: Number(core.fetched_channels || 0),
        qualified: Number(core.qualified_channels || 0),
        needReview: Number(core.need_review_channels || 0),
        approved: Number(core.approved_channels || 0),
        rejected: Number(core.rejected_channels || 0),
        drafted: Number(core.drafted_emails || 0),
        sent: Number(core.sent_emails || 0),
      },
      reasons: reasonsStats.map((r) => ({
        reason: r.reason,
        count: Number(r.count),
      })),
      subscriberBuckets: subBuckets.map((b) => ({
        bucket: b.bucket,
        count: Number(b.count),
      })),
      topKeywords: topKeywords.map((k) => ({
        keyword: k.keyword,
        total: Number(k.total),
        approved: Number(k.approved),
      })),
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch statistics";
    console.error("Statistics query error:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
