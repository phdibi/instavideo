import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protects API routes from cross-origin abuse.
 *
 * Strategy:
 * 1. Non-browser requests (no Origin header) from same server are allowed (SSR, server actions)
 * 2. Browser requests must come from the same host (Origin matches Host)
 * 3. Preflight (OPTIONS) is handled for the proxy route which needs CORS for <video>/<img>
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/* routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Allow preflight for proxy-video (needed for <video> CORS)
  if (request.method === "OPTIONS" && pathname === "/api/proxy-video") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getOwnOrigin(request),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Origin check: browser requests must come from the same host
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("host") || "";
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (originHost !== host) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

/** Reconstruct the app's own origin from the request */
function getOwnOrigin(request: NextRequest): string {
  const proto = (request.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = request.headers.get("host") || "localhost";
  return `${proto}://${host}`;
}

export const config = {
  matcher: "/api/:path*",
};
