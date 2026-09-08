import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { RejectionReason } from "@/lib/types";

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
