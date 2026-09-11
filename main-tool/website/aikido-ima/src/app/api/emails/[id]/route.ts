import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, draft } = body;

    const emailId = Number(id);
    if (!emailId) {
      return NextResponse.json({ error: "Invalid email ID" }, { status: 400 });
    }

    if (action === "send") {
      const { final_email } = body;
      await query(
        `UPDATE influencer_emails
         SET outreach_sent_at = now(),
             outreach_email = COALESCE($1, outreach_email, outreach_draft),
             updated_at = now()
         WHERE id = $2`,
        [final_email || null, emailId]
      );
      return NextResponse.json({ success: true, sent_at: new Date().toISOString() });
    }

    if (action === "save_draft") {
      const { commentary } = body;
      if (commentary !== undefined) {
        await query(
          `UPDATE influencer_emails
           SET outreach_draft = $1, outreach_commentary = $2, updated_at = now()
           WHERE id = $3`,
          [draft || "", commentary, emailId]
        );
      } else {
        await query(
          `UPDATE influencer_emails
           SET outreach_draft = $1, updated_at = now()
           WHERE id = $2`,
          [draft || "", emailId]
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === "unsend") {
      await query(
        `UPDATE influencer_emails
         SET outreach_sent_at = NULL, updated_at = now()
         WHERE id = $1`,
        [emailId]
      );
      return NextResponse.json({ success: true });
    }

    if (action === "creator_responded") {
      const { responded } = body;
      const respondedAt = responded !== false ? new Date().toISOString() : null;

      try {
        await query(
          `UPDATE influencer_emails
           SET creator_responded_at = $1, updated_at = now()
           WHERE id = $2`,
          [respondedAt, emailId]
        );
      } catch {
        // Fallback: create column if missing, or store in followup_commentary
        try {
          await query(`ALTER TABLE influencer_emails ADD COLUMN IF NOT EXISTS creator_responded_at TIMESTAMPTZ`);
          await query(
            `UPDATE influencer_emails
             SET creator_responded_at = $1, updated_at = now()
             WHERE id = $2`,
            [respondedAt, emailId]
          );
        } catch {
          await query(
            `UPDATE influencer_emails
             SET followup_commentary = COALESCE(followup_commentary, '') || $1, updated_at = now()
             WHERE id = $2`,
            [respondedAt ? `\n=== CREATOR_RESPONDED: ${respondedAt} ===` : "\n=== CREATOR_RESPONDED: false ===", emailId]
          );
        }
      }
      return NextResponse.json({ success: true, creator_responded_at: respondedAt });
    }

    if (action === "send_followup") {
      const { final_email, stage } = body;
      const nowIso = new Date().toISOString();
      const stageNum = Number(stage) || 1;
      const marker = `\n=== FU${stageNum}_SENT: ${nowIso} ===`;

      await query(
        `UPDATE influencer_emails
         SET followup_sent_at = now(),
             followup_email = COALESCE($1, followup_email, followup_draft),
             followup_commentary = COALESCE(followup_commentary, '') || $2,
             updated_at = now()
         WHERE id = $3`,
        [final_email || null, marker, emailId]
      );
      return NextResponse.json({ success: true, followup_sent_at: nowIso, stage: stageNum });
    }

    if (action === "save_followup_draft") {
      const { followup_draft, followup_commentary } = body;
      await query(
        `UPDATE influencer_emails
         SET followup_draft = $1,
             followup_commentary = COALESCE($2, followup_commentary),
             updated_at = now()
         WHERE id = $3`,
        [followup_draft || "", followup_commentary || null, emailId]
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to update email";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const emailId = Number(id);
    if (!emailId) {
      return NextResponse.json({ error: "Invalid email ID" }, { status: 400 });
    }

    await query(`DELETE FROM influencer_emails WHERE id = $1`, [emailId]);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to delete email";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
