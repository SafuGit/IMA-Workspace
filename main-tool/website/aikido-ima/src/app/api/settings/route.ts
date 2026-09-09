import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";

const SETTINGS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || "email_generation_api";

  try {
    // Ensure settings table exists
    await query(SETTINGS_TABLE_SQL);

    const rows = await query<{ value: any; updated_at: string }>(
      "SELECT value, updated_at FROM system_settings WHERE key = $1",
      [key]
    );

    if (rows.length === 0) {
      return NextResponse.json({ key, settings: null });
    }

    return NextResponse.json({
      key,
      settings: rows[0].value,
      updated_at: rows[0].updated_at,
    });
  } catch (error: any) {
    console.error("Failed to fetch settings from DB:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const key = body.key || "email_generation_api";
    const value = body.value || body.settings || body;

    if (!value || typeof value !== "object") {
      return NextResponse.json({ error: "Settings value must be an object" }, { status: 400 });
    }

    await query(SETTINGS_TABLE_SQL);

    await query(
      `
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = now()
      `,
      [key, JSON.stringify(value)]
    );

    return NextResponse.json({ success: true, key, settings: value });
  } catch (error: any) {
    console.error("Failed to save settings to DB:", error);
    return NextResponse.json({ error: error.message || "Failed to save settings" }, { status: 500 });
  }
}

