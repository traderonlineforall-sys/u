import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCookieName, signSession } from "../../../lib/session.js";
import { enforceSameOrigin, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { ensureNicknameForUser, getNicknameProfile, normalizeUserId, cleanNickname } from "../../../lib/server/nickname.js";
import {
  buildDeviceConfidence,
  findDeviceNicknameMatch,
  recordDeviceNickname,
  verifyDeviceNicknameChoice,
} from "../../../lib/server/device-confidence.js";
import {
  makeTrustedDeviceToken,
  registerTrustedDeviceIdentity,
  resolveTrustedDeviceIdentity,
  setTrustedDeviceCookie,
} from "../../../lib/server/device-identity.js";
import {
  createDeviceRecoveryTicket,
  verifyDeviceRecoveryTicket,
} from "../../../lib/server/device-recovery.js";

export const runtime = "nodejs";

const MAX_LOGIN_BODY_BYTES = 32768;
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

function smartIdentityMode(){
  const mode = String(process.env.SMART_IDENTITY_MODE || "smart").trim().toLowerCase();
  return ["smart", "suggestions", "exact"].includes(mode) ? mode : "smart";
}

export async function POST(request) {
  const sameOrigin = enforceSameOrigin(request);
  if(!sameOrigin.ok){
    return noStore(NextResponse.json({ error:sameOrigin.error }, { status:sameOrigin.status || 403 }));
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if(Number.isFinite(contentLength) && contentLength > MAX_LOGIN_BODY_BYTES){
    return noStore(NextResponse.json({ error:"Request body too large" }, { status:413 }));
  }

  const BASIC_USER = process.env.BASIC_AUTH_USER || "";
  const BASIC_PASS = process.env.BASIC_AUTH_PASS || "";
  const SESSION_SECRET = process.env.SESSION_SECRET || "";
  if(!SESSION_SECRET){
    return noStore(NextResponse.json({ error:"Server not configured (missing SESSION_SECRET)." }, { status:500 }));
  }

  let body = {};
  try { body = await request.json(); } catch {}

  const username = String(body.username || "");
  const password = String(body.password || "");
  const incomingUserId = normalizeUserId(body.user_id);
  const requestedNickname = cleanNickname(body.nickname || body.display_name || "");
  const recoveryTicket = String(body.recovery_ticket || "");
  const recoveryChoiceId = String(body.recovery_choice_id || "");
  const skipSmartRecovery = body.skip_smart_recovery === true;
  const recoveryMode = smartIdentityMode();
  const deviceFingerprint = buildDeviceConfidence(request, body.device_fingerprint || {}, SESSION_SECRET);

  if(isLimited(request, username)){
    await new Promise((resolve)=>setTimeout(resolve, 500));
    return noStore(NextResponse.json({ error:"Too many login attempts. Try again later." }, { status:429 }));
  }

  const credentialsOk = timingSafeEqual(username, BASIC_USER) && timingSafeEqual(password, BASIC_PASS);
  if(!credentialsOk){
    noteFailure(request, username);
    await new Promise((resolve)=>setTimeout(resolve, 350));
    return noStore(NextResponse.json({ error:"Invalid credentials" }, { status:401 }));
  }
  clearFailures(request, username);

  if(!deviceFingerprint?.ok){
    return noStore(NextResponse.json({ error:deviceFingerprint?.error || "Could not build device identity." }, { status:500 }));
  }

  let finalUserId = "";
  let displayName = "";
  let recoveredByDevice = false;
  let trustedDevice = null;
  let identityMethod = "new_device_registration";
  let recoveryConfidence = 0;

  try {
    const supabase = getServiceSupabase();

    // 1) Strongest proof: signed HttpOnly trusted-device cookie plus the exact
    // random browser key. This path never uses fuzzy fingerprint matching.
    const trusted = await resolveTrustedDeviceIdentity(request, supabase, deviceFingerprint);
    if(!trusted.ok){
      return noStore(NextResponse.json({ error:trusted.error || "Could not verify trusted device." }, { status:trusted.status || 500 }));
    }
    if(trusted.matched){
      finalUserId = trusted.user_id;
      displayName = trusted.display_name;
      recoveredByDevice = true;
      trustedDevice = trusted;
      identityMethod = "trusted_device_key";
      recoveryConfidence = 100;
    }

    // 2) User-confirmed smart recovery. The browser never sends a user_id as
    // proof: it sends an opaque choice id inside a short-lived signed ticket,
    // and the server re-runs the fingerprint ranking before accepting it.
    if(!finalUserId && recoveryTicket && recoveryChoiceId){
      const ticket = await verifyDeviceRecoveryTicket(
        recoveryTicket,
        recoveryChoiceId,
        deviceFingerprint,
        SESSION_SECRET
      );
      if(!ticket.ok){
        await new Promise((resolve)=>setTimeout(resolve, 250));
        return noStore(NextResponse.json({ error:ticket.error }, { status:ticket.status || 409 }));
      }

      const confirmed = await verifyDeviceNicknameChoice(supabase, deviceFingerprint, ticket.user_id);
      if(!confirmed.ok){
        return noStore(NextResponse.json({ error:confirmed.error || "Could not verify the selected nickname." }, { status:500 }));
      }
      if(!confirmed.matched){
        await new Promise((resolve)=>setTimeout(resolve, 250));
        return noStore(NextResponse.json({
          error:"درجة تطابق الجهاز لا تكفي لاستخدام هذه الكنية بأمان. اختر «ليست كنيتي» وسجّل كجهاز جديد.",
          recovery_rejected:true,
          recovery_reason:confirmed.reason || "low_confidence",
        }, { status:409 }));
      }

      finalUserId = confirmed.user_id;
      displayName = confirmed.display_name;
      recoveredByDevice = true;
      identityMethod = confirmed.recovery_method || "smart_suggestion_v2";
      recoveryConfidence = Number(confirmed.confidence_score || 0);
    }

    // 3) Strict automatic smart recovery. It aggregates historical observations
    // per user, normalizes evidence by browser capabilities, penalizes stable
    // contradictions and refuses close/ambiguous candidates.
    if(!finalUserId && !recoveryTicket && !skipSmartRecovery && recoveryMode !== "exact"){
      const smart = await findDeviceNicknameMatch(supabase, deviceFingerprint);
      if(!smart.ok){
        return noStore(NextResponse.json({ error:smart.error || "Could not verify existing device." }, { status:500 }));
      }

      if(smart.matched && recoveryMode === "smart"){
        finalUserId = smart.user_id;
        displayName = smart.display_name;
        recoveredByDevice = true;
        identityMethod = smart.recovery_method || "smart_fingerprint_v2";
        recoveryConfidence = Number(smart.confidence_score || 0);
      }else if(Array.isArray(smart.suggestions) && smart.suggestions.length){
        const recovery = await createDeviceRecoveryTicket(
          deviceFingerprint,
          smart.suggestions,
          SESSION_SECRET
        );
        if(recovery.ok){
          return noStore(NextResponse.json({
            error:"تعذر التأكد تلقائيًا بنسبة آمنة. اختر كنيتك من النتائج الأقرب.",
            nickname_selection_required:true,
            recovery_ticket:recovery.token,
            nickname_suggestions:recovery.choices,
            recovery_reason:smart.reason || (recoveryMode === "suggestions" ? "manual_confirmation_mode" : "confirmation_required"),
          }, { status:409 }));
        }
      }
    }

    // 4) Truly new device/user. A browser-provided user_id is never allowed to
    // claim an existing profile. It is reused only when no database profile owns it.
    if(!finalUserId){
      let candidateUserId = incomingUserId;
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
      identityMethod = "new_device_registration";
      recoveryConfidence = 100;
    }

    const registered = await registerTrustedDeviceIdentity(supabase, finalUserId, displayName, deviceFingerprint);
    if(!registered.ok){
      return noStore(NextResponse.json({ error:registered.error || "Could not register trusted device." }, { status:registered.status || 500 }));
    }
    if(!registered.missing_table) trustedDevice = registered;

    // Learn only after the identity is exact, automatically high-confidence, or
    // explicitly confirmed through a signed candidate ticket.
    await recordDeviceNickname(
      supabase,
      finalUserId,
      displayName,
      deviceFingerprint,
      Math.max(78, Math.min(100, Number(recoveryConfidence || 100)))
    );
  } catch (err) {
    return noStore(NextResponse.json({ error:String(err?.message || err || "Could not verify nickname.") }, { status:500 }));
  }

  const expMs = Date.now() + 12 * 60 * 60 * 1000;
  const token = await signSession({ u:username, uid:finalUserId, name:displayName, exp:expMs }, SESSION_SECRET);

  let trustedDeviceToken = "";
  if(trustedDevice?.device_id){
    trustedDeviceToken = await makeTrustedDeviceToken({
      device_id:trustedDevice.device_id,
      user_id:finalUserId,
    });
  }

  const response = noStore(NextResponse.json({
    ok:true,
    user_id:finalUserId,
    display_name:displayName,
    recovered_by_device:recoveredByDevice,
    identity_method:identityMethod,
    recovery_confidence:Math.round(Number(recoveryConfidence || 0)),
  }));

  response.cookies.set({
    name:getCookieName(),
    value:token,
    httpOnly:true,
    secure:true,
    sameSite:"strict",
    path:"/",
    maxAge:12 * 60 * 60,
  });

  return setTrustedDeviceCookie(response, trustedDeviceToken);
}
