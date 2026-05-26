import { NextResponse } from "next/server";
import { getCookieName, verifySession } from "./lib/session.js";

export const config = {
  // Protect pages, HTML files, and API routes, but do not run middleware for heavy static assets.
  // This keeps login protection for the tool while reducing edge/worker requests dramatically.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|map|txt)$).*)",
  ],
};

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/login",
  "/api/logout",
]);

function clientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  const realIp = request.headers.get("x-real-ip");
  const xf = request.headers.get("x-forwarded-for");
  return (
    request.ip ||
    cfIp ||
    realIp ||
    (xf ? xf.split(",")[0].trim() : "") ||
    ""
  );
}

function applySecurityHeaders(res) {
  // Lightweight headers that won't break the legacy tool UI.
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // Avoid caching authenticated HTML/API responses or redirects.
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Optional IP allowlist (comma-separated). If set, block everyone else early.
  const allow = (process.env.ALLOWLIST_IPS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (allow.length) {
    const ip = clientIp(request);
    if (!ip || !allow.includes(ip)) {
      return applySecurityHeaders(new NextResponse("Forbidden", { status: 403 }));
    }
  }

  // Public paths must remain reachable without a session.
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/login/")) {
    return applySecurityHeaders(NextResponse.next());
  }

  const cookieName = getCookieName();
  const token = request.cookies.get(cookieName)?.value || "";
  const secret = process.env.SESSION_SECRET || process.env.BASIC_AUTH_PASS || "";

  if (!secret) {
    return applySecurityHeaders(
      new NextResponse("Server not configured (missing SESSION_SECRET).", { status: 503 })
    );
  }

  const result = await verifySession(token, secret);
  if (result.ok) {
    return applySecurityHeaders(NextResponse.next());
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);

  const res = NextResponse.redirect(url);
  res.headers.set("x-middleware-cache", "no-cache");
  return applySecurityHeaders(res);
}
