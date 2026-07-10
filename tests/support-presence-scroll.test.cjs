const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function importAsDataModule(file) {
  const source = read(file);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

function extractScrollController() {
  const source = read("public/support-chat.js");
  const start = source.indexOf("function createSupportScrollController(");
  const end = source.indexOf("\n\nconst supportScroll", start);
  assert.ok(start >= 0 && end > start, "scroll controller must remain a discrete Support helper");
  return {
    source,
    functionSource: source.slice(start, end),
    create: vm.runInNewContext(`(${source.slice(start, end)})`),
  };
}

function makeScrollHarness({ rowCount = 5, rowHeight = 50, clientHeight = 100, scrollTop = 0 } = {}) {
  const frames = [];
  const listeners = new Map();
  const list = {
    clientHeight,
    scrollHeight: rowCount * rowHeight,
    scrollTop,
    rows: [],
    getBoundingClientRect: () => ({ top: 0, bottom: clientHeight }),
    querySelectorAll: () => list.rows.slice(),
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type, callback) => {
      if (listeners.get(type) === callback) listeners.delete(type);
    },
    emitScroll: () => listeners.get("scroll")?.(),
  };

  for (let index = 0; index < rowCount; index += 1) {
    const row = {
      dataset: { supportMsgKey: `message-${index}` },
      top: index * rowHeight,
      height: rowHeight,
      getBoundingClientRect() {
        const top = this.top - list.scrollTop;
        return { top, bottom: top + this.height, height: this.height };
      },
    };
    list.rows.push(row);
  }

  return {
    list,
    requestFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame() {},
    flushFrame() {
      const callback = frames.shift();
      assert.ok(callback, "a post-mutation animation frame should be queued");
      callback();
    },
  };
}

test("Presence snapshot deduplicates tabs by user_id", async () => {
  const { createPresenceSnapshot } = await importAsDataModule("public/presence-snapshot.js");
  const state = {
    "user-a:tab-1": [{ user_id: "user-a", tab_id: "tab-1", display_name: "A" }],
    "user-a:tab-2": [{ user_id: "user-a", tab_id: "tab-2", display_name: "A" }],
  };
  const snapshot = createPresenceSnapshot(state, "connected", 10);
  assert.equal(snapshot.count, 1);
  assert.deepEqual(Array.from(snapshot.onlineUserIds), ["user-a"]);
  assert.equal(snapshot.users[0].sessionCount, 2);
});

test("Presence join/leave scenarios count unique live users", async () => {
  const { createPresenceSnapshot } = await importAsDataModule("public/presence-snapshot.js");
  const oneTab = {
    "user-a:tab-1": [{ user_id: "user-a", tab_id: "tab-1" }],
  };
  assert.equal(createPresenceSnapshot(oneTab, "connected").count, 1);

  const twoUsers = {
    ...oneTab,
    "user-a:tab-2": [{ user_id: "user-a", tab_id: "tab-2" }],
    "user-b:tab-1": [{ user_id: "user-b", tab_id: "tab-1" }],
  };
  assert.equal(createPresenceSnapshot(twoUsers, "connected").count, 2);

  delete twoUsers["user-a:tab-1"];
  assert.equal(createPresenceSnapshot(twoUsers, "connected").count, 2, "closing one of two tabs must not remove the user");
  delete twoUsers["user-a:tab-2"];
  assert.equal(createPresenceSnapshot(twoUsers, "connected").count, 1, "closing the last tab must remove the user");
});

test("Presence is unknown without a confirmed tracked session", async () => {
  const { createPresenceSnapshot, hasPresenceSession } = await importAsDataModule("public/presence-snapshot.js");
  const state = {
    "user-a:tab-1": [{ user_id: "user-a", tab_id: "tab-1", presence_key: "user-a:tab-1" }],
  };
  assert.equal(hasPresenceSession(state, "user-a", "tab-1", "user-a:tab-1"), true);
  assert.equal(hasPresenceSession(state, "user-a", "tab-2", "user-a:tab-2"), false);
  const reconnecting = createPresenceSnapshot(state, "reconnecting", 20);
  assert.equal(reconnecting.count, null);
  assert.deepEqual(Array.from(reconnecting.onlineUserIds), []);
});

test("Presence owner tracks once, publishes confirmed state, and reuses one channel", async () => {
  const presenceHelpers = await importAsDataModule("public/presence-snapshot.js");
  const listeners = new Map();
  const windowObject = {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    dispatchEvent(event) {
      for (const callback of listeners.get(event.type) || []) callback(event);
    },
  };
  const presenceState = {};
  let channelCount = 0;
  let trackCount = 0;
  let removeCount = 0;
  let channelStatus = null;
  const presenceHandlers = new Map();
  const channel = {
    on(_type, filter, callback) {
      presenceHandlers.set(filter.event, callback);
      return this;
    },
    subscribe(callback) {
      channelStatus = callback;
      callback("SUBSCRIBED");
      return this;
    },
    presenceState: () => presenceState,
    async track(payload) {
      trackCount += 1;
      presenceState[payload.presence_key] = [payload];
      presenceHandlers.get("sync")?.();
      return "ok";
    },
    async untrack() { return "ok"; },
  };
  const deps = {
    supabase: {
      channel(name) {
        assert.equal(name, "sr_tool_online");
        channelCount += 1;
        return channel;
      },
      async removeChannel() { removeCount += 1; },
    },
    getStableUserId: () => "user-a-long-id",
    getStablePresenceLabel: () => "User A",
    aliasForUserId: () => "Alias A",
    ...presenceHelpers,
  };
  const makeContext = () => vm.createContext({
    __deps: deps,
    window: windowObject,
    document: { visibilityState: "visible", getElementById: () => null },
    navigator: { onLine: true },
    sessionStorage: { setItem() {} },
    crypto: { randomUUID: () => "tab-one" },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    Date,
    Math,
    Promise,
    Object,
    Array,
    Map,
    Set,
    String,
    Number,
    RegExp,
    setTimeout: () => 1,
    clearTimeout() {},
  });
  const transformed = read("public/online-users-count.js")
    .replace(/^import .*;\n/gm, "")
    .replace(
      /const CHANNEL_NAME =/,
      "const { supabase, getStableUserId, getStablePresenceLabel, aliasForUserId, createPresenceSnapshot, hasPresenceSession } = globalThis.__deps;\nconst CHANNEL_NAME ="
    );

  vm.runInContext(transformed, makeContext());
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(channelCount, 1);
  assert.equal(trackCount, 1);
  assert.equal(windowObject.__srPresenceSnapshot.status, "connected");
  assert.equal(windowObject.__srPresenceSnapshot.count, 1);

  presenceState["user-a:second-tab"] = [{ user_id: "user-a-long-id", tab_id: "second-tab" }];
  presenceHandlers.get("sync")();
  assert.equal(windowObject.__srPresenceSnapshot.count, 1);
  presenceState["user-b:first-tab"] = [{ user_id: "user-b-long-id", tab_id: "first-tab" }];
  presenceHandlers.get("sync")();
  assert.equal(windowObject.__srPresenceSnapshot.count, 2);

  vm.runInContext(transformed, makeContext());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(channelCount, 1, "duplicate module initialization must reuse the owner");

  channelStatus("CHANNEL_ERROR");
  assert.equal(windowObject.__srPresenceSnapshot.status, "reconnecting");
  assert.equal(windowObject.__srPresenceSnapshot.count, null);
  for (const callback of listeners.get("pagehide") || []) callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removeCount, 1);
});

test("only online-users-count owns sr_tool_online and every consumer reads one snapshot", () => {
  const owner = read("public/online-users-count.js");
  const visual = read("public/support-presence-visual.js");
  const ux = read("public/support-suggestions-pro-ux.js");
  const allPublicJs = fs.readdirSync(path.join(root, "public"))
    .filter((name) => name.endsWith(".js") && name !== "non-critical-loader.js")
    .map((name) => read(path.join("public", name)))
    .join("\n");

  assert.equal((allPublicJs.match(/sr_tool_online/g) || []).length, 1);
  assert.equal((owner.match(/supabase\.channel\(/g) || []).length, 1);
  assert.doesNotMatch(visual, /supabase|\.channel\(|\.track\(/);
  assert.doesNotMatch(owner, /Math\.max\(1/);
  assert.match(owner, /sr:presence-changed/);
  assert.match(owner, /window\.__srPresenceSnapshot\s*=\s*snapshot/);
  assert.match(visual, /window\.__srPresenceSnapshot/);
  assert.match(ux, /snapshot\.count/);
  assert.doesNotMatch(ux, /rows\.filter\(\(r\)\s*=>\s*r\.classList\.contains\("is-online"\)\)/);
});

test("scroll controller preserves the first surviving visible anchor for deletions", () => {
  const { create } = extractScrollController();

  for (const deletedIndex of [0, 1, 4]) {
    const harness = makeScrollHarness({ scrollTop: 75 });
    const controller = create(harness.list, {
      threshold: 24,
      requestFrame: harness.requestFrame,
      cancelFrame: harness.cancelFrame,
    });
    harness.list.emitScroll();
    assert.equal(controller.isPinnedToBottom(), false);

    controller.mutate(() => {
      harness.list.rows.splice(deletedIndex, 1);
      for (let index = deletedIndex; index < harness.list.rows.length; index += 1) {
        harness.list.rows[index].top -= 50;
      }
      harness.list.scrollHeight -= 50;
    });
    harness.flushFrame();

    const expected = deletedIndex <= 1 ? 25 : 75;
    assert.equal(harness.list.scrollTop, expected, `delete index ${deletedIndex} should keep the visible anchor stable`);
  }
});

test("scroll controller keeps a pinned user at the bottom after a new message", () => {
  const { create } = extractScrollController();
  const harness = makeScrollHarness({ rowCount: 4, scrollTop: 100 });
  const controller = create(harness.list, {
    threshold: 24,
    requestFrame: harness.requestFrame,
    cancelFrame: harness.cancelFrame,
  });
  harness.list.emitScroll();
  assert.equal(controller.isPinnedToBottom(), true);

  controller.mutate(() => {
    harness.list.scrollHeight += 50;
  });
  harness.flushFrame();
  assert.equal(harness.list.scrollTop, 150);
});

test("new messages do not move a reader who is pinned to a visible anchor", () => {
  const { create } = extractScrollController();
  const harness = makeScrollHarness({ rowCount: 5, scrollTop: 75 });
  const controller = create(harness.list, {
    threshold: 24,
    requestFrame: harness.requestFrame,
    cancelFrame: harness.cancelFrame,
  });
  harness.list.emitScroll();
  controller.mutate(() => {
    harness.list.scrollHeight += 50;
    harness.list.rows.push({
      dataset: { supportMsgKey: "message-new" },
      top: 250,
      height: 50,
      getBoundingClientRect() {
        const top = this.top - harness.list.scrollTop;
        return { top, bottom: top + this.height, height: this.height };
      },
    });
  });
  harness.flushFrame();
  assert.equal(harness.list.scrollTop, 75);
});

test("replacing content above the viewport preserves the visible message offset", () => {
  const { create } = extractScrollController();
  const harness = makeScrollHarness({ rowCount: 5, scrollTop: 75 });
  const controller = create(harness.list, {
    threshold: 24,
    requestFrame: harness.requestFrame,
    cancelFrame: harness.cancelFrame,
  });
  harness.list.emitScroll();
  controller.mutate(() => {
    harness.list.rows[0].height += 20;
    for (let index = 1; index < harness.list.rows.length; index += 1) {
      harness.list.rows[index].top += 20;
    }
    harness.list.scrollHeight += 20;
  });
  harness.flushFrame();
  assert.equal(harness.list.scrollTop, 95);
  assert.equal(harness.list.rows[1].getBoundingClientRect().top, -25);
});

test("Support input paths cannot control message scroll", () => {
  const { source, functionSource } = extractScrollController();
  const outsideController = source.replace(functionSource, "");
  assert.doesNotMatch(outsideController, /(?:messagesList|list)\.scrollTop\s*=/);
  assert.doesNotMatch(source, /ResizeObserver|scrollIntoView|settleSupportAtBottom|keepSupportScrollStable/);
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /!e\.isComposing\s*&&\s*!supportInputComposing/);
});

test("message polling and interaction refresh avoid full list rebuilds", () => {
  const source = read("public/support-chat.js");
  assert.match(source, /signature === lastSupportListSignature[\s\S]+return false;/);
  assert.match(source, /element\.replaceWith\(replacement\)/);
  assert.doesNotMatch(source, /messagesList\.innerHTML\s*=\s*orderedRows/);
  assert.doesNotMatch(source, /renderStableMessageList\(visibleMessageRows/);
  assert.doesNotMatch(source, /\.outerHTML\s*=/);
});

test("Support composer has one fixed sizing contract", () => {
  const css = read("public/support-suggestions-final-upgrade.css");
  const fixedRule = css.match(/#supportChatOverlay #supportMessageInput\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.match(fixedRule, /field-sizing:fixed/);
  assert.match(fixedRule, /height:56px/);
  assert.match(fixedRule, /min-height:56px/);
  assert.match(fixedRule, /max-height:56px/);
  const contentRule = css.match(/#suggestionInput,[\s\S]*?field-sizing:content[\s\S]*?\}/)?.[0] || "";
  assert.doesNotMatch(contentRule, /supportMessageInput/);
  assert.match(css, /100dvh/);
});
