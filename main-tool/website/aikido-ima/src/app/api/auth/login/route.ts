import { NextRequest, NextResponse } from "next/server";
import { testDbConnection } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DbCredentials } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { host, port, database, user, password, ssl } = body;

    if (!host || !database || !user) {
      return NextResponse.json(
        { success: false, error: "Host, database name, and username are required." },
        { status: 400 }
      );
    }

    const creds: DbCredentials = {
      host: host.trim(),
      port: Number(port) || 5432,
      database: database.trim(),
      user: user.trim(),
      password: password || "",
      ssl: Boolean(ssl),
    };

    // Test handshake against PostgreSQL
    const testResult = await testDbConnection(creds);
    if (!testResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Database connection failed: ${testResult.message}`,
        },
        { status: 401 }
      );
    }

    // Handshake succeeded: save session
    const session = await getSession();
    session.db = creds;
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json({ success: true, db: { host: creds.host, database: creds.database, user: creds.user } });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
