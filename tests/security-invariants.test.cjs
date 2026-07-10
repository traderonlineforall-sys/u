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

test("login uses exact trusted device identity and disables manual fuzzy choice", () => {
  const login = read("app/api/login/route.js");
  const identity = read("lib/server/device-identity.js");
  assert.match(login, /resolveTrustedDeviceIdentity/);
  assert.match(login, /registerTrustedDeviceIdentity/);
  assert.doesNotMatch(login, /verifyDeviceNicknameChoice/);
  assert.match(identity, /device_key_hash/);
  assert.match(identity, /timingSafeEqual/);
});

test("database upgrade leaves no anonymous support message read policy", () => {
  const sql = read("SUPABASE_TRUSTED_DEVICE_IDENTITY_UPGRADE.sql");
  assert.match(sql, /drop policy if exists "sr read support_messages"/i);
  assert.doesNotMatch(sql, /create policy[^;]+support_messages[^;]+to anon/is);
  assert.match(sql, /support_device_identities/);
});
