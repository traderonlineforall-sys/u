const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("user write APIs bind identity to signed session uid", () => {
  const files = [
    "app/api/public-suggestion/route.js",
    "app/api/public-suggestion-reply/route.js",
    "app/api/support-message/route.js",
    "app/api/support-profile/route.js",
    "app/api/suggestion-reactions/route.js",
    "app/api/suggestion-item-reactions/route.js",
    "app/api/user-delete-support-message/route.js",
  ];
  for(const file of files){
    const src = read(file);
    assert.match(src, /sess\.payload\?\.uid|sess\.payload\.uid/, `${file} must use session uid`);
    assert.doesNotMatch(src, /normalizeUserId\(body\?\.user_id\)/, `${file} must not trust body user_id`);
  }
});

test("private support reads enforce room membership", () => {
  const src = read("app/api/support-messages/route.js");
  assert.match(src, /canAccessDm\(roomId, userId\)/);
  assert.match(src, /status:403/);
  assert.match(src, /rows\.filter\(\(row\).*canAccessDm/s);
});

test("login uses server-bound credentials and one-time opaque recovery choices", () => {
  const login = read("app/api/login/route.js");
  const identity = read("lib/server/device-identity.js");
  const recovery = read("lib/server/device-recovery.js");
  assert.match(login, /resolveTrustedDeviceIdentity/);
  assert.match(login, /registerTrustedDeviceIdentity/);
  assert.match(login, /verifyDeviceNicknameChoice/);
  assert.match(login, /verifyDeviceRecoveryTicket/);
  assert.match(login, /consumeDeviceRecoveryTicket/);
  assert.match(login, /FORBIDDEN_IDENTITY_FIELDS/);
  assert.match(identity, /device_key_hash/);
  assert.match(identity, /timingSafeEqual/);
  assert.match(identity, /DEVICE_CREDENTIAL_PEPPER/);
  assert.match(identity, /previous_secret_hash/);
  assert.match(recovery, /role:\s*"device_recovery_ticket"/);
  assert.match(recovery, /support_device_recovery_tickets/);
  assert.match(recovery, /RECOVERY_TICKET_MAX_AGE_MS/);
  assert.match(recovery, /minimum_score/);
  assert.doesNotMatch(login, /incomingUserId|requestedNickname/);
});

test("database upgrade leaves no anonymous support message read policy", () => {
  const sql = read("SUPABASE_TRUSTED_DEVICE_IDENTITY_UPGRADE.sql");
  assert.match(sql, /drop policy if exists "sr read support_messages"/i);
  assert.doesNotMatch(sql, /create policy[^;]+support_messages[^;]+to anon/is);
  assert.match(sql, /support_device_identities/);
});

test("device confidence forwards browser-local instance into trusted key hashing", () => {
  const src = read("lib/server/device-confidence.js");
  assert.match(src, /const deviceInstance = sig\.deviceInstanceHash/);
  assert.match(src, /deviceInstance[^;]+all,/s);
  assert.match(src, /device_key_hash:\s*parts\.deviceInstance\s*\?/);
});



test("smart recovery uses strict thresholds, grouped evidence and ambiguity checks", () => {
  const src = read("lib/server/device-confidence.js");
  assert.match(src, /DEVICE_AUTO_RECOVERY_THRESHOLD = 95/);
  assert.match(src, /DEVICE_MANUAL_RECOVERY_THRESHOLD = 80/);
  assert.match(src, /DEVICE_AMBIGUITY_GAP = 14/);
  assert.match(src, /DEVICE_AUTO_MIN_EVIDENCE_WEIGHT = 64/);
  assert.match(src, /DEVICE_MANUAL_MIN_EVIDENCE_WEIGHT = 52/);
  assert.match(src, /DEVICE_AUTO_MAX_STABLE_CONTRADICTIONS = 0/);
  assert.match(src, /stable_contradictions/);
  assert.match(src, /aggregateByUser/);
  assert.match(src, /hardware_profile_hash/);
  assert.match(src, /rendering_profile_hash/);
  assert.match(src, /recovery_binding_hash/);
});

test("login UI never sends a suggested user id directly", () => {
  const page = read("app/login/page.js");
  assert.match(page, /recovery_choice_id/);
  assert.match(page, /recovery_ticket/);
  assert.match(page, /ولا واحدة منهم/);
  assert.doesNotMatch(page, /selected_user_id/);
  assert.doesNotMatch(page, /value=\{nickname\}|placeholder="مثال: عقرب الصحراء"/);
  assert.doesNotMatch(page, /confidenceBadge[^}]*confidence/s);
});

test("smart identity SQL adds only server-side hashed profile columns", () => {
  const sql = read("SUPABASE_SMART_DEVICE_IDENTITY_V2.sql");
  assert.match(sql, /hardware_profile_hash/);
  assert.match(sql, /browser_family_hash/);
  assert.doesNotMatch(sql, /mac_address|serial_number|machine_guid/i);
});
