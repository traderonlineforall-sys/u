import crypto, { randomBytes, randomUUID } from "node:crypto";
import { verifySession } from "../session.js";
import {
  cleanNickname,
  getNicknameProfile,
  isMissingTableOrColumn,
  normalizeUserId,
} from "./nickname.js";
import { logDeviceConflict } from "./device-audit.js";
import { mayPromoteOwnerState } from "./device-policy.js";

const IDENTITY_TABLE = "support_device_identities";
const CREDENTIAL_TABLE = "support_device_credentials";
const DEVICE_COOKIE_NAME = "__Host-srdevice";
const DEVICE_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
const DEVICE_COOKIE_MAX_AGE_MS = DEVICE_COOKIE_MAX_AGE_SECONDS * 1000;
const PREVIOUS_CREDENTIAL_OVERLAP_MS = 2 * 60 * 1000;
const CREDENTIAL_VERSION = 2;

const VERIFIED_OWNER = "verified_device_owner";
const SELECTED_OWNER = "enrolled_from_verified_selection";
const CONFLICTED_OWNER = "conflicted";
const REVOKED_OWNER = "revoked";

function safeDecodeCookieValue(value) {
  try { return decodeURIComponent(value || ""); }
  catch { return value || ""; }
}

function parseCookies(cookieHeader) {
  const out = {};
  for (const part of String(cookieHeader || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) out[key] = safeDecodeCookieValue(rest.join("=") || "");
  }
  return out;
}

function identitySecret() {
  const value = String(process.env.DEVICE_IDENTITY_SECRET || process.env.SESSION_SECRET || "");
  return value.length >= 32 ? value : "";
}

function credentialPepper() {
  const value = String(
    process.env.DEVICE_CREDENTIAL_PEPPER ||
    process.env.DEVICE_IDENTITY_SECRET ||
    process.env.SESSION_SECRET ||
    ""
  );
  return value.length >= 32 ? value : "";
}

function deviceKeyHash(fp) {
  return String(fp?.device_key_hash || fp?.component_hashes?.device_key_hash || "").trim();
}

function contextHash(fp) {
  return String(fp?.recovery_binding_hash || "").trim();
}

function timingSafeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length || !aa.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function hashCredentialSecret(secret) {
  const pepper = credentialPepper();
  if (!pepper || !secret) return "";
  return crypto.createHmac("sha256", pepper).update(`device-credential-v2|${secret}`).digest("hex");
}

function newCredentialSecret() {
  return randomBytes(32).toString("base64url");
}

function safeUuid(value) {
  const id = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

function formatCredentialToken(credentialId, secret) {
  return `v${CREDENTIAL_VERSION}.${credentialId}.${secret}`;
}

function parseCredentialToken(token) {
  const match = /^v2\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,})$/i.exec(String(token || ""));
  if (!match) return null;
  const credentialId = safeUuid(match[1]);
  return credentialId ? { credential_id: credentialId, secret: match[2] } : null;
}

async function readIdentityBy(supabase, column, value) {
  let res = await supabase
    .from(IDENTITY_TABLE)
    .select("device_id,user_id,device_key_hash,owner_state,owner_source,owner_display_name_snapshot,created_at,last_seen_at,revoked_at,conflicted_at,conflict_code")
    .eq(column, value)
    .limit(2);
  if (res.error && isMissingTableOrColumn(res.error)) {
    res = await supabase
      .from(IDENTITY_TABLE)
      .select("device_id,user_id,device_key_hash,display_name,created_at,last_seen_at,revoked_at")
      .eq(column, value)
      .limit(2);
    if (!res.error) {
      res.data = (Array.isArray(res.data) ? res.data : []).map((row) => ({
        ...row,
        // Legacy bindings were originally created from browser-supplied
        // identity. Preserve them as operational enrollments, never as
        // independently verified ownership.
        owner_state: SELECTED_OWNER,
        owner_source: "legacy_client_enrollment",
        owner_display_name_snapshot: row.display_name || "",
      }));
    }
  }
  if (res.error) {
    if (isMissingTableOrColumn(res.error) || /support_device_identities/i.test(String(res.error.message || ""))) {
      return { ok: true, missing_table: true, row: null };
    }
    return { ok: false, error: "Could not read trusted device identity." };
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  if (rows.length > 1) return { ok: true, conflict: true, row: rows[0] };
  return { ok: true, row: rows[0] || null };
}

async function readCredentialBy(supabase, column, value) {
  const res = await supabase
    .from(CREDENTIAL_TABLE)
    .select("credential_id,device_id,secret_hash,previous_secret_hash,previous_valid_until,version,created_at,last_used_at,expires_at,rotated_at,revoked_at,suspended_at,last_context_hash,replay_detected_at,replay_count")
    .eq(column, value)
    .limit(1);
  if (res.error) {
    if (isMissingTableOrColumn(res.error) || /support_device_credentials/i.test(String(res.error.message || ""))) {
      return { ok: true, missing_table: true, row: null };
    }
    return { ok: false, error: "Could not read device credential." };
  }
  return { ok: true, row: Array.isArray(res.data) ? res.data[0] || null : null };
}

async function activeOwner(supabase, row) {
  if (!row) return { ok: true, matched: false, reason: "device_not_found" };
  if (row.revoked_at || row.owner_state === REVOKED_OWNER) {
    return { ok: true, matched: false, rejected: true, reason: "device_revoked" };
  }
  if (row.conflicted_at || row.owner_state === CONFLICTED_OWNER) {
    return { ok: true, matched: false, conflict: true, reason: "device_conflicted" };
  }
  const userId = normalizeUserId(row.user_id);
  if (!userId) return { ok: true, matched: false, conflict: true, reason: "invalid_owner" };

  const profile = await getNicknameProfile(supabase, userId);
  if (!profile?.ok) return { ok: false, error: "Could not read trusted device owner." };
  if (!profile.exists || profile.reset_required || profile.active === false || !profile.display_name) {
    return { ok: true, matched: false, rejected: true, reason: "owner_inactive_or_missing" };
  }

  const snapshot = cleanNickname(profile.display_name);
  let updated = await supabase
    .from(IDENTITY_TABLE)
    .update({ last_seen_at: new Date().toISOString(), owner_display_name_snapshot: snapshot, display_name: snapshot })
    .eq("device_id", row.device_id)
    .is("revoked_at", null);
  if (updated.error && isMissingTableOrColumn(updated.error)) {
    updated = await supabase
      .from(IDENTITY_TABLE)
      .update({ last_seen_at: new Date().toISOString(), display_name: snapshot })
      .eq("device_id", row.device_id)
      .is("revoked_at", null);
  }

  return {
    ok: true,
    matched: true,
    device_id: String(row.device_id || ""),
    user_id: userId,
    display_name: snapshot,
    owner_state: row.owner_state || SELECTED_OWNER,
    owner_source: row.owner_source || "legacy_client_enrollment",
  };
}

async function markConflict(supabase, identity, credential, details = {}) {
  const now = new Date().toISOString();
  if (identity?.device_id) {
    const identityUpdate = await supabase
      .from(IDENTITY_TABLE)
      .update({ owner_state: CONFLICTED_OWNER, conflicted_at: now, conflict_code: details.conflict_code || "owner_conflict" })
      .eq("device_id", identity.device_id)
      .select("device_id")
      .limit(1);
    if (identityUpdate.error || !Array.isArray(identityUpdate.data) || !identityUpdate.data[0]) {
      return { ok: false, status: 503, error: "Could not persist device identity conflict." };
    }
  }
  if (credential?.credential_id) {
    const credentialUpdate = await supabase
      .from(CREDENTIAL_TABLE)
      .update({ suspended_at: now })
      .eq("credential_id", credential.credential_id)
      .is("revoked_at", null)
      .select("credential_id")
      .limit(1);
    if (credentialUpdate.error || !Array.isArray(credentialUpdate.data) || !credentialUpdate.data[0]) {
      return { ok: false, status: 503, error: "Could not suspend conflicted device credential." };
    }
  }
  const logged = await logDeviceConflict(supabase, {
    device_id: identity?.device_id,
    credential_id: credential?.credential_id,
    expected_user_id: identity?.user_id,
    observed_user_id: details.observed_user_id,
    conflict_code: details.conflict_code || "owner_conflict",
    context: { source: details.source || "device_identity" },
  });
  if (!logged.ok || logged.missing_table) {
    return { ok: false, status: 503, error: "Could not record device identity conflict." };
  }
  return { ok: true };
}

async function rotateCredential(supabase, row, fp, options = {}) {
  const secret = newCredentialSecret();
  const secretHash = hashCredentialSecret(secret);
  if (!secretHash) return { ok: false, status: 503, error: "Device credential secret is not configured." };
  const now = new Date();
  const update = await supabase
    .from(CREDENTIAL_TABLE)
    .update({
      previous_secret_hash: row.secret_hash,
      previous_valid_until: new Date(now.getTime() + PREVIOUS_CREDENTIAL_OVERLAP_MS).toISOString(),
      secret_hash: secretHash,
      version: Number(row.version || 1) + 1,
      last_used_at: now.toISOString(),
      rotated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + DEVICE_COOKIE_MAX_AGE_MS).toISOString(),
      last_context_hash: contextHash(fp) || null,
      replay_detected_at: options.preserveReplayRisk ? now.toISOString() : null,
      replay_count: options.preserveReplayRisk ? Number(row.replay_count || 0) + 1 : 0,
    })
    .eq("credential_id", row.credential_id)
    .eq("version", Number(row.version || 1))
    .is("revoked_at", null)
    .is("suspended_at", null)
    .select("credential_id,version")
    .limit(1);
  if (update.error) return { ok: false, status: 503, error: "Could not rotate device credential." };
  if (!Array.isArray(update.data) || !update.data[0]) {
    return { ok: false, status: 409, retry: true, error: "Device credential changed during login. Try again." };
  }
  return { ok: true, token: formatCredentialToken(row.credential_id, secret) };
}

export async function issueTrustedDeviceCredential(supabase, deviceId, fp) {
  const normalizedDeviceId = safeUuid(deviceId);
  if (!normalizedDeviceId) return { ok: false, status: 400, error: "Invalid trusted device id." };
  const identity = await readIdentityBy(supabase, "device_id", normalizedDeviceId);
  if (!identity.ok) return identity;
  if (
    !identity.row ||
    identity.row.revoked_at ||
    identity.row.owner_state === REVOKED_OWNER ||
    identity.row.conflicted_at ||
    identity.row.owner_state === CONFLICTED_OWNER
  ) return { ok: false, status: 403, rejected: true, error: "Trusted device identity is not active." };

  const credential = await readCredentialBy(supabase, "device_id", normalizedDeviceId);
  if (!credential.ok) return credential;
  if (credential.missing_table) return { ok: false, status: 503, missing_migration: true, error: "Device credential migration is required." };
  if (credential.row) {
    if (credential.row.revoked_at || credential.row.suspended_at) {
      return { ok: false, status: 403, rejected: true, error: "Device credential is not active." };
    }
    return rotateCredential(supabase, credential.row, fp);
  }

  const credentialId = randomUUID();
  const rawSecret = newCredentialSecret();
  const secretHash = hashCredentialSecret(rawSecret);
  if (!secretHash) return { ok: false, status: 503, error: "Device credential secret is not configured." };
  const now = new Date();
  const inserted = await supabase.from(CREDENTIAL_TABLE).insert({
    credential_id: credentialId,
    device_id: normalizedDeviceId,
    secret_hash: secretHash,
    version: 1,
    created_at: now.toISOString(),
    last_used_at: now.toISOString(),
    expires_at: new Date(now.getTime() + DEVICE_COOKIE_MAX_AGE_MS).toISOString(),
    last_context_hash: contextHash(fp) || null,
  });
  if (inserted.error) {
    if (isMissingTableOrColumn(inserted.error)) return { ok: false, status: 503, missing_migration: true, error: "Device credential migration is required." };
    if (String(inserted.error.code || "") === "23505") {
      const raced = await readCredentialBy(supabase, "device_id", normalizedDeviceId);
      if (raced.ok && raced.row && !raced.row.revoked_at && !raced.row.suspended_at) return rotateCredential(supabase, raced.row, fp);
    }
    return { ok: false, status: 503, error: "Could not issue device credential." };
  }
  return { ok: true, token: formatCredentialToken(credentialId, rawSecret), credential_id: credentialId };
}

export async function finalizeTrustedDeviceCredential(supabase, action, fp) {
  if (action?.type === "rotate" && action.row?.credential_id) {
    return rotateCredential(supabase, action.row, fp, {
      preserveReplayRisk: action.preserve_replay_risk === true,
    });
  }
  if (action?.type === "issue" && action.device_id) {
    return issueTrustedDeviceCredential(supabase, action.device_id, fp);
  }
  return { ok: false, status: 503, error: "Device credential finalization is not configured." };
}

async function resolveV2Credential(supabase, parsed, fp) {
  const credential = await readCredentialBy(supabase, "credential_id", parsed.credential_id);
  if (!credential.ok) return credential;
  if (credential.missing_table || !credential.row) return { ok: true, matched: false, rejected: true, reason: "credential_not_found" };
  const row = credential.row;
  if (row.revoked_at || row.suspended_at || Date.parse(row.expires_at || "") <= Date.now()) {
    return { ok: true, matched: false, rejected: true, reason: "credential_inactive" };
  }

  const incomingHash = hashCredentialSecret(parsed.secret);
  const currentMatch = timingSafeEqual(incomingHash, row.secret_hash);
  const previousMatch = timingSafeEqual(incomingHash, row.previous_secret_hash);
  const previousValid = previousMatch && Date.parse(row.previous_valid_until || "") > Date.now();
  if (!currentMatch && !previousValid) {
    if (previousMatch) {
      await supabase
        .from(CREDENTIAL_TABLE)
        .update({ replay_detected_at: new Date().toISOString(), replay_count: Number(row.replay_count || 0) + 1 })
        .eq("credential_id", row.credential_id);
    }
    return { ok: true, matched: false, rejected: true, reason: "credential_invalid_or_replayed" };
  }

  const identityResult = await readIdentityBy(supabase, "device_id", row.device_id);
  if (!identityResult.ok) return identityResult;
  if (identityResult.conflict) return { ok: true, matched: false, conflict: true, reason: "duplicate_device_owner" };
  const identity = identityResult.row;
  if (!identity) return { ok: true, matched: false, rejected: true, reason: "credential_device_missing" };

  const keyHash = deviceKeyHash(fp);
  if (keyHash && identity.device_key_hash && !timingSafeEqual(keyHash, identity.device_key_hash)) {
    const keyOwner = await readIdentityBy(supabase, "device_key_hash", keyHash);
    if (!keyOwner.ok) return keyOwner;
    if (keyOwner.row && String(keyOwner.row.device_id) !== String(identity.device_id)) {
      const persisted = await markConflict(supabase, identity, row, {
        conflict_code: "credential_key_owner_conflict",
        observed_user_id: keyOwner.row.user_id,
        source: "credential_validation",
      });
      if (!persisted.ok) return persisted;
      return { ok: true, matched: false, conflict: true, reason: "credential_key_owner_conflict" };
    }
    // A valid HttpOnly credential remains sufficient if localStorage was
    // cleared. Never overwrite/rebind the server owner from this mismatch.
  }

  const credentialContextChanged = !!row.last_context_hash && !!contextHash(fp)
    && row.last_context_hash !== contextHash(fp);
  const overlapContextChanged = previousValid && credentialContextChanged;
  const previousRiskAt = Date.parse(row.replay_detected_at || "");
  const recentReplayRisk = Number.isFinite(previousRiskAt)
    && Date.now() - previousRiskAt <= 10 * 60 * 1000;
  if (overlapContextChanged && Number(row.replay_count || 0) >= 1 && recentReplayRisk) {
    const persisted = await markConflict(supabase, identity, row, {
      conflict_code: "credential_concurrent_context_replay",
      source: "credential_rotation",
    });
    if (!persisted.ok) return persisted;
    return { ok: true, matched: false, conflict: true, reason: "credential_concurrent_context_replay" };
  }

  const owner = await activeOwner(supabase, identity);
  if (!owner.ok || !owner.matched) return owner;
  return {
    ...owner,
    credential_id: row.credential_id,
    credential_action: {
      type: "rotate",
      row,
      preserve_replay_risk: overlapContextChanged,
    },
    assurance: "verified_credential",
    source: overlapContextChanged
      ? "rotated_credential_overlap_context_changed"
      : previousValid
        ? "rotated_credential_overlap"
        : credentialContextChanged ? "device_credential_context_changed" : "device_credential",
    context_changed: credentialContextChanged,
  };
}

async function resolveLegacyCredential(supabase, token, fp) {
  const secret = identitySecret();
  if (!secret) return { ok: false, status: 503, error: "Device identity secret is not configured." };
  const verified = await verifySession(token, secret);
  const deviceId = String(verified?.payload?.did || "");
  const tokenUid = normalizeUserId(verified?.payload?.uid || "");
  if (!verified.ok || verified.payload?.role !== "trusted_device" || !deviceId || !tokenUid) {
    return { ok: true, matched: false, reason: "legacy_credential_invalid" };
  }
  const identityResult = await readIdentityBy(supabase, "device_id", deviceId);
  if (!identityResult.ok || identityResult.missing_table) return identityResult;
  const identity = identityResult.row;
  const keyHash = deviceKeyHash(fp);
  if (!identity || normalizeUserId(identity.user_id) !== tokenUid || !keyHash || !timingSafeEqual(identity.device_key_hash, keyHash)) {
    // Never perform the old unsafe automatic key rebind.
    return { ok: true, matched: false, reason: "legacy_credential_requires_exact_local_key" };
  }
  const owner = await activeOwner(supabase, identity);
  if (!owner.ok || !owner.matched) return owner;
  return {
    ...owner,
    credential_action: { type: "issue", device_id: owner.device_id },
    assurance: "credential_continuation",
    source: "legacy_credential_upgrade",
  };
}

export function getTrustedDeviceCookieName() {
  return DEVICE_COOKIE_NAME;
}

export async function resolveTrustedDeviceIdentity(req, supabase, fp) {
  if (!credentialPepper()) return { ok: false, status: 503, error: "Device credential secret is not configured." };
  const cookies = parseCookies(req.headers.get("cookie") || "");
  const token = cookies[DEVICE_COOKIE_NAME] || "";
  const parsed = parseCredentialToken(token);
  if (parsed) return resolveV2Credential(supabase, parsed, fp);
  if (token) {
    const legacy = await resolveLegacyCredential(supabase, token, fp);
    if (legacy.matched || legacy.conflict || legacy.rejected || !legacy.ok) return legacy;
  }

  // Recovery from a surviving browser-local random secret. Fleet fingerprint
  // fields never reach this exact lookup and can never replace the owner.
  const keyHash = deviceKeyHash(fp);
  if (!keyHash) return { ok: true, matched: false, new_device: true, reason: "missing_device_secret" };
  const identityResult = await readIdentityBy(supabase, "device_key_hash", keyHash);
  if (!identityResult.ok || identityResult.missing_table) return identityResult;
  if (identityResult.conflict) return { ok: true, matched: false, conflict: true, reason: "duplicate_device_owner" };
  if (!identityResult.row) return { ok: true, matched: false, new_device: true, reason: "unknown_device_secret" };
  const owner = await activeOwner(supabase, identityResult.row);
  if (!owner.ok || !owner.matched) return owner;
  return {
    ...owner,
    credential_action: { type: "issue", device_id: owner.device_id },
    assurance: "credential_continuation",
    source: "browser_local_device_secret",
  };
}

export async function checkDeviceOwnerConflict(supabase, fp, selectedUserId) {
  const keyHash = deviceKeyHash(fp);
  const selected = normalizeUserId(selectedUserId);
  if (!keyHash || !selected) return { ok: false, status: 400, error: "Missing device enrollment context." };
  const existing = await readIdentityBy(supabase, "device_key_hash", keyHash);
  if (!existing.ok || existing.missing_table) return existing;
  if (existing.conflict || existing.row?.owner_state === CONFLICTED_OWNER || existing.row?.conflicted_at) {
    return { ok: true, conflict: true };
  }
  if (existing.row?.revoked_at || existing.row?.owner_state === REVOKED_OWNER) {
    return { ok: true, rejected: true };
  }
  if (existing.row && normalizeUserId(existing.row.user_id) !== selected) {
    const persisted = await markConflict(supabase, existing.row, null, {
      conflict_code: "selection_owner_conflict",
      observed_user_id: selected,
      source: "recovery_selection",
    });
    if (!persisted.ok) return persisted;
    return { ok: true, conflict: true };
  }
  return { ok: true, conflict: false, existing: existing.row || null };
}

export async function registerTrustedDeviceIdentity(supabase, userId, displayName, fp, options = {}) {
  const uid = normalizeUserId(userId);
  const name = cleanNickname(displayName || "");
  const keyHash = deviceKeyHash(fp);
  const requestedState = options.owner_state === VERIFIED_OWNER ? VERIFIED_OWNER : SELECTED_OWNER;
  if (!uid || !name || !keyHash) return { ok: false, status: 400, error: "Missing trusted device identity fields." };

  const existing = await readIdentityBy(supabase, "device_key_hash", keyHash);
  if (!existing.ok) return existing;
  if (existing.missing_table) return { ok: false, status: 503, missing_migration: true, error: "Device identity migration is required." };
  if (existing.conflict) return { ok: false, status: 409, conflict: true, error: "Device identity conflict." };
  if (existing.row) {
    const row = existing.row;
    if (row.revoked_at || row.owner_state === REVOKED_OWNER) return { ok: false, status: 403, rejected: true, error: "Device identity is revoked." };
    if (row.conflicted_at || row.owner_state === CONFLICTED_OWNER) return { ok: false, status: 409, conflict: true, error: "Device identity conflict." };
    if (normalizeUserId(row.user_id) !== uid) {
      const persisted = await markConflict(supabase, row, null, {
        conflict_code: "attempted_owner_overwrite",
        observed_user_id: uid,
        source: options.source || "enrollment",
      });
      if (!persisted.ok) return persisted;
      return { ok: false, status: 409, conflict: true, error: "Device identity conflict." };
    }

    let ownerState = row.owner_state || SELECTED_OWNER;
    const promoted = mayPromoteOwnerState(ownerState, options.source);
    if (promoted) ownerState = "promoted_after_independent_confirmation";
    const now = new Date().toISOString();
    const updates = {
      owner_state: ownerState,
      owner_display_name_snapshot: name,
      display_name: name,
      last_seen_at: now,
    };
    if (promoted) {
      updates.owner_source = String(options.source).slice(0, 80);
      updates.owner_verified_at = now;
    }
    const updated = await supabase
      .from(IDENTITY_TABLE)
      .update(updates)
      .eq("device_id", row.device_id)
      .eq("user_id", uid)
      .is("revoked_at", null)
      .is("conflicted_at", null)
      .select("device_id")
      .limit(1);
    if (updated.error) {
      return { ok: false, status: 503, error: isMissingTableOrColumn(updated.error)
        ? "Device identity migration is required."
        : "Could not refresh trusted device." };
    }
    if (!Array.isArray(updated.data) || !updated.data[0]) {
      return { ok: false, status: 409, conflict: true, error: "Device identity changed during enrollment." };
    }
    return { ok: true, device_id: String(row.device_id), user_id: uid, display_name: name, owner_state: ownerState, existing: true };
  }

  const deviceId = randomUUID();
  const now = new Date().toISOString();
  const inserted = await supabase.from(IDENTITY_TABLE).insert({
    device_id: deviceId,
    user_id: uid,
    device_key_hash: keyHash,
    display_name: name,
    owner_display_name_snapshot: name,
    owner_state: requestedState,
    owner_source: String(options.source || "verified_selection").slice(0, 80),
    owner_linked_at: now,
    owner_verified_at: requestedState === VERIFIED_OWNER ? now : null,
    policy_version: "primary-owner-v3",
    created_at: now,
    last_seen_at: now,
  });
  if (inserted.error) {
    if (isMissingTableOrColumn(inserted.error)) return { ok: false, status: 503, missing_migration: true, error: "Device identity migration is required." };
    if (String(inserted.error.code || "") === "23505") {
      const raced = await readIdentityBy(supabase, "device_key_hash", keyHash);
      if (!raced.ok) return raced;
      if (raced.ok && raced.row && normalizeUserId(raced.row.user_id) === uid) {
        if (raced.row.revoked_at || raced.row.owner_state === REVOKED_OWNER) {
          return { ok: false, status: 403, rejected: true, error: "Device identity is revoked." };
        }
        if (raced.row.conflicted_at || raced.row.owner_state === CONFLICTED_OWNER) {
          return { ok: false, status: 409, conflict: true, error: "Device identity conflict." };
        }
        return { ok: true, device_id: String(raced.row.device_id), user_id: uid, display_name: name, owner_state: raced.row.owner_state || requestedState, existing: true };
      }
      if (raced.ok && raced.row) {
        const persisted = await markConflict(supabase, raced.row, null, {
          conflict_code: "owner_enrollment_race",
          observed_user_id: uid,
          source: "enrollment_race",
        });
        if (!persisted.ok) return persisted;
      }
      return { ok: false, status: 409, conflict: true, error: "Device identity conflict." };
    }
    return { ok: false, status: 503, error: "Could not register trusted device." };
  }
  return { ok: true, device_id: deviceId, user_id: uid, display_name: name, owner_state: requestedState, registered: true };
}

export function setTrustedDeviceCookie(response, token) {
  if (!token) return response;
  response.cookies.set({
    name: DEVICE_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

export function clearTrustedDeviceCookie(response) {
  response.cookies.set({
    name: DEVICE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function forgetTrustedDevice(req, supabase, sessionPayload = {}) {
  const uid = normalizeUserId(sessionPayload?.uid || sessionPayload);
  const decisionId = safeUuid(sessionPayload?.decision_id);
  if (!uid) return { ok: false, status: 401, error: "Not authenticated." };
  const token = parseCookies(req.headers.get("cookie") || "")[DEVICE_COOKIE_NAME] || "";
  let deviceId = "";
  const parsed = parseCredentialToken(token);
  if (parsed) {
    const credential = await readCredentialBy(supabase, "credential_id", parsed.credential_id);
    if (!credential.ok) return credential;
    if (credential.row) {
      const incomingHash = hashCredentialSecret(parsed.secret);
      const valid = timingSafeEqual(incomingHash, credential.row.secret_hash) ||
        (timingSafeEqual(incomingHash, credential.row.previous_secret_hash) && Date.parse(credential.row.previous_valid_until || "") > Date.now());
      if (valid) {
        const identity = await readIdentityBy(supabase, "device_id", credential.row.device_id);
        if (!identity.ok) return identity;
        if (identity.row && normalizeUserId(identity.row.user_id) === uid) {
          deviceId = safeUuid(identity.row.device_id);
        }
      }
    }
  }

  if (!deviceId && token && !parsed) {
    // Safe legacy cleanup: require a valid signed legacy credential and the
    // same authenticated owner. Never accept a browser-supplied device/user id.
    const legacySecret = identitySecret();
    const verified = legacySecret ? await verifySession(token, legacySecret) : { ok: false };
    const legacyDeviceId = safeUuid(verified?.payload?.did);
    const tokenUid = normalizeUserId(verified?.payload?.uid || "");
    if (verified.ok && verified.payload?.role === "trusted_device" && tokenUid === uid && legacyDeviceId) {
      const identity = await readIdentityBy(supabase, "device_id", legacyDeviceId);
      if (!identity.ok) return identity;
      if (identity.row && normalizeUserId(identity.row.user_id) === uid) deviceId = legacyDeviceId;
    }
  }

  // The signed session decision is the fallback when the HttpOnly credential
  // was already deleted. This also revokes the browser-local continuation path
  // without trusting a device id supplied by JavaScript.
  if (!deviceId && decisionId) {
    const decision = await supabase
      .from("support_device_identity_decisions")
      .select("device_id,user_id,executed")
      .eq("decision_id", decisionId)
      .eq("user_id", uid)
      .eq("executed", true)
      .limit(1);
    if (decision.error) {
      if (isMissingTableOrColumn(decision.error)) {
        return { ok: false, status: 503, error: "Forget-device migration is required." };
      }
      return { ok: false, status: 503, error: "Could not verify this device." };
    }
    const row = Array.isArray(decision.data) ? decision.data[0] : null;
    deviceId = safeUuid(row?.device_id);
  }

  if (!deviceId) return { ok: true, skipped: true };

  const res = await supabase.rpc("sr_forget_device_identity", {
    p_device_id: deviceId,
    p_user_id: uid,
  });
  if (res.error) {
    if (isMissingTableOrColumn(res.error) || /sr_forget_device_identity/i.test(String(res.error.message || ""))) {
      return { ok: false, status: 503, error: "Forget-device migration is required." };
    }
    return { ok: false, status: 503, error: "Could not forget this device." };
  }
  if (res.data !== true) return { ok: false, status: 409, error: "Could not verify this device for removal." };
  return { ok: true, forgotten: true };
}
