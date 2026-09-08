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
      await query(
        `UPDATE influencer_emails
         SET outreach_sent_at = now(), updated_at = now()
         WHERE id = $1`,
        [emailId]
      );
      return NextResponse.json({ success: true, sent_at: new Date().toISOString() });
    }

    if (action === "save_draft") {
      await query(
        `UPDATE influencer_emails
         SET outreach_draft = $1, updated_at = now()
         WHERE id = $2`,
        [draft || "", emailId]
      );
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
