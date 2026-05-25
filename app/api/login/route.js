import { NextResponse } from "next/server";
import { getCookieName, signSession } from "../../../lib/session.js";
import { enforceSameOrigin, noStore } from "../../../lib/server/auth.js";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function POST(request) {
  const so = enforceSameOrigin(request);
  if(!so.ok){
    return noStore(NextResponse.json({ error: so.error }, { status: so.status || 403 }));
  }
  const BASIC_USER = process.env.BASIC_AUTH_USER || "";
  const BASIC_PASS = process.env.BASIC_AUTH_PASS || "";
  const SESSION_SECRET = process.env.SESSION_SECRET || "";

  if (!SESSION_SECRET) {
    return noStore(NextResponse.json(
      { error: "Server not configured (missing SESSION_SECRET)." },
      { status: 500 }
    ));
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
    // small constant delay to slow brute-force attempts
    await new Promise((r)=>setTimeout(r, 350));
    return noStore(NextResponse.json({ error: "Invalid credentials" }, { status: 401 }));
  }

  const expMs = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
  const token = await signSession({ u: username, exp: expMs }, SESSION_SECRET);

  const res = noStore(NextResponse.json({ ok: true }));

  res.cookies.set({
    name: getCookieName(),
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return res;
}
