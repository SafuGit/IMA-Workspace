import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const [
      funnelStats,
      reasonsStats,
      subBuckets,
      topKeywords,
    ] = await Promise.all([
      // Funnel
      query<{
        total: string;
        unreviewed: string;
        approved: string;
        rejected: string;
        drafted: string;
        sent: string;
      }>(`
        SELECT
          (SELECT COUNT(*)::text FROM yt_channels) AS total,
          (SELECT COUNT(*)::text FROM yt_channels WHERE valid IS NULL) AS unreviewed,
          (SELECT COUNT(*)::text FROM yt_channels WHERE valid = TRUE) AS approved,
          (SELECT COUNT(*)::text FROM yt_channels WHERE valid = FALSE) AS rejected,
          (SELECT COUNT(*)::text FROM influencer_emails WHERE outreach_draft IS NOT NULL) AS drafted,
          (SELECT COUNT(*)::text FROM influencer_emails WHERE outreach_sent_at IS NOT NULL) AS sent
      `),

      // Rejection Breakdown
      query<{ reason: string; count: string }>(`
        SELECT
          rejection_reason::text AS reason,
          COUNT(*)::text AS count
        FROM yt_channels
        WHERE rejection_reason IS NOT NULL
        GROUP BY rejection_reason
        ORDER BY count DESC
      `),

      // Subscriber Distribution
      query<{ bucket: string; count: string }>(`
        SELECT
          CASE
            WHEN subscriber_count < 50000 THEN '< 50K'
            WHEN subscriber_count < 100000 THEN '50K - 100K'
            WHEN subscriber_count < 250000 THEN '100K - 250K'
            WHEN subscriber_count < 500000 THEN '250K - 500K'
            WHEN subscriber_count < 1000000 THEN '500K - 1M'
            ELSE '> 1M'
          END AS bucket,
          COUNT(*)::text AS count
        FROM yt_channels
        WHERE subscriber_count IS NOT NULL
        GROUP BY bucket
        ORDER BY MIN(subscriber_count) ASC
      `),

      // Top 8 Performing Keywords by Approved Channels
      query<{ keyword: string; total: string; approved: string }>(`
        SELECT
          k.text AS keyword,
          COUNT(ck.channel_id)::text AS total,
          COUNT(c.channel_id) FILTER (WHERE c.valid = TRUE)::text AS approved
        FROM keywords k
        JOIN yt_channel_keywords ck ON ck.keyword_id = k.id
        LEFT JOIN yt_channels c ON c.channel_id = ck.channel_id
        GROUP BY k.id
        HAVING COUNT(c.channel_id) FILTER (WHERE c.valid = TRUE) > 0
        ORDER BY COUNT(c.channel_id) FILTER (WHERE c.valid = TRUE) DESC
        LIMIT 8
      `),
    ]);

    return NextResponse.json({
      funnel: {
        total: Number(funnelStats[0]?.total || 0),
        unreviewed: Number(funnelStats[0]?.unreviewed || 0),
        approved: Number(funnelStats[0]?.approved || 0),
        rejected: Number(funnelStats[0]?.rejected || 0),
        drafted: Number(funnelStats[0]?.drafted || 0),
        sent: Number(funnelStats[0]?.sent || 0),
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
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch statistics";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
