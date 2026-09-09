import { NextRequest, NextResponse } from "next/server";

// In-memory cache for proxied images to avoid repeatedly requesting from upstream CDNs
interface CachedImage {
  buffer: ArrayBuffer;
  contentType: string;
  expiresAt: number;
}

const imageCache = new Map<string, CachedImage>();
const MAX_CACHE_ITEMS = 1000;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

// Fallback SVG for avatar
const FALLBACK_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="50" fill="url(#bgGrad)"/>
  <circle cx="50" cy="38" r="18" fill="#64748b"/>
  <path d="M 22 84 C 22 66 35 62 50 62 C 65 62 78 66 78 84 Z" fill="#64748b"/>
</svg>`;

// Fallback SVG for video thumbnail
const FALLBACK_THUMBNAIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="160" height="90">
  <rect width="160" height="90" rx="6" fill="#0f172a"/>
  <rect x="0.5" y="0.5" width="159" height="89" rx="5.5" fill="none" stroke="#334155" stroke-width="1"/>
  <circle cx="80" cy="45" r="18" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>
  <polygon points="76,37 88,45 76,53" fill="#94a3b8"/>
</svg>`;

function getFallbackResponse(type: "avatar" | "thumbnail" = "avatar") {
  const svg = type === "thumbnail" ? FALLBACK_THUMBNAIL_SVG : FALLBACK_AVATAR_SVG;
  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function isDisallowedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // Prevent SSRF attacks against localhost or internal networks
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower === "0.0.0.0" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }

  // Check private IP ranges
  const ipv4Match = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const octet1 = parseInt(ipv4Match[1], 10);
    const octet2 = parseInt(ipv4Match[2], 10);
    if (octet1 === 10) return true;
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true;
    if (octet1 === 192 && octet2 === 168) return true;
    if (octet1 === 169 && octet2 === 254) return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetUrl = searchParams.get("url");
  const type = (searchParams.get("type") as "avatar" | "thumbnail") || "avatar";

  if (!targetUrl) {
    return getFallbackResponse(type);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return getFallbackResponse(type);
  }

  // Only allow http/https protocols
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return getFallbackResponse(type);
  }

  // SSRF guard
  if (isDisallowedHost(parsedUrl.hostname)) {
    return getFallbackResponse(type);
  }

  // Check in-memory cache
  const cached = imageCache.get(targetUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return new NextResponse(cached.buffer, {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
        "X-Proxy-Cache": "HIT",
      },
    });
  }

  // Prepare upstream fetch headers
  const isYouTubeDomain =
    parsedUrl.hostname.includes("ytimg.com") ||
    parsedUrl.hostname.includes("youtube.com") ||
    parsedUrl.hostname.includes("ggpht.com") ||
    parsedUrl.hostname.includes("googleusercontent.com");

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  // If fetching from YouTube/Google, supply youtube.com referer to satisfy CDN requirements
  if (isYouTubeDomain) {
    upstreamHeaders["Referer"] = "https://www.youtube.com/";
  }

  try {
    let upstreamRes = await fetch(targetUrl, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(6000),
    });

    // If rate limited (429) or failed, attempt alternative fallback for YouTube thumbnails
    if (!upstreamRes.ok) {
      if (type === "thumbnail" || parsedUrl.hostname.includes("ytimg.com")) {
        // Extract video ID if possible: /vi/<VIDEO_ID>/...
        const viMatch = targetUrl.match(/\/vi\/([a-zA-Z0-9_-]+)/);
        if (viMatch && viMatch[1]) {
          const videoId = viMatch[1];
          const fallbackUrls = [
            `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          ];
          for (const fallbackUrl of fallbackUrls) {
            if (fallbackUrl !== targetUrl) {
              try {
                const fbRes = await fetch(fallbackUrl, {
                  headers: upstreamHeaders,
                  signal: AbortSignal.timeout(4000),
                });
                if (fbRes.ok) {
                  upstreamRes = fbRes;
                  break;
                }
              } catch {
                // Continue to next fallback
              }
            }
          }
        }
      }
    }

    if (!upstreamRes.ok) {
      // Return beautiful fallback SVG instead of broken response or 429
      return getFallbackResponse(type);
    }

    const contentType =
      upstreamRes.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await upstreamRes.arrayBuffer();

    // Cache valid image
    if (imageCache.size >= MAX_CACHE_ITEMS) {
      const oldestKey = imageCache.keys().next().value;
      if (oldestKey) imageCache.delete(oldestKey);
    }

    imageCache.set(targetUrl, {
      buffer: arrayBuffer,
      contentType,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
        "X-Proxy-Cache": "MISS",
      },
    });
  } catch {
    // Network error or timeout: return SVG placeholder
    return getFallbackResponse(type);
  }
}
