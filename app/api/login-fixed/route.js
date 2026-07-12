import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { POST as primaryLogin } from "../login/route.js";
import { getCookieName, signSession } from "../../../lib/session.js";
import { noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { getNicknameProfile } from "../../../lib/server/nickname.js";
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
  setTrustedDeviceCookie,
} from "../../../lib/server/device-identity.js";
import {
  logDeviceDecision,
  markDeviceDecisionExecuted,
  newDecisionId,
} from "../../../lib/server/device-audit.js";
import { registerUserSession, revokeUserSession } from "../../../lib/server/session-registry.js";

export const runtime = "nodejs";

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

function json(body, init) {
  return noStore(NextResponse.json(body, init));
}

function genericFailure(status = 409) {
  return json({
    error: "تعذر التحقق من هوية هذا الجهاز بأمان. تواصل مع المسؤول لربط الجهاز أو مراجعته.",
    identity_verification_required: true,
  }, { status });
}

function selectStrictCandidate(smart) {
  const suggestions = Array.isArray(smart?.suggestions) ? smart.suggestions.slice(0, 3) : [];
  const top = suggestions[0];
  if (!top?.user_id) return null;

  const score = Number(top.score || smart?.best_score || 0);
  const evidence = Number(top.evidence_weight || smart?.evidence_weight || 0);
  const groups = Number(top.strong_groups || smart?.strong_groups || 0);
  const contradictions = Number(top.stable_contradictions ?? smart?.stable_contradictions ?? 99);
  const margin = Number(smart?.ambiguity_gap || 0);

  const exceptionallyHigh = score >= 96 && groups >= 3;
  const fourStableGroups = score >= 90 && groups >= 4;
  if (evidence < 64 || contradictions !== 0 || margin < 18) return null;
  if (!exceptionallyHigh && !fourStableGroups) return null;

  return {
    user_id: top.user_id,
    minScore: exceptionallyHigh ? 96 : 90,
    minEvidence: 64,
    minStrongGroups: fourStableGroups ? 4 : 3,
  };
}

async function finishRecoveredLogin({ supabase, username, fingerprint, userId, displayName }) {
  const ownerCheck = await checkDeviceOwnerConflict(supabase, fingerprint, userId);
  if (!ownerCheck.ok || ownerCheck.conflict || ownerCheck.rejected) return genericFailure(409);

  const enrolled = await registerTrustedDeviceIdentity(
    supabase,
    userId,
    displayName,
    fingerprint,
    {
      owner_state: "enrolled_from_verified_selection",
      source: "strict_historical_fingerprint_migration",
    }
  );
  if (!enrolled.ok) return genericFailure(enrolled.status || 409);

  const decisionId = newDecisionId();
  const audit = await logDeviceDecision(supabase, {
    decision_id: decisionId,
    device_id: enrolled.device_id,
    user_id: userId,
    decision_type: "AUTO_LOGIN_RECOVERED",
    decision_source: "strict_historical_fingerprint_migration",
    truth_level: enrolled.owner_state || "enrolled_from_verified_selection",
    evidence_groups: [
      "strict_historical_fingerprint_match",
      "server_recomputed_candidate",
      "server_profile_lookup",
      "server_owner_conflict_check",
    ],
    evidence_lineage: { source: "legacy_device_observations", may_strengthen: false },
    automatic: true,
    executed: false,
    can_strengthen: false,
  });
  if (!audit.ok) return genericFailure(503);

  const sessionId = randomUUID();
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  let sessionToken;
  try {
    sessionToken = await signSession({
      role: "user",
      session_version: 2,
      u: username,
      uid: userId,
      name: displayName,
      sid: sessionId,
      assurance: "verified_historical_device_observation",
      decision_id: decisionId,
      can_strengthen: false,
      iat: Date.now(),
      exp: expiresAt,
    }, process.env.SESSION_SECRET || "");
  } catch {
    return genericFailure(503);
  }

  const registered = await registerUserSession(supabase, {
    session_id: sessionId,
    user_id: userId,
    decision_id: decisionId,
    assurance: "verified_historical_device_observation",
    expires_at: expiresAt,
  });
  if (!registered.ok) return genericFailure(registered.status || 503);

  const finalized = await markDeviceDecisionExecuted(supabase, decisionId);
  if (!finalized.ok) {
    await revokeUserSession(supabase, { sid: sessionId, uid: userId });
    return genericFailure(503);
  }

  const credential = await finalizeTrustedDeviceCredential(
    supabase,
    { type: "issue", device_id: enrolled.device_id },
    fingerprint
  );
  if (!credential.ok) {
    await revokeUserSession(supabase, { sid: sessionId, uid: userId });
    return genericFailure(credential.status || 503);
  }

  await recordDeviceNickname(supabase, userId, displayName, fingerprint, 100, {
    device_id: enrolled.device_id,
    decision_id: decisionId,
    source: "verified_historical_device_observation",
    truth_level: enrolled.owner_state,
    canStrengthen: false,
    evidence_groups: ["strict_historical_fingerprint_match", "server_profile_lookup"],
    evidence_lineage: { decision_id: decisionId, source: "strict_historical_fingerprint_migration" },
  });

  let response = json({ ok: true, display_name: displayName });
  response.cookies.set({
    name: getCookieName(),
    value: sessionToken,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return setTrustedDeviceCookie(response, credential.token);
}

export async function POST(request) {
  const rawBody = await request.text();
  const forwarded = new Request(request.url.replace("/api/login-fixed", "/api/login"), {
    method: "POST",
    headers: request.headers,
    body: rawBody,
  });

  const primary = await primaryLogin(forwarded);
  if (primary.status !== 409) return primary;

  const primaryData = await primary.clone().json().catch(() => ({}));
  if (primaryData?.identity_verification_required !== true) return primary;

  let body;
  try { body = JSON.parse(rawBody); }
  catch { return primary; }

  const username = String(body?.username || "").slice(0, 160);
  const sessionSecret = process.env.SESSION_SECRET || "";
  if (sessionSecret.length < 32) return primary;

  let supabase;
  try { supabase = getServiceSupabase(); }
  catch { return primary; }

  const fingerprint = buildDeviceConfidence(
    request,
    body?.device_fingerprint && typeof body.device_fingerprint === "object"
      ? body.device_fingerprint
      : {},
    sessionSecret
  );
  if (!fingerprint?.ok) return primary;

  const smart = await findDeviceNicknameMatch(supabase, fingerprint, {
    allowAutoLogin: false,
  });
  if (!smart.ok) return primary;

  const candidate = selectStrictCandidate(smart);
  if (!candidate) return primary;

  const confirmed = await verifyDeviceNicknameChoice(
    supabase,
    fingerprint,
    candidate.user_id,
    {
      minScore: candidate.minScore,
      minEvidence: candidate.minEvidence,
      minStrongGroups: candidate.minStrongGroups,
      selectableTopN: 1,
    }
  );
  const top = Array.isArray(confirmed?.suggestions) ? confirmed.suggestions[0] : null;
  if (!confirmed?.ok || !confirmed.matched || Number(top?.stable_contradictions || 0) !== 0) {
    return primary;
  }

  const profile = await getNicknameProfile(supabase, confirmed.user_id);
  if (
    !profile?.ok ||
    !profile.exists ||
    profile.active === false ||
    profile.reset_required ||
    !profile.display_name
  ) {
    return primary;
  }

  return finishRecoveredLogin({
    supabase,
    username,
    fingerprint,
    userId: confirmed.user_id,
    displayName: profile.display_name,
  });
}
