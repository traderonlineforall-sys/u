const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function policyModule() {
  const source = read("lib/server/device-policy.js");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("verified credential and surviving local secret take the only normal auto-login paths", async () => {
  const { decideDeviceIdentity, DEVICE_DECISIONS } = await policyModule();
  assert.equal(decideDeviceIdentity({ verifiedCredential: true, ownerState: "verified_device_owner" }).decision, DEVICE_DECISIONS.AUTO_LOGIN_VERIFIED);
  assert.equal(decideDeviceIdentity({ credentialContinuation: true, ownerState: "verified_device_owner" }).decision, DEVICE_DECISIONS.AUTO_LOGIN_RECOVERED);
  assert.equal(decideDeviceIdentity({ verifiedCredential: true, ownerState: "enrolled_from_verified_selection" }).canStrengthen, false);
  assert.equal(decideDeviceIdentity({ verifiedCredential: true, ownerState: "promoted_after_independent_confirmation" }).canStrengthen, true);
});

test("homogeneous fleet characteristics never become automatic identity proof", async () => {
  const { decideDeviceIdentity, DEVICE_DECISIONS } = await policyModule();
  const identicalFleet = Array.from({ length: 10 }, (_, index) => ({
    user: `user-${index}`,
    hardware: "same-model",
    os: "same-windows-image",
    browser: "same-browser",
    ip: "same-nat",
    credential: `different-secret-${index}`,
  }));
  assert.equal(new Set(identicalFleet.map((row) => row.credential)).size, 10);

  const result = decideDeviceIdentity({
    mode: "full",
    recoveredAutoEnabled: true,
    probabilisticCandidate: true,
    recoveryScore: 100,
    recoveryMargin: 100,
    stableContradictions: 0,
    hasConfirmedHistory: true,
    circularEvidence: false,
    independentCredentialGroups: 0,
    suggestionCount: 3,
  });
  assert.equal(result.decision, DEVICE_DECISIONS.SELECTION_REQUIRED);
  assert.equal(result.execute, false);
});

test("full recovered auto-login requires independent non-circular continuation", async () => {
  const { decideDeviceIdentity, DEVICE_DECISIONS } = await policyModule();
  const safe = decideDeviceIdentity({
    mode: "full",
    recoveredAutoEnabled: true,
    probabilisticCandidate: true,
    recoveryScore: 99,
    recoveryMargin: 20,
    stableContradictions: 0,
    hasConfirmedHistory: true,
    circularEvidence: false,
    independentCredentialGroups: 2,
  });
  assert.equal(safe.decision, DEVICE_DECISIONS.AUTO_LOGIN_RECOVERED);
  assert.equal(safe.canStrengthen, false);

  for (const unsafe of [
    { independentCredentialGroups: 1 },
    { circularEvidence: true },
    { hasConfirmedHistory: false },
    { recoveryMargin: 4 },
    { stableContradictions: 1 },
  ]) {
    const result = decideDeviceIdentity({
      mode: "full",
      recoveredAutoEnabled: true,
      probabilisticCandidate: true,
      recoveryScore: 99,
      recoveryMargin: 20,
      stableContradictions: 0,
      hasConfirmedHistory: true,
      circularEvidence: false,
      independentCredentialGroups: 2,
      ...unsafe,
    });
    assert.notEqual(result.decision, DEVICE_DECISIONS.AUTO_LOGIN_RECOVERED);
  }
});

test("conflict and revocation outrank every candidate", async () => {
  const { decideDeviceIdentity, DEVICE_DECISIONS } = await policyModule();
  assert.equal(decideDeviceIdentity({ conflicted: true, verifiedCredential: true }).decision, DEVICE_DECISIONS.CONFLICTED);
  assert.equal(decideDeviceIdentity({ revoked: true, verifiedCredential: true }).decision, DEVICE_DECISIONS.REJECTED);
});

test("storage loss behavior is explicit and conservative", async () => {
  const { decideDeviceIdentity, DEVICE_DECISIONS } = await policyModule();
  // Session cookie loss does not forget the device credential.
  assert.equal(decideDeviceIdentity({ verifiedCredential: true }).decision, DEVICE_DECISIONS.AUTO_LOGIN_VERIFIED);
  // localStorage loss does not matter while the HttpOnly credential survives.
  assert.equal(decideDeviceIdentity({ verifiedCredential: true, newDevice: true }).decision, DEVICE_DECISIONS.AUTO_LOGIN_VERIFIED);
  // Trusted cookie loss can recover from the independent browser-local secret.
  assert.equal(decideDeviceIdentity({ credentialContinuation: true }).decision, DEVICE_DECISIONS.AUTO_LOGIN_RECOVERED);
  // Losing every secret never falls back to fleet similarity.
  assert.equal(decideDeviceIdentity({ newDevice: true, suggestionCount: 0 }).decision, DEVICE_DECISIONS.NEW_DEVICE);
});

test("login payload and response do not expose or accept internal identity", () => {
  const route = read("app/api/login/route.js");
  const page = read("app/login/page.js");
  const deviceMe = read("app/api/device-confidence-me/route.js");
  assert.match(route, /FORBIDDEN_IDENTITY_FIELDS/);
  assert.match(route, /"primary_user_id"/);
  assert.match(route, /"nickname"/);
  assert.match(route, /j\(\{ ok: true, display_name: displayName \}\)/);
  assert.doesNotMatch(route, /j\(\{\s*ok:\s*true,\s*user_id/s);
  assert.match(page, /const requestBody = \{ username, password, device_fingerprint \}/);
  assert.match(page, /requestBody\.new_nickname = cleanNickname\(newNickname\)/);
  assert.match(page, /requestBody\.register_new_device = true/);
  assert.doesNotMatch(page, /requestBody\.(?:user_id|primary_user_id|nickname|display_name)/);
  assert.doesNotMatch(page, /requestBody\.(?:user_id|primary_user_id|display_name)/);
  assert.match(deviceMe, /display_name: profile\.display_name/);
  assert.doesNotMatch(deviceMe, /confidence_score|signal_summary|device_hash|user_id\s*:/);
});

test("recovery ticket keeps ids and scores server-side and is consumed atomically", () => {
  const recovery = read("lib/server/device-recovery.js");
  const sql = read("SUPABASE_PRIMARY_DEVICE_OWNER_IDENTITY_V3.sql");
  assert.match(recovery, /storedChoices\.push\(\{[\s\S]*user_id:/);
  assert.match(recovery, /publicChoices\.push\(\{ choice_id: choiceId, display_name: displayName \}\)/);
  assert.doesNotMatch(recovery, /publicChoices\.push\([\s\S]{0,180}(?:confidence|evidence|user_id)/);
  assert.match(recovery, /role:\s*"device_recovery_ticket"/);
  assert.doesNotMatch(recovery, /role:\s*"device_recovery_ticket"[\s\S]{0,250}\buid\b/);
  assert.match(recovery, /sr_consume_device_recovery_ticket/);
  assert.match(recovery, /parent_decision_id/);
  assert.match(recovery, /context_changed: contextChanged/);
  assert.match(recovery, /seenUsers/);
  assert.match(recovery, /seenNames/);
  assert.match(recovery, /const MIN_CHOICES = 1/);
  assert.match(read("app/api/login/route.js"), /suggestions\.length >= 1/);
  assert.match(read("app/login/page.js"), /data\.nickname_suggestions\.length >= 1/);
  assert.match(read("app/login/page.js"), /recoverySuggestions\.length >= 1/);
  assert.match(sql, /for update/);
  assert.match(sql, /used_at is null/);
  assert.match(sql, /foreign key \(parent_decision_id\)[\s\S]+references public\.support_device_identity_decisions/);
});

test("device owner cannot be overwritten and repeated selection cannot promote it", () => {
  const identity = read("lib/server/device-identity.js");
  const policy = read("lib/server/device-policy.js");
  const login = read("app/api/login/route.js");
  assert.match(identity, /attempted_owner_overwrite/);
  assert.match(identity, /owner_state:\s*CONFLICTED_OWNER/);
  assert.match(identity, /mayPromoteOwnerState/);
  assert.match(identity, /promoted_after_independent_confirmation/);
  assert.match(policy, /independent_admin_confirmation/);
  assert.match(policy, /managed_device_attestation/);
  assert.match(login, /owner_state:\s*"enrolled_from_verified_selection"/);
  assert.match(login, /canStrengthen:\s*false/);
  assert.match(login, /parentDecisionId:\s*ticket\.parent_decision_id/);
  assert.match(login, /automatic:\s*false/);
});

test("legacy browser-selected bindings are not migrated as verified owners", () => {
  const identity = read("lib/server/device-identity.js");
  const sql = read("SUPABASE_PRIMARY_DEVICE_OWNER_IDENTITY_V3.sql");
  assert.match(identity, /owner_state:\s*SELECTED_OWNER/);
  assert.match(identity, /owner_source:\s*"legacy_client_enrollment"/);
  assert.match(sql, /owner_state text not null default 'enrolled_from_verified_selection'/);
  assert.match(sql, /owner_source text not null default 'legacy_client_enrollment'/);
});

test("current database nickname is read for every trusted login without changing owner", () => {
  const identity = read("lib/server/device-identity.js");
  assert.match(identity, /const profile = await getNicknameProfile\(supabase, userId\)/);
  assert.match(identity, /display_name:\s*snapshot/);
  assert.doesNotMatch(identity, /user_id:\s*(?:snapshot|displayName|name)/);
});

test("credential is random, hashed, rotated and never embeds a user id", () => {
  const identity = read("lib/server/device-identity.js");
  const login = read("app/api/login/route.js");
  assert.match(identity, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(identity, /createHmac\("sha256"/);
  assert.match(identity, /previous_secret_hash/);
  assert.match(identity, /previous_valid_until/);
  assert.match(identity, /replay_detected_at/);
  assert.match(identity, /credential_concurrent_context_replay/);
  assert.match(identity, /overlapContextChanged && Number\(row\.replay_count/);
  assert.match(login, /canStrengthen: policy\.canStrengthen && resolved\.context_changed !== true/);
  assert.match(identity, /formatCredentialToken\(credentialId, secret\)/);
  assert.doesNotMatch(identity, /formatCredentialToken\([^)]*user/i);
  assert.doesNotMatch(identity, /update\(\{ device_key_hash:keyHash/);
  assert.match(identity, /finalizeTrustedDeviceCredential/);
  assert.match(login, /registerUserSession[\s\S]+finalizeTrustedDeviceCredential/);
});

test("logout keeps device credential while forget-device revokes it", () => {
  const logout = read("app/api/logout/route.js");
  const forget = read("app/api/forget-device/route.js");
  const identity = read("lib/server/device-identity.js");
  const settings = read("app/device-settings/page.js");
  assert.doesNotMatch(logout, /clearTrustedDeviceCookie/);
  assert.match(logout, /revokeUserSession/);
  assert.match(logout, /clearRecoveryAttemptCookie/);
  assert.match(forget, /forgetTrustedDevice/);
  assert.match(forget, /clearTrustedDeviceCookie/);
  assert.match(forget, /revokeUserSession/);
  assert.match(forget, /session\.payload/);
  assert.match(identity, /sessionPayload\?\.decision_id/);
  assert.match(identity, /sr_forget_device_identity/);
  assert.match(settings, /post\("\/api\/logout"\)/);
  assert.match(settings, /post\("\/api\/forget-device"\)/);
  assert.match(settings, /localStorage\.removeItem\(key\)/);
  assert.match(settings, /forgetDevice:\s*true/);
});

test("rate limiting and session invalidation are distributed", () => {
  const login = read("app/api/login/route.js");
  const limiter = read("lib/server/rate-limit.js");
  const auth = read("lib/server/auth.js");
  const middleware = read("middleware.js");
  const registry = read("lib/server/session-registry.js");
  const nickname = read("lib/server/nickname.js");
  const sql = read("SUPABASE_PRIMARY_DEVICE_OWNER_IDENTITY_V3.sql");
  assert.doesNotMatch(login, /globalThis|new Map\(/);
  assert.match(limiter, /sr_auth_rate_limit_take/);
  assert.match(login, /scope:\s*"login_ip"/);
  assert.match(sql, /on conflict \(scope, key_hash\) do update/);
  assert.match(auth, /validateUserSession/);
  assert.match(auth, /readSignedUserSession/);
  assert.match(auth, /session_version/);
  assert.match(middleware, /payload\?\.role === "user"/);
  assert.match(registry, /validateActiveUser/);
  assert.match(registry, /profile\.active === false/);
  assert.match(nickname, /from\("support_auth_sessions"\)/);
  assert.match(sql, /support_auth_sessions/);
});

test("login enforces actual request size and browser secrets require Web Crypto", () => {
  const login = read("app/api/login/route.js");
  const page = read("app/login/page.js");
  const learner = read("public/device-confidence-learn.js");
  assert.match(login, /const rawBody = await request\.text\(\)/);
  assert.match(login, /textEncoder\.encode\(rawBody\)\.byteLength > MAX_LOGIN_BODY_BYTES/);
  assert.match(page, /new Uint8Array\(32\)/);
  assert.doesNotMatch(page, /return `dev_\$\{Date\.now[\s\S]{0,180}Math\.random/);
  assert.match(learner, /new Uint8Array\(32\)/);
  assert.doesNotMatch(learner, /Math\.random|fallbackHash/);
});

test("login UI cannot wait forever on fingerprint or network requests", () => {
  const page = read("app/login/page.js");
  assert.match(page, /function settleWithin\(/);
  assert.match(page, /async function fetchWithTimeout\(/);
  assert.match(page, /fetchWithTimeout\("\/api\/login"[\s\S]{0,260}, 25000\)/);
  assert.match(page, /fetchWithTimeout\("\/api\/support-profile"[\s\S]{0,220}, 3000\)/);
});

test("a first login can register a new nickname without claiming an existing user id", () => {
  const login = read("app/api/login/route.js");
  const page = read("app/login/page.js");
  assert.match(login, /const newUserId = `uid_\$\{randomUUID\(\)\}`/);
  assert.match(login, /ensureNicknameForUser\(supabase, newUserId, newNickname\)/);
  assert.match(login, /source: "first_login_nickname_registration"/);
  assert.match(login, /nickname_registration_required: true/);
  assert.match(page, /nicknameRegistrationRequired/);
  assert.match(page, /حفظ الكنية والدخول/);
  assert.doesNotMatch(login, /normalizeUserId\(body\.(?:user_id|primary_user_id)/);
});

test("legacy support_users schema does not block first or automatic login", () => {
  const sessions = read("lib/server/session-registry.js");
  const identity = read("lib/server/device-identity.js");
  const confidence = read("lib/server/device-confidence.js");
  const login = read("app/api/login/route.js");
  assert.doesNotMatch(sessions, /User account-status migration is required/);
  assert.doesNotMatch(identity, /User account-status migration is required/);
  assert.doesNotMatch(confidence, /profile\.supportsReset === false/);
  assert.doesNotMatch(login, /profile\.supportsReset === false/);
  assert.match(sessions, /support_users tables have no account-status\/reset columns/);
});

test("migration protects sensitive tables with RLS and server-only grants", () => {
  const sql = read("SUPABASE_PRIMARY_DEVICE_OWNER_IDENTITY_V3.sql");
  for (const table of [
    "support_device_credentials",
    "support_device_recovery_tickets",
    "support_device_identity_decisions",
    "support_device_identity_observations",
    "support_device_identity_conflicts",
    "support_auth_sessions",
    "support_auth_rate_limits",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
  }
  assert.match(sql, /unique references public\.support_device_identities\(device_id\)/i);
  assert.match(sql, /unique index[^;]+device_key_hash/is);
  assert.match(sql, /device owner user_id is immutable/);
  assert.match(sql, /selected enrollment requires independent promotion/);
});

test("no raw secrets, passwords or invasive content are persisted by v3", () => {
  const sql = read("SUPABASE_PRIMARY_DEVICE_OWNER_IDENTITY_V3.sql");
  const identity = read("lib/server/device-identity.js");
  assert.match(sql, /secret_hash/);
  assert.doesNotMatch(sql, /password|clipboard|screenshot|microphone|camera|keystroke|file_name/i);
  assert.doesNotMatch(identity, /console\.(?:log|warn|error).*secret/i);
  assert.match(identity, /value\.length >= 32/);
});
