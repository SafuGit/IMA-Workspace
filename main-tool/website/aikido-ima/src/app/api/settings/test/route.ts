import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { apiUrl, apiKey } = await request.json();

    if (!apiUrl || typeof apiUrl !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'apiUrl'" }, { status: 400 });
    }

    const t0 = Date.now();
    const headers: Record<string, string> = {
      "User-Agent": "Fylint-Web/1.0",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["X-API-Key"] = apiKey;
    }

    // First try a quick GET /health or GET to the base host
    let targetUrl = apiUrl;
    try {
      const parsed = new URL(apiUrl);
      const healthUrl = `${parsed.origin}/health`;

      const healthRes = await fetch(healthUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      if (healthRes && (healthRes.ok || healthRes.status === 200)) {
        const latencyMs = Date.now() - t0;
        return NextResponse.json({
          success: true,
          latencyMs,
          message: `Connection successful! Health endpoint responded in ${latencyMs}ms.`,
        });
      }
    } catch {
      // Ignore URL parse error, proceed to direct check
    }

    // Direct check to apiUrl
    const res = await fetch(targetUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(6000),
    }).catch(async (e) => {
      // If GET returns 405 (Method Not Allowed) because it only accepts POST, that still means the server is reachable!
      return null;
    });

    const latencyMs = Date.now() - t0;

    if (res && (res.status < 500)) {
      return NextResponse.json({
        success: true,
        latencyMs,
        message: `API endpoint reached successfully (${res.status} ${res.statusText}) in ${latencyMs}ms.`,
      });
    }

    // Fallback: try an empty OPTIONS request
    const optRes = await fetch(targetUrl, {
      method: "OPTIONS",
      headers,
      signal: AbortSignal.timeout(4000),
    }).catch(() => null);

    if (optRes && optRes.status < 500) {
      return NextResponse.json({
        success: true,
        latencyMs: Date.now() - t0,
        message: `API endpoint reached via CORS preflight (${optRes.status}) in ${Date.now() - t0}ms.`,
      });
    }

    return NextResponse.json({
      success: false,
      error: `Could not reach API at ${apiUrl}. Please verify the server is running and accessible.`,
    }, { status: 502 });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to connect to API",
    }, { status: 500 });
  }
}
