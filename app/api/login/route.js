import { NextResponse } from "next/server";
import { getCookieName, signSession } from "../../../lib/session.js";
import { enforceSameOrigin, noStore } from "../../../lib/server/auth.js";

export const runtime = "nodejs";

const MAX_LOGIN_BODY_BYTES = 4096;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const loginFailures = globalThis.__srLoginFailures || new Map();
globalThis.__srLoginFailures = loginFailures;

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aa = enc.encode(String(a || ""));
  const bb = enc.encode(String(b || ""));
  const max = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < max; i += 1) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}

function clientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  const realIp = request.headers.get("x-real-ip");
  const xf = request.headers.get("x-forwarded-for");
  return cfIp || realIp || (xf ? xf.split(",")[0].trim() : "") || "unknown";
}

function cleanupFailures(now) {
  if (loginFailures.size < 1000) return;
  for (const [key, record] of loginFailures) {
    if (!record || now - record.firstAt > LOGIN_WINDOW_MS) loginFailures.delete(key);
  }
}

function failureKey(request, username) {
  return `${clientIp(request)}:${String(username || "").slice(0, 80)}`;
}

function isLimited(request, username) {
  const now = Date.now();
  cleanupFailures(now);
  const record = loginFailures.get(failureKey(request, username));
  if (!record) return false;
  if (now - record.firstAt > LOGIN_WINDOW_MS) return false;
  return record.count >= LOGIN_MAX_FAILURES;
}

function noteFailure(request, username) {
  const now = Date.now();
  const key = failureKey(request, username);
  const current = loginFailures.get(key);
  if (!current || now - current.firstAt > LOGIN_WINDOW_MS) {
    loginFailures.set(key, { firstAt: now, count: 1 });
    return;
  }
  current.count += 1;
  current.lastAt = now;
}

function clearFailures(request, username) {
  loginFailures.delete(failureKey(request, username));
}

export async function POST(request) {
  const so = enforceSameOrigin(request);
  if(!so.ok){
    return noStore(NextResponse.json({ error: so.error }, { status: so.status || 403 }));
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_LOGIN_BODY_BYTES) {
    return noStore(NextResponse.json({ error: "Request body too large" }, { status: 413 }));
  }

  const BASIC_USER = process.env.BASIC_AUTH_USER || "";
  const BASIC_PASS = process.env.BASIC_AUTH_PASS || "";
  const SESSION_SECRET = process.env.SESSION_SECRET || process.env.BASIC_AUTH_PASS || "";

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

  if (isLimited(request, username)) {
    await new Promise((r)=>setTimeout(r, 500));
    return noStore(NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 }));
  }

  const ok = timingSafeEqual(username, BASIC_USER) && timingSafeEqual(password, BASIC_PASS);

  if (!ok) {
    noteFailure(request, username);
    // small constant delay to slow brute-force attempts
    await new Promise((r)=>setTimeout(r, 350));
    return noStore(NextResponse.json({ error: "Invalid credentials" }, { status: 401 }));
  }

  clearFailures(request, username);

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
