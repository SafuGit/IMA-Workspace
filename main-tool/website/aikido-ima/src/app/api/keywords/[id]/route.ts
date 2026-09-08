import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { used_in_current_cycle } = body;

    if (id === "reset-cycle") {
      await query(`UPDATE keywords SET used_in_current_cycle = FALSE`);
      return NextResponse.json({ success: true, message: "Reset all keywords cycle status" });
    }

    const kwId = Number(id);
    if (!kwId) {
      return NextResponse.json({ error: "Invalid keyword ID" }, { status: 400 });
    }

    await query(
      `UPDATE keywords SET used_in_current_cycle = $1 WHERE id = $2`,
      [Boolean(used_in_current_cycle), kwId]
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to update keyword";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
