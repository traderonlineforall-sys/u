import { NextResponse } from "next/server";
import { getCookieName, signSession } from "../../../lib/session.js";
import { enforceSameOrigin, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { ensureNicknameForUser, getNicknameProfile, normalizeUserId, cleanNickname } from "../../../lib/server/nickname.js";
import { buildDeviceConfidence, findDeviceNicknameMatch, verifyDeviceNicknameChoice, recordDeviceNickname, touchDeviceNickname } from "../../../lib/server/device-confidence.js";

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
  const selectedRecoveryUserId = normalizeUserId(body.recovery_user_id || body.selected_recovery_user_id || "");
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

  if (!incoming_user_id) {
    return noStore(NextResponse.json({ error: "Missing browser identity. Refresh the login page and try again." }, { status: 400 }));
  }

  let finalUserId = incoming_user_id;
  let displayName = "";
  let recoveredByDevice = false;
  let deviceConfidence = 0;

  try {
    const supabase = getServiceSupabase();

    // Step 4.3: always try device-confidence recovery first. This prevents a user
    // on the same confident device from changing nickname simply by clearing cookies.
    const match = await findDeviceNicknameMatch(supabase, deviceFingerprint);
    if(!match.ok){
      return noStore(NextResponse.json({ error: match.error || "Could not verify device nickname." }, { status: 500 }));
    }

    if(match.matched){
      finalUserId = match.user_id;
      displayName = match.display_name;
      recoveredByDevice = true;
      deviceConfidence = Number(match.confidence_score || 0);
      await touchDeviceNickname(supabase, match.device_hash);
    } else {
      if(selectedRecoveryUserId){
        const choice = await verifyDeviceNicknameChoice(supabase, deviceFingerprint, selectedRecoveryUserId, { minScore: 72, suggestionThreshold: 60, gap: 8, maxSuggestions: 8 });
        if(!choice.ok){
          return noStore(NextResponse.json({ error: choice.error || "Could not verify selected nickname." }, { status: 500 }));
        }
        if(choice.matched){
          finalUserId = choice.user_id;
          displayName = choice.display_name;
          recoveredByDevice = true;
          deviceConfidence = Number(choice.confidence_score || 0);
          await touchDeviceNickname(supabase, choice.device_hash);
        } else {
          const reason = choice.reason || match.reason || "choice_not_confident";
          const msg = reason === "choice_score_too_low"
            ? `التطابق مع الكنية المختارة ${Math.round(Number(choice.selected_score || 0))}% فقط، وده أقل من حد التأكيد الآمن. اكتب كنية جديدة أو اطلب من الأدمن عمل Reset nickname لو دي كنيتك.`
            : reason === "choice_ambiguous"
              ? "الجهاز قريب من أكثر من كنية، لذلك لا يمكن تأكيد الاختيار بأمان. اكتب كنية جديدة أو اطلب من الأدمن المساعدة."
              : reason === "choice_not_top_candidate"
                ? "الكنية المختارة ليست أقرب تطابق لهذا الجهاز، لذلك تم رفض الاختيار لحماية أسماء المستخدمين."
                : "لم أستطع تأكيد الكنية المختارة لهذا الجهاز. اكتب كنية جديدة أو اختر مقترحًا أقوى إن ظهر.";
          return noStore(NextResponse.json({
            error: msg,
            nickname_required: true,
            recovery_rejected: true,
            nickname_suggestions: choice.suggestions || match.suggestions || [],
            device_confidence: {
              matched:false,
              reason,
              best_score: match.best_score || choice.best_score || 0,
              selected_score: choice.selected_score || 0,
              manual_threshold: choice.manual_threshold || 72,
              ambiguous: !!(choice.ambiguous || match.ambiguous),
            },
            user_id: finalUserId,
          }, { status: 409 }));
        }
      } else {
        if(body.nickname_from_storage){
          const profile = await getNicknameProfile(supabase, finalUserId);
          if(profile?.ok && profile.reset_required){
            return noStore(NextResponse.json({
              error: "الأدمن طلب إعادة اختيار الكنية. اكتب كنية خيالية جديدة.",
              nickname_required: true,
              user_id: finalUserId,
            }, { status: 409 }));
          }
        }
        const nicknameResult = await ensureNicknameForUser(supabase, finalUserId, requestedNickname);
        if (!nicknameResult?.ok) {
          return noStore(NextResponse.json({
            error: nicknameResult?.error || "Nickname is required.",
            nickname_required: !!nicknameResult?.nickname_required,
            nickname_taken: !!nicknameResult?.nickname_taken,
            nickname_suggestions: match.suggestions || [],
            device_confidence: { matched:false, reason: match.reason || "nickname_required", best_score: match.best_score || 0, ambiguous: !!match.ambiguous, threshold: match.threshold || undefined },
            user_id: finalUserId,
          }, { status: nicknameResult?.status || 409 }));
        }
        displayName = nicknameResult.display_name || "";
        await recordDeviceNickname(supabase, finalUserId, displayName, deviceFingerprint, 100);
      }
    }
  } catch (err) {
    return noStore(NextResponse.json(
      { error: String(err?.message || err || "Could not verify nickname.") },
      { status: 500 }
    ));
  }

  const expMs = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
  const token = await signSession({ u: username, uid: finalUserId, name: displayName, exp: expMs }, SESSION_SECRET);

  const res = noStore(NextResponse.json({
    ok: true,
    user_id: finalUserId,
    display_name: displayName,
    recovered_by_device: recoveredByDevice,
    device_confidence_score: deviceConfidence,
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

  return res;
}
