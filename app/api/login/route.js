import { NextResponse } from "next/server";
import { getCookieName, signSession } from "../../../lib/session.js";

export const runtime = "nodejs";

export async function POST(request) {
  const BASIC_USER = process.env.BASIC_AUTH_USER || "";
  const BASIC_PASS = process.env.BASIC_AUTH_PASS || "";
  const SESSION_SECRET = process.env.SESSION_SECRET || process.env.BASIC_AUTH_PASS || "";

  if (!SESSION_SECRET) {
    return NextResponse.json(
      { error: "Server not configured (missing SESSION_SECRET)." },
      { status: 500 }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    // ignore
  }

  const username = (body.username || "").toString();
  const password = (body.password || "").toString();

  const ok = username === BASIC_USER && password === BASIC_PASS;

  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const expMs = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
  const token = await signSession({ u: username, exp: expMs }, SESSION_SECRET);

  const res = NextResponse.json({ ok: true });

  res.cookies.set({
    name: getCookieName(),
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return res;
}
