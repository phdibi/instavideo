import { NextRequest, NextResponse } from "next/server";

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

const ALLOWED_CONTENT_TYPES = [
  "video/",
  "image/",
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
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
      matchesDomain("replicate.delivery") ||
      matchesDomain("replicate.com");
    if (!allowed) {
      return NextResponse.json({ error: "Invalid domain" }, { status: 403 });
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Upstream error: ${response.status}`);
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

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch (error) {
    console.error("Video proxy error:", error);
    return NextResponse.json(
      { error: "Video proxy failed" },
      { status: 500 }
    );
  }
}
