import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { InfluencerEmail } from "@/lib/types";
import {
  computeFollowupStatus,
  generateFollowupDraft,
  parseOutreachData,
} from "@/lib/emailFormatter";

export async function GET(req: NextRequest) {
  return handleFollowupCron(req);
}

export async function POST(req: NextRequest) {
  return handleFollowupCron(req);
}

async function handleFollowupCron(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    // Ensure creator_responded_at column exists in DB if possible
    try {
      await query(`ALTER TABLE influencer_emails ADD COLUMN IF NOT EXISTS creator_responded_at TIMESTAMPTZ`);
    } catch {}

    // Find all outreach records that have been sent
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
        e.outreach_commentary,
        e.outreach_draft,
        e.outreach_sent_at,
        e.followup_commentary,
        e.followup_draft,
        e.followup_generated_at,
        e.followup_email,
        e.followup_sent_at,
        e.creator_responded_at
      FROM influencer_emails e
      JOIN yt_channels c ON c.channel_id = e.channel_id
      LEFT JOIN yt_videos v ON v.video_id = e.video_id
      WHERE e.outreach_sent_at IS NOT NULL
      ORDER BY e.outreach_sent_at ASC
    `;

    let rawEmails: InfluencerEmail[] = [];
    try {
      rawEmails = await query<InfluencerEmail>(sql);
    } catch {
      const fallbackSql = sql.replace("e.creator_responded_at,", "NULL AS creator_responded_at,");
      rawEmails = await query<InfluencerEmail>(fallbackSql);
    }

    const results: Array<{
      id: number;
      channel_name: string;
      stage: number;
      status: "draft_generated" | "draft_ready" | "scheduled" | "responded" | "completed";
      details: string;
    }> = [];

    let dueCount = 0;
    let generatedCount = 0;

    for (const email of rawEmails) {
      const parsed = parseOutreachData(email.outreach_draft, email.outreach_commentary);
      const followupStatus = computeFollowupStatus(
        email.outreach_sent_at,
        email.creator_responded_at,
        email.followup_sent_at,
        email.followup_draft,
        email.followup_commentary
      );

      const creatorName = email.channel_name || "there";
      const videoTitle = email.video_title || "your recent tutorial";
      const originalSubject = parsed.activeSubject || "";

      if (followupStatus.isResponded) {
        results.push({
          id: email.id,
          channel_name: creatorName,
          stage: followupStatus.stage,
          status: "responded",
          details: `Creator responded on ${followupStatus.respondedAt || "recorded date"}`,
        });
        continue;
      }

      if (followupStatus.isCompleted) {
        results.push({
          id: email.id,
          channel_name: creatorName,
          stage: 3,
          status: "completed",
          details: "All 3 follow-up touches sent. Sequence completed.",
        });
        continue;
      }

      if (followupStatus.isDue) {
        dueCount++;
        // If draft not generated yet or force=true, generate it
        if (!email.followup_draft || force) {
          const generated = generateFollowupDraft(
            followupStatus.stage,
            creatorName,
            videoTitle,
            originalSubject
          );

          const formattedFollowupDraft = `Subject: ${generated.subject}\n\nBody:\n${generated.body}`;

          await query(
            `UPDATE influencer_emails
             SET followup_draft = $1,
                 followup_generated_at = now(),
                 updated_at = now()
             WHERE id = $2`,
            [formattedFollowupDraft, email.id]
          );

          generatedCount++;
          results.push({
            id: email.id,
            channel_name: creatorName,
            stage: followupStatus.stage,
            status: "draft_generated",
            details: `Stage ${followupStatus.stage} draft generated: "${generated.subject}"`,
          });
        } else {
          results.push({
            id: email.id,
            channel_name: creatorName,
            stage: followupStatus.stage,
            status: "draft_ready",
            details: `Stage ${followupStatus.stage} draft already prepared and waiting review`,
          });
        }
      } else {
        results.push({
          id: email.id,
          channel_name: creatorName,
          stage: followupStatus.stage,
          status: "scheduled",
          details: `Stage ${followupStatus.stage} due in ${followupStatus.timeRemainingText}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      total_checked: rawEmails.length,
      due_count: dueCount,
      generated_count: generatedCount,
      results,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to run follow-up cron";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
