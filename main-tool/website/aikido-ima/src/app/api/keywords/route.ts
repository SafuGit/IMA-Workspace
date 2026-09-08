import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Keyword } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const filter = searchParams.get("filter") || "all"; // all | active | unused

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (search.trim()) {
      conditions.push(`k.text ILIKE $${pIdx}`);
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    if (filter === "active") {
      conditions.push("k.used_in_current_cycle = TRUE");
    } else if (filter === "unused") {
      conditions.push("k.used_in_current_cycle = FALSE");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        k.id,
        k.text,
        k.used_in_current_cycle,
        k.usage_count,
        k.last_used_at,
        k.created_at,
        COUNT(ck.channel_id)::int AS total_matched,
        COUNT(c.channel_id) FILTER (WHERE c.valid = TRUE)::int AS passed_gate,
        COUNT(c.channel_id) FILTER (WHERE c.valid = FALSE)::int AS rejected_gate
      FROM keywords k
      LEFT JOIN yt_channel_keywords ck ON ck.keyword_id = k.id
      LEFT JOIN yt_channels c ON c.channel_id = ck.channel_id
      ${whereClause}
      GROUP BY k.id
      ORDER BY k.usage_count DESC, total_matched DESC, k.id ASC
      LIMIT 100
    `;

    const keywords = await query<Keyword>(sql, params);
    return NextResponse.json({ keywords });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch keywords";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { keyword, keywords } = body;

    const listToAdd: string[] = [];
    if (keyword && typeof keyword === "string") {
      listToAdd.push(keyword.trim());
    }
    if (Array.isArray(keywords)) {
      keywords.forEach((k) => {
        if (typeof k === "string" && k.trim()) listToAdd.push(k.trim());
      });
    }

    if (listToAdd.length === 0) {
      return NextResponse.json({ error: "No valid keyword text provided." }, { status: 400 });
    }

    let inserted = 0;
    for (const kw of listToAdd) {
      const res = await query(
        `INSERT INTO keywords (text) VALUES ($1) ON CONFLICT (text) DO NOTHING RETURNING id`,
        [kw]
      );
      if (res.length > 0) inserted++;
    }

    return NextResponse.json({ success: true, count: inserted });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to add keywords";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
