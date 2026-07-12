import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCookieName, signSession } from "../../../lib/session.js";
import { enforceSameOrigin, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { ensureNicknameForUser, getNicknameProfile } from "../../../lib/server/nickname.js";
import {
  buildDeviceConfidence,
  findDeviceNicknameMatch,
  recordDeviceNickname,
  verifyDeviceNicknameChoice,
} from "../../../lib/server/device-confidence.js";
import {
  checkDeviceOwnerConflict,
  finalizeTrustedDeviceCredential,
  registerTrustedDeviceIdentity,
  resolveTrustedDeviceIdentity,
  setTrustedDeviceCookie,
} from "../../../lib/server/device-identity.js";
import {
  clearRecoveryAttemptCookie,
  consumeDeviceRecoveryTicket,
  createDeviceRecoveryTicket,
  setRecoveryAttemptCookie,
  verifyDeviceRecoveryTicket,
} from "../../../lib/server/device-recovery.js";
import {
  decideDeviceIdentity,
  DEVICE_DECISIONS,
  getDeviceIdentityMode,
} from "../../../lib/server/device-policy.js";
import {
  logDeviceDecision,
  markDeviceDecisionExecuted,
  newDecisionId,
} from "../../../lib/server/device-audit.js";
import { takeRateLimit } from "../../../lib/server/rate-limit.js";
import { registerUserSession, revokeUserSession } from "../../../lib/server/session-registry.js";

export const runtime = "nodejs";

const MAX_LOGIN_BODY_BYTES = 32768;
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
const textEncoder = new TextEncoder();
const FORBIDDEN_IDENTITY_FIELDS = new Set([
  "user_id", "primary_user_id", "nickname", "display_name",
  "device_id", "device_hash", "confidence_score",
]);

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
  const forwarded = request.headers.get("x-forwarded-for");
  return String(cfIp || realIp || (forwarded ? forwarded.split(",")[0].trim() : "") || "unknown").slice(0, 96);
}

function j(body, init) {
  return noStore(NextResponse.json(body, init));
}

function genericIdentityFailure(status = 409) {
  return j({
    error: "تعذر التحقق من هوية هذا الجهاز بأمان. تواصل مع المسؤول لربط الجهاز أو مراجعته.",
    identity_verification_required: true,
  }, { status });
}

async function completeLogin({
  supabase, username, userId, displayName, deviceId, ownerState,
  credentialAction, decisionType, decisionSource, assurance,
  canStrengthen, parentDecisionId, automatic = true, fingerprint,
}) {
  const decisionId = newDecisionId();
  const evidenceGroups = assurance === "verified_credential"
    ? ["http_only_credential", "server_owner_binding"]
    : assurance === "verified_selection_enrollment"
      ? ["signed_one_time_selection", "server_recomputed_shortlist", "server_owner_conflict_check"]
      : assurance === "verified_historical_device_observation"
        ? ["exact_historical_observation", "server_profile_lookup", "server_owner_conflict_check"]
        : ["browser_local_secret", "server_owner_binding"];

  const audit = await logDeviceDecision(supabase, {
    decision_id: decisionId,
    device_id: deviceId,
    user_id: userId,
    decision_type: decisionType,
    decision_source: decisionSource,
    truth_level: ownerState || "verified_device",
    evidence_groups: evidenceGroups,
    evidence_lineage: { parent: parentDecisionId || null, assurance },
    parent_decision_id: parentDecisionId,
    automatic,
    executed: false,
    can_strengthen: canStrengthen,
  });
  if (!audit.ok) return j({ error: "Could not create authenticated session." }, { status: 503 });

  const sessionId = randomUUID();
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  let sessionToken;
  try {
    sessionToken = await signSession({
      role: "user", session_version: 2, u: username, uid: userId,
      name: displayName, sid: sessionId, assurance,
      decision_id: decisionId, can_strengthen: canStrengthen,
      iat: Date.now(), exp: expiresAt,
    }, process.env.SESSION_SECRET || "");
  } catch {
    return j({ error: "Could not create authenticated session." }, { status: 503 });
  }

  const registeredSession = await registerUserSession(supabase, {
    session_id: sessionId,
    user_id: userId,
    decision_id: decisionId,
    assurance,
    expires_at: expiresAt,
  });
  if (!registeredSession.ok) {
    return j({ error: registeredSession.error || "Could not create authenticated session." }, { status: registeredSession.status || 503 });
  }

  const finalizedAudit = await markDeviceDecisionExecuted(supabase, decisionId);
  if (!finalizedAudit.ok) {
    await revokeUserSession(supabase, { sid: sessionId, uid: userId });
    return j({ error: "Could not create authenticated session." }, { status: 503 });
  }

  const credential = await finalizeTrustedDeviceCredential(supabase, credentialAction, fingerprint);
  if (!credential.ok) {
    await revokeUserSession(supabase, { sid: sessionId, uid: userId });
    return j({ error: credential.error || "Could not finalize device credential." }, { status: credential.status || 503 });
  }

  await recordDeviceNickname(supabase, userId, displayName, fingerprint, 100, {
    device_id: deviceId,
    decision_id: decisionId,
    source: assurance === "verified_credential"
      ? "verified_device_credential"
      : assurance === "credential_continuation"
        ? "verified_local_device_secret"
        : assurance === "verified_historical_device_observation"
          ? "verified_historical_device_observation"
          : "verified_selection_enrollment",
    truth_level: ownerState,
    canStrengthen,
    evidence_groups: evidenceGroups,
    evidence_lineage: { decision_id: decisionId, source: decisionSource },
  });

  let response = j({ ok: true, display_name: displayName });
  response.cookies.set({
    name: getCookieName(), value: sessionToken, httpOnly: true,
    secure: true, sameSite: "strict", path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  response = clearRecoveryAttemptCookie(response);
  return setTrustedDeviceCookie(response, credential.token);
}

async function enrollAndLogin({
  supabase, username, fingerprint, userId, displayName,
  source, assurance, decisionType, automatic, parentDecisionId,
}) {
  const ownerCheck = await checkDeviceOwnerConflict(supabase, fingerprint, userId);
  if (!ownerCheck.ok) return j({ error: ownerCheck.error || "Could not verify device owner." }, { status: ownerCheck.status || 503 });
  if (ownerCheck.conflict || ownerCheck.rejected) return genericIdentityFailure(409);

  const enrolled = await registerTrustedDeviceIdentity(
    supabase,
    userId,
    displayName,
    fingerprint,
    { owner_state: "enrolled_from_verified_selection", source }
  );
  if (!enrolled.ok) {
    if (enrolled.conflict || enrolled.rejected) return genericIdentityFailure(enrolled.status || 409);
    return j({ error: enrolled.error || "Could not enroll device." }, { status: enrolled.status || 503 });
  }

  return completeLogin({
    supabase, username, userId, displayName,
    deviceId: enrolled.device_id,
    ownerState: enrolled.owner_state,
    credentialAction: { type: "issue", device_id: enrolled.device_id },
    decisionType,
    decisionSource: source,
    assurance,
    canStrengthen: false,
    parentDecisionId,
    automatic,
    fingerprint,
  });
}

export async function POST(request) {
  const sameOrigin = enforceSameOrigin(request);
  if (!sameOrigin.ok) return j({ error: sameOrigin.error }, { status: sameOrigin.status || 403 });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_LOGIN_BODY_BYTES) {
    return j({ error: "Request body too large" }, { status: 413 });
  }

  const basicUser = process.env.BASIC_AUTH_USER || "";
  const basicPass = process.env.BASIC_AUTH_PASS || "";
  const sessionSecret = process.env.SESSION_SECRET || "";
  if (!basicUser || !basicPass || sessionSecret.length < 32) {
    return j({ error: "Server authentication is not configured." }, { status: 503 });
  }

  let body = {};
  try {
    const rawBody = await request.text();
    if (textEncoder.encode(rawBody).byteLength > MAX_LOGIN_BODY_BYTES) {
      return j({ error: "Request body too large" }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return j({ error: "Invalid login request." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return j({ error: "Invalid login request." }, { status: 400 });
  if (Object.keys(body).some((key) => FORBIDDEN_IDENTITY_FIELDS.has(key))) {
    return j({ error: "Invalid login request." }, { status: 400 });
  }

  const username = String(body.username || "").slice(0, 160);
  const password = String(body.password || "").slice(0, 512);
  const recoveryTicket = String(body.recovery_ticket || "").slice(0, 4096);
  const recoveryChoiceId = String(body.recovery_choice_id || "").slice(0, 80);
  const newNickname = String(body.new_nickname || "").slice(0, 160);
  const registerNewDevice = body.register_new_device === true;
  const rawFingerprint = body.device_fingerprint && typeof body.device_fingerprint === "object"
    ? body.device_fingerprint
    : {};

  let supabase;
  try { supabase = getServiceSupabase(); }
  catch { return j({ error: "Server authentication is not configured." }, { status: 503 }); }

  const ipLimit = await takeRateLimit(supabase, {
    scope: "login_ip", keyParts: [clientIp(request)], limit: 30, windowSeconds: 10 * 60,
  });
  if (!ipLimit.ok) return j({ error: ipLimit.error }, { status: ipLimit.status || 503 });
  if (!ipLimit.allowed) {
    const response = j({ error: "Too many login attempts. Try again later." }, { status: 429 });
    response.headers.set("Retry-After", String(ipLimit.retry_after_seconds));
    return response;
  }

  const loginLimit = await takeRateLimit(supabase, {
    scope: "login_credentials",
    keyParts: [clientIp(request), username.toLowerCase()],
    limit: 10,
    windowSeconds: 10 * 60,
  });
  if (!loginLimit.ok) return j({ error: loginLimit.error }, { status: loginLimit.status || 503 });
  if (!loginLimit.allowed) {
    const response = j({ error: "Too many login attempts. Try again later." }, { status: 429 });
    response.headers.set("Retry-After", String(loginLimit.retry_after_seconds));
    return response;
  }

  if (!timingSafeEqual(username, basicUser) || !timingSafeEqual(password, basicPass)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return j({ error: "Invalid credentials" }, { status: 401 });
  }

  const fingerprint = buildDeviceConfidence(request, rawFingerprint, sessionSecret);
  if (!fingerprint?.ok) return j({ error: "Could not verify device context." }, { status: 503 });

  const mode = getDeviceIdentityMode();
  const resolved = await resolveTrustedDeviceIdentity(request, supabase, fingerprint);
  if (!resolved.ok) return j({ error: resolved.error || "Could not verify device identity." }, { status: resolved.status || 503 });
  if (resolved.conflict || resolved.rejected) {
    await logDeviceDecision(supabase, {
      decision_type: resolved.conflict ? DEVICE_DECISIONS.CONFLICTED : DEVICE_DECISIONS.REJECTED,
      decision_source: resolved.source || "device_credential_validation",
      conflict: resolved.conflict === true,
      rejection_code: resolved.reason || "identity_rejected",
      executed: false,
      can_strengthen: false,
    });
    return genericIdentityFailure(resolved.conflict ? 409 : 403);
  }

  if (resolved.matched) {
    const policy = decideDeviceIdentity({
      mode,
      verifiedCredential: resolved.assurance === "verified_credential",
      credentialContinuation: resolved.assurance === "credential_continuation",
      ownerState: resolved.owner_state,
    });
    if (!policy.execute) return genericIdentityFailure();
    return completeLogin({
      supabase, username,
      userId: resolved.user_id,
      displayName: resolved.display_name,
      deviceId: resolved.device_id,
      ownerState: resolved.owner_state,
      credentialAction: resolved.credential_action,
      decisionType: policy.decision,
      decisionSource: resolved.source || "device_credential",
      assurance: resolved.assurance,
      canStrengthen: policy.canStrengthen && resolved.context_changed !== true,
      fingerprint,
    });
  }

  if (recoveryTicket || recoveryChoiceId) {
    if (!recoveryTicket || !recoveryChoiceId) return genericIdentityFailure();
    const ticket = await verifyDeviceRecoveryTicket(
      request, supabase, recoveryTicket, recoveryChoiceId, fingerprint, sessionSecret
    );
    if (!ticket.ok) return genericIdentityFailure(ticket.status || 409);

    const confirmed = await verifyDeviceNicknameChoice(supabase, fingerprint, ticket.user_id, {
      minScore: ticket.minimum_score,
    });
    if (!confirmed.ok || !confirmed.matched) return genericIdentityFailure(409);

    const profile = await getNicknameProfile(supabase, ticket.user_id);
    if (!profile?.ok || !profile.exists || profile.active === false || profile.reset_required || !profile.display_name) {
      return genericIdentityFailure(409);
    }

    const consumed = await consumeDeviceRecoveryTicket(supabase, ticket);
    if (!consumed.ok) return genericIdentityFailure(consumed.status || 409);

    return enrollAndLogin({
      supabase, username, fingerprint,
      userId: consumed.user_id,
      displayName: profile.display_name,
      source: ticket.context_changed
        ? "verified_selection_enrollment_context_changed"
        : "verified_selection_enrollment",
      assurance: "verified_selection_enrollment",
      decisionType: DEVICE_DECISIONS.AUTO_LOGIN_VERIFIED,
      automatic: false,
      parentDecisionId: ticket.parent_decision_id,
    });
  }

  // Silent migration path for devices learned before v3. Exact observations
  // and high-confidence, unambiguous historical matches are upgraded once to
  // a server-bound credential; later logins use that credential directly.
  const smart = await findDeviceNicknameMatch(supabase, fingerprint, {
    allowAutoLogin: true,
    independentCredentialGroups: 2,
    hasConfirmedHistory: true,
    circularEvidence: false,
  });
  if (!smart.ok) return j({ error: "Could not evaluate device identity." }, { status: 503 });

  if (
    smart.matched === true &&
    Number(smart.best_score || 0) >= 95 &&
    Number(smart.ambiguity_gap || 0) >= 14 &&
    Number(smart.stable_contradictions || 0) === 0
  ) {
    const profile = await getNicknameProfile(supabase, smart.user_id);
    if (profile?.ok && profile.exists && profile.active !== false && !profile.reset_required && profile.display_name) {
      const exactHistorical = smart.exact_observation === true;
      return enrollAndLogin({
        supabase, username, fingerprint,
        userId: smart.user_id,
        displayName: profile.display_name,
        source: exactHistorical
          ? "exact_historical_observation_migration"
          : "strong_historical_device_migration",
        assurance: "verified_historical_device_observation",
        decisionType: DEVICE_DECISIONS.AUTO_LOGIN_RECOVERED,
        automatic: true,
      });
    }
  }

  const suggestions = Array.isArray(smart.suggestions) ? smart.suggestions.slice(0, 3) : [];
  if ((mode === "verified_only" || mode === "full") && suggestions.length >= 1 && !registerNewDevice) {
    const ticketLimit = await takeRateLimit(supabase, {
      scope: "device_recovery_ticket",
      keyParts: [clientIp(request), fingerprint.recovery_binding_hash],
      limit: 5,
      windowSeconds: 10 * 60,
    });
    if (!ticketLimit.ok) return j({ error: ticketLimit.error }, { status: ticketLimit.status || 503 });
    if (!ticketLimit.allowed) return genericIdentityFailure(429);

    const shortlistDecisionId = newDecisionId();
    const shortlistAudit = await logDeviceDecision(supabase, {
      decision_id: shortlistDecisionId,
      decision_type: DEVICE_DECISIONS.SELECTION_REQUIRED,
      decision_source: "probabilistic_shortlist",
      truth_level: "unverified_candidate",
      evidence_groups: ["fleet_characteristics"],
      evidence_lineage: { source: "legacy_device_observations", may_strengthen: false },
      automatic: true,
      executed: false,
      can_strengthen: false,
      evidence_group_count: smart.strong_groups,
      score_margin: smart.ambiguity_gap,
    });
    if (!shortlistAudit.ok) return j({ error: "Could not record device identity decision." }, { status: 503 });

    const recovery = await createDeviceRecoveryTicket(
      supabase, fingerprint, suggestions, sessionSecret, { parentDecisionId: shortlistDecisionId }
    );
    if (!recovery.ok) {
      return j({
        error: "تعذر استرجاع ربط قديم لهذا الجهاز. اكتب كنية جديدة لإكمال أول دخول.",
        nickname_registration_required: true,
      }, { status: 409 });
    }
    const finalizedShortlist = await markDeviceDecisionExecuted(supabase, shortlistDecisionId);
    if (!finalizedShortlist.ok) return j({ error: "Could not finalize device identity decision." }, { status: 503 });

    let response = j({
      nickname_selection_required: true,
      recovery_ticket: recovery.token,
      nickname_suggestions: recovery.choices,
    }, { status: 409 });
    response = setRecoveryAttemptCookie(response, recovery.attempt_token);
    return response;
  }

  // First login for a genuinely unbound device. The browser may propose only
  // a new presentation nickname; it can never provide a user id or claim an
  // existing profile. The server creates the id and binds it to this device.
  if (!registerNewDevice || !newNickname) {
    return j({
      error: "اكتب كنية جديدة لربط هذا الجهاز في أول دخول.",
      nickname_registration_required: true,
    }, { status: 409 });
  }

  const registrationLimit = await takeRateLimit(supabase, {
    scope: "new_device_registration",
    keyParts: [clientIp(request), fingerprint.recovery_binding_hash],
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!registrationLimit.ok) return j({ error: registrationLimit.error }, { status: registrationLimit.status || 503 });
  if (!registrationLimit.allowed) {
    return j({ error: "تمت محاولات تسجيل أجهزة جديدة كثيرة. حاول لاحقًا." }, { status: 429 });
  }

  const newUserId = `uid_${randomUUID()}`;
  const nickname = await ensureNicknameForUser(supabase, newUserId, newNickname);
  if (!nickname.ok) {
    return j({
      error: nickname.error || "تعذر حفظ الكنية الجديدة.",
      nickname_registration_required: true,
      nickname_taken: nickname.nickname_taken === true,
    }, { status: nickname.status || 409 });
  }
  if (nickname.compatibility || !nickname.display_name) {
    return j({ error: "يجب تطبيق تحديث قاعدة بيانات الكنيات قبل تسجيل أول جهاز." }, { status: 503 });
  }

  const firstLogin = await enrollAndLogin({
    supabase, username, fingerprint,
    userId: newUserId,
    displayName: nickname.display_name,
    source: "first_login_nickname_registration",
    assurance: "verified_new_device_registration",
    decisionType: DEVICE_DECISIONS.NEW_DEVICE,
    automatic: false,
  });
  if (!firstLogin.ok) {
    // The id was generated in this request, so cleanup cannot affect an
    // existing account. It prevents a failed enrollment reserving a nickname.
    try { await supabase.from("support_users").delete().eq("user_id", newUserId); } catch {}
  }
  return firstLogin;

}
