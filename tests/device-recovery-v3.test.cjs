const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto;
if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
if (!globalThis.atob) globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");

async function sessionModule() {
  return import(dataUrl(read("lib/session.js")));
}

async function recoveryModule() {
  const sessionUrl = dataUrl(read("lib/session.js"));
  const nicknameUrl = dataUrl(`
    export function cleanNickname(value) {
      return String(value || "").replace(/[\\r\\n\\t]+/g, " ").replace(/\\s+/g, " ").trim().slice(0, 40);
    }
    export function normalizeUserId(value) {
      const id = String(value || "").trim();
      return /^[a-zA-Z0-9_.:-]{8,160}$/.test(id) ? id : "";
    }
    export function isMissingTableOrColumn(error) {
      return ["42P01", "42703"].includes(String(error?.code || ""));
    }
  `);
  const source = read("lib/server/device-recovery.js")
    .replace('from "../session.js"', `from "${sessionUrl}"`)
    .replace('from "./nickname.js"', `from "${nicknameUrl}"`);
  return import(dataUrl(source));
}

function recoveryStore() {
  const state = { row: null };
  const supabase = {
    from(table) {
      assert.equal(table, "support_device_recovery_tickets");
      return {
        async insert(row) {
          state.row = { ...row, used_at: null, cancelled_at: null };
          return { error: null };
        },
        select() {
          const filters = {};
          const query = {
            eq(column, value) {
              filters[column] = value;
              return query;
            },
            async limit() {
              const matches = state.row
                && state.row.ticket_id === filters.ticket_id
                && state.row.attempt_id === filters.attempt_id;
              return { data: matches ? [{ ...state.row }] : [], error: null };
            },
          };
          return query;
        },
      };
    },
  };
  return { state, supabase };
}

test("session signing rejects tampering and preserves explicit token roles", async () => {
  const { signSession, verifySession } = await sessionModule();
  const secret = "test-session-secret-that-is-long-enough";
  const exp = Date.now() + 60_000;
  const user = await signSession({ role: "user", session_version: 2, uid: "user-00000001", sid: crypto.randomUUID(), exp }, secret);
  const recovery = await signSession({ role: "device_recovery_ticket", purpose: "nickname_selection", exp }, secret);

  assert.equal((await verifySession(user, secret)).payload.role, "user");
  assert.equal((await verifySession(recovery, secret)).payload.role, "device_recovery_ticket");
  assert.equal((await verifySession(`${user.slice(0, -1)}x`, secret)).ok, false);
  assert.equal((await verifySession(await signSession({ role: "user", exp: Date.now() - 1 }, secret), secret)).reason, "expired");
});

test("recovery ticket is opaque, role-bound, lineage-linked, and tolerates mutable context", async () => {
  const recovery = await recoveryModule();
  const sessions = await sessionModule();
  const { state, supabase } = recoveryStore();
  const secret = "test-recovery-secret-that-is-long-enough";
  const parentDecisionId = crypto.randomUUID();
  const created = await recovery.createDeviceRecoveryTicket(
    supabase,
    { recovery_binding_hash: "context-before-browser-update" },
    [
      { user_id: "user-00000001", display_name: "Alpha", score: 94 },
      { user_id: "user-00000002", display_name: "Beta", score: 91 },
    ],
    secret,
    { parentDecisionId }
  );

  assert.equal(created.ok, true);
  assert.equal(state.row.parent_decision_id, parentDecisionId);
  assert.deepEqual(Object.keys(created.choices[0]).sort(), ["choice_id", "display_name"]);
  assert.equal(JSON.stringify(created.choices).includes("user-00000001"), false);
  assert.equal(JSON.stringify(created.choices).includes("94"), false);

  const signed = await sessions.verifySession(created.token, secret);
  assert.equal(signed.ok, true);
  assert.equal(signed.payload.role, "device_recovery_ticket");
  assert.equal("uid" in signed.payload, false);
  assert.equal("score" in signed.payload, false);
  assert.equal("parent_decision_id" in signed.payload, false);

  const request = {
    headers: new Headers({ cookie: `__Host-srloginctx=${created.attempt_token}` }),
  };
  const verified = await recovery.verifyDeviceRecoveryTicket(
    request,
    supabase,
    created.token,
    created.choices[0].choice_id,
    { recovery_binding_hash: "context-after-browser-update" },
    secret
  );
  assert.equal(verified.ok, true);
  assert.equal(verified.context_changed, true);
  assert.equal(verified.parent_decision_id, parentDecisionId);
  assert.equal(verified.user_id, "user-00000001");

  const modifiedChoice = await recovery.verifyDeviceRecoveryTicket(
    request,
    supabase,
    created.token,
    crypto.randomUUID(),
    { recovery_binding_hash: "context-after-browser-update" },
    secret
  );
  assert.equal(modifiedChoice.ok, false);
});

test("homogeneous fleet and storage-loss fixture follows conservative policy", async () => {
  const fixture = JSON.parse(read("tests/fixtures/homogeneous-company-fleet.json"));
  const source = read("lib/server/device-policy.js");
  const { decideDeviceIdentity } = await import(dataUrl(source));

  assert.equal(fixture.devices.length, 10);
  assert.equal(new Set(fixture.devices.map((row) => row.credential)).size, 10);
  assert.equal(new Set(fixture.devices.map((row) => JSON.stringify(fixture.shared_profile))).size, 1);
  for (const scenario of fixture.storage_scenarios) {
    assert.equal(decideDeviceIdentity(scenario.input).decision, scenario.expected_decision, scenario.name);
  }
  assert.match(fixture.clone_limit, /cannot prove/i);
});
