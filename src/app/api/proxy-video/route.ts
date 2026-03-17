import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIP } from "@/lib/rateLimit";

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

const ALLOWED_CONTENT_TYPES = [
  "video/",
  "image/",
];

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rl = checkRateLimit(`proxy-video:${ip}`, { limit: 60, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url || url.length > 2000) {
      return NextResponse.json({ error: "Missing or invalid url" }, { status: 400 });
    }

    // Only allow Pexels and Replicate CDN domains (with boundary check to prevent SSRF)
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Block non-HTTPS
    if (parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Only HTTPS allowed" }, { status: 403 });
    }

    const h = parsed.hostname;
    const matchesDomain = (domain: string) =>
      h === domain || h.endsWith(`.${domain}`);
    const allowed =
      matchesDomain("pexels.com") ||
      matchesDomain("pexelscdn.com") ||
      matchesDomain("vimeo.com") ||
      matchesDomain("replicate.delivery");
    if (!allowed) {
      return NextResponse.json({ error: "Invalid domain" }, { status: 403 });
    }

    // Forward Range header from client (critical for mobile Safari video playback)
    const rangeHeader = request.headers.get("range");
    const upstreamHeaders: HeadersInit = {};
    if (rangeHeader) {
      upstreamHeaders["Range"] = rangeHeader;
    }

    const response = await fetch(url, { headers: upstreamHeaders, redirect: "follow" });
    if (!response.ok && response.status !== 206) {
      throw new Error(`Upstream error: ${response.status}`);
    }

    // After following redirects, validate the final URL's domain
    if (response.url && response.url !== url) {
      const finalHost = new URL(response.url).hostname;
      const matchesFinalDomain = (domain: string) =>
        finalHost === domain || finalHost.endsWith(`.${domain}`);
      const finalAllowed =
        matchesFinalDomain("pexels.com") ||
        matchesFinalDomain("pexelscdn.com") ||
        matchesFinalDomain("vimeo.com") ||
        matchesFinalDomain("replicate.delivery");
      if (!finalAllowed) {
        return NextResponse.json({ error: "Redirect to disallowed domain" }, { status: 403 });
      }
    }

    // Validate content-type
    const contentType = response.headers.get("content-type");
    if (!contentType) {
      return NextResponse.json({ error: "Missing content type" }, { status: 403 });
    }
    const isAllowedType = ALLOWED_CONTENT_TYPES.some((t) => contentType.startsWith(t));
    if (!isAllowedType) {
      return NextResponse.json({ error: "Invalid content type" }, { status: 403 });
    }

    // Check content-length if available
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!Number.isFinite(size) || size > MAX_SIZE) {
        return NextResponse.json({ error: "File too large" }, { status: 413 });
      }
    }

    const body = response.body;

    // Build response headers
    const resHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": getOwnOrigin(request),
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Accept-Ranges": "bytes",
    };

    // Forward Range-related headers for partial content
    if (contentLength) {
      resHeaders["Content-Length"] = contentLength;
    }
    const contentRange = response.headers.get("content-range");
    if (contentRange) {
      resHeaders["Content-Range"] = contentRange;
    }

    return new NextResponse(body, {
      status: response.status, // 200 for full, 206 for partial
      headers: resHeaders,
    });
  } catch (error) {
    console.error("Video proxy error:", error);
    return NextResponse.json(
      { error: "Video proxy failed" },
      { status: 500 }
    );
  }
}

function getOwnOrigin(request: NextRequest): string {
  const proto = (request.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = request.headers.get("host") || "localhost";
  return `${proto}://${host}`;
}
