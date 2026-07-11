import crypto from "node:crypto";
import { getNicknameProfile, isMissingTableOrColumn, normalizeUserId } from "./nickname.js";

function registrySecret() {
  const value = String(process.env.SESSION_REGISTRY_SECRET || process.env.SESSION_SECRET || "");
  return value.length >= 32 ? value : "";
}

function sessionHash(sessionId) {
  const key = registrySecret();
  const sid = String(sessionId || "");
  if (!key || !sid) return "";
  return crypto.createHmac("sha256", key).update(`session-v2|${sid}`).digest("hex");
}

function registryRequired() {
  return String(process.env.AUTH_SESSION_REGISTRY_REQUIRED || "true").toLowerCase() !== "false";
}

async function validateActiveUser(supabase, userId) {
  const profile = await getNicknameProfile(supabase, userId);
  if (!profile?.ok) return { ok: false, status: 503, error: "Could not validate authenticated user." };
  if (registryRequired() && profile.supportsReset === false) {
    return { ok: false, status: 503, error: "User account-status migration is required." };
  }
  if (!profile.exists || profile.active === false || profile.reset_required || !profile.display_name) {
    return { ok: false, status: 401, error: "Not authenticated." };
  }
  return { ok: true };
}

export async function registerUserSession(supabase, input = {}) {
  const userId = normalizeUserId(input.user_id);
  const sidHash = sessionHash(input.session_id);
  const expiresMs = Number(input.expires_at || 0);
  if (!userId || !sidHash || !Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    return { ok: false, status: 500, error: "Could not register authenticated session." };
  }
  const expiresAt = new Date(expiresMs).toISOString();
  const activeUser = await validateActiveUser(supabase, userId);
  if (!activeUser.ok) return activeUser;
  const res = await supabase.from("support_auth_sessions").insert({
    session_id_hash: sidHash,
    user_id: userId,
    decision_id: input.decision_id || null,
    assurance: String(input.assurance || "verified_device").slice(0, 64),
    expires_at: expiresAt,
  });
  if (res.error) {
    if (isMissingTableOrColumn(res.error)) {
      if (!registryRequired()) return { ok: true, compatibility: true };
      return { ok: false, status: 503, missing_migration: true, error: "Session registry migration is required." };
    }
    return { ok: false, status: 503, error: "Could not register authenticated session." };
  }
  return { ok: true };
}

export async function validateUserSession(supabase, payload = {}) {
  const userId = normalizeUserId(payload.uid);
  const sidHash = sessionHash(payload.sid);
  if (!userId || !sidHash || payload.role !== "user" || Number(payload.session_version || 0) !== 2) {
    return { ok: false, status: 401, error: "Not authenticated." };
  }
  const res = await supabase
    .from("support_auth_sessions")
    .select("user_id,expires_at,revoked_at")
    .eq("session_id_hash", sidHash)
    .limit(1);
  if (res.error) {
    if (isMissingTableOrColumn(res.error)) {
      if (!registryRequired()) return { ok: true, compatibility: true };
      return { ok: false, status: 503, error: "Session registry migration is required." };
    }
    return { ok: false, status: 503, error: "Could not validate authenticated session." };
  }
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row || normalizeUserId(row.user_id) !== userId || row.revoked_at || Date.parse(row.expires_at || "") <= Date.now()) {
    return { ok: false, status: 401, error: "Not authenticated." };
  }
  return validateActiveUser(supabase, userId);
}

export async function revokeUserSession(supabase, payload = {}) {
  const sidHash = sessionHash(payload.sid);
  const userId = normalizeUserId(payload.uid);
  if (!sidHash || !userId) return { ok: true, skipped: true };
  const res = await supabase
    .from("support_auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_id_hash", sidHash)
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (res.error) {
    if (isMissingTableOrColumn(res.error) && !registryRequired()) return { ok: true, compatibility: true };
    return { ok: false, status: 503, error: isMissingTableOrColumn(res.error)
      ? "Session registry migration is required."
      : "Could not revoke authenticated session." };
  }
  return { ok: true };
}
