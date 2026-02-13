import { NextResponse } from "next/server";
import { getCookieName, verifySession } from "./lib/session.js";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/login",
  "/api/logout",
]);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow public paths + the login page assets
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/login/")) {
    return NextResponse.next();
  }

  // Allow direct access to static assets in /public when NOT authenticated?
  // No: we want everything protected. But allow the login page to load its assets via /_next.
  // Static tool assets are served under / (e.g., /index.html, /styles.css, /app.js). We keep them protected.

  const cookieName = getCookieName();
  const token = request.cookies.get(cookieName)?.value || "";
  const secret = process.env.SESSION_SECRET || process.env.BASIC_AUTH_PASS || "";

  if (!secret) {
    return new NextResponse("Server not configured (missing SESSION_SECRET).", { status: 503 });
  }

  const result = await verifySession(token, secret);

  if (result.ok) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);

  const res = NextResponse.redirect(url);
  // Avoid caching redirects; helps with cookie changes.
  res.headers.set("x-middleware-cache", "no-cache");
  return res;
}
