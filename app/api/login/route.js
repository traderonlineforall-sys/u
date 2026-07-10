import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCookieName, signSession } from "../../../lib/session.js";
import { enforceSameOrigin, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { ensureNicknameForUser, getNicknameProfile, normalizeUserId, cleanNickname } from "../../../lib/server/nickname.js";
import { buildDeviceConfidence, findDeviceNicknameMatch, recordDeviceNickname } from "../../../lib/server/device-confidence.js";
import { makeTrustedDeviceToken, registerTrustedDeviceIdentity, resolveTrustedDeviceIdentity, setTrustedDeviceCookie } from "../../../lib/server/device-identity.js";

export const runtime = "nodejs";

const MAX_LOGIN_BODY_BYTES = 16384;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_FAILURE_CACHE_LIMIT = 512;
const textEncoder = new TextEncoder();
const loginFailures = globalThis.__srLoginFailures || new Map();
globalThis.__srLoginFailures = loginFailures;

function timingSafeEqual(a, b) {
  const aa = textEncoder.encode(String(a || ""));
  const bb = textEncoder.encode(String(b || ""));
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
  if (loginFailures.size < LOGIN_FAILURE_CACHE_LIMIT) return;
  for (const [key, record] of loginFailures) {
    if (!record || now - record.firstAt > LOGIN_WINDOW_MS) loginFailures.delete(key);
  }
  while (loginFailures.size > LOGIN_FAILURE_CACHE_LIMIT) {
    const oldestKey = loginFailures.keys().next().value;
    if (!oldestKey) break;
    loginFailures.delete(oldestKey);
  }
}

function failureKey(request, username) {
  return `${clientIp(request)}:${String(username || "").slice(0, 80)}`;
}

function isLimited(request, username) {
  const now = Date.now();
  cleanupFailures(now);
  const key = failureKey(request, username);
  const record = loginFailures.get(key);
  if (!record) return false;
  if (now - record.firstAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
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
  const incoming_user_id = normalizeUserId(body.user_id);
  const requestedNickname = cleanNickname(body.nickname || body.display_name || "");
  const deviceFingerprint = buildDeviceConfidence(request, body.device_fingerprint || {}, SESSION_SECRET);

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

  let finalUserId = "";
  let displayName = "";
  let recoveredByDevice = false;
  let trustedDevice = null;

  try {
    const supabase = getServiceSupabase();

    // Primary identity proof: exact random browser key + signed HttpOnly device
    // cookie. IP, user-agent, canvas and all fuzzy signals are never allowed to
    // select another user's nickname.
    const trusted = await resolveTrustedDeviceIdentity(request, supabase, deviceFingerprint);
    if(!trusted.ok){
      return noStore(NextResponse.json({ error: trusted.error || "Could not verify trusted device." }, { status:trusted.status || 500 }));
    }
    if(trusted.matched){
      finalUserId = trusted.user_id;
      displayName = trusted.display_name;
      recoveredByDevice = true;
      trustedDevice = trusted;
    }

    // One-time seamless migration for devices learned by the old version. Only
    // an exact legacy device hash may migrate; fuzzy candidates are ignored.
    if(!finalUserId){
      const legacy = await findDeviceNicknameMatch(supabase, deviceFingerprint, {
        threshold:105,
        suggestionThreshold:999,
        maxSuggestions:0,
      });
      if(!legacy.ok){
        return noStore(NextResponse.json({ error: legacy.error || "Could not verify existing device." }, { status: 500 }));
      }
      if(legacy.matched){
        finalUserId = legacy.user_id;
        displayName = legacy.display_name;
        recoveredByDevice = true;
      }
    }

    if(!finalUserId){
      // Never claim an existing identity from a browser-supplied user_id. Reuse
      // it only when it is not present in the database; otherwise create a new
      // server-generated identity.
      let candidateUserId = incoming_user_id;
      if(candidateUserId){
        const candidateProfile = await getNicknameProfile(supabase, candidateUserId);
        if(!candidateProfile?.ok || candidateProfile.exists) candidateUserId = "";
      }
      finalUserId = candidateUserId || `uid_${randomUUID()}`;

      const nicknameResult = await ensureNicknameForUser(supabase, finalUserId, requestedNickname);
      if(!nicknameResult?.ok){
        return noStore(NextResponse.json({
          error:nicknameResult?.error || "Nickname is required.",
          nickname_required:true,
          nickname_taken:!!nicknameResult?.nickname_taken,
          nickname_suggestions:[],
          trusted_device_required:true,
        }, { status:nicknameResult?.status || 409 }));
      }
      displayName = nicknameResult.display_name || "";
    }

    const registered = await registerTrustedDeviceIdentity(supabase, finalUserId, displayName, deviceFingerprint);
    if(!registered.ok){
      return noStore(NextResponse.json({ error:registered.error || "Could not register trusted device." }, { status:registered.status || 500 }));
    }
    if(!registered.missing_table) trustedDevice = registered;

    // Keep the old hashed signal record temporarily for admin diagnostics only.
    // It is no longer an authentication or recovery mechanism.
    await recordDeviceNickname(supabase, finalUserId, displayName, deviceFingerprint, 110);
  } catch (err) {
    return noStore(NextResponse.json(
      { error: String(err?.message || err || "Could not verify nickname.") },
      { status: 500 }
    ));
  }

  const expMs = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
  const token = await signSession({ u: username, uid: finalUserId, name: displayName, exp: expMs }, SESSION_SECRET);

  let trustedDeviceToken = "";
  if(trustedDevice?.device_id){
    trustedDeviceToken = await makeTrustedDeviceToken({
      device_id:trustedDevice.device_id,
      user_id:finalUserId,
    });
  }

  const res = noStore(NextResponse.json({
    ok: true,
    user_id: finalUserId,
    display_name: displayName,
    recovered_by_device: recoveredByDevice,
    identity_method: trustedDevice?.device_id ? "trusted_device_key" : "legacy_compatibility",
  }));

  res.cookies.set({
    name: getCookieName(),
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return setTrustedDeviceCookie(res, trustedDeviceToken);
}
