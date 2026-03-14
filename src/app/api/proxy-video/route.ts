import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    // Only allow Pexels and Replicate CDN domains (with boundary check to prevent SSRF)
    const parsed = new URL(url);
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

    const contentType = response.headers.get("content-type") || "video/mp4";
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
