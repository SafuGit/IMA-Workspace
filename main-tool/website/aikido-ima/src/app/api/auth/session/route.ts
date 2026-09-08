import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    return NextResponse.json({ isLoggedIn: false });
  }

  return NextResponse.json({
    isLoggedIn: true,
    db: {
      host: session.db.host,
      port: session.db.port,
      database: session.db.database,
      user: session.db.user,
    },
  });
}
