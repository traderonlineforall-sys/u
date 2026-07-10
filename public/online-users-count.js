/*
 * Single owner for tool-wide Supabase Presence plus the header counter UI.
 *
 * Every tab tracks under its own key. The published snapshot is deduplicated by
 * payload.user_id, so multiple tabs belonging to one user still count once.
 */

import { supabase } from "./supabase-client.js";
import { getStableUserId, getStablePresenceLabel, aliasForUserId } from "./stable-user-identity.js";
import { createPresenceSnapshot, hasPresenceSession } from "./presence-snapshot.js?v=20260710-presence-store-v2";

const CHANNEL_NAME = "sr_tool_online";
const TAB_ID_KEY = "sr_tool_presence_tab_id";
const OWNER_VERSION = 2;
const USER_ID = getStableUserId();

function createTabId() {
  let id = "";
  try {
    id = globalThis.crypto?.randomUUID?.() || "";
  } catch {}
  if (!id) id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  id = `tab-${id}`;

  // Always replace a copied sessionStorage value. Browsers may clone
  // sessionStorage when a tab is duplicated, but each live document needs its
  // own Presence key.
  try { sessionStorage.setItem(TAB_ID_KEY, id); } catch {}
  return id;
}

function createPresenceOwner() {
  const tabId = createTabId();
  const presenceKey = `${USER_ID}:${tabId}`;
  let channel = null;
  let subscribed = false;
  let generation = 0;
  let starting = null;
  let stopping = null;
  let trackQueue = Promise.resolve();
  let reconnectTimer = 0;
  let intentionallyStopped = false;

  function publish(snapshot) {
    window.__srPresenceSnapshot = snapshot;
    window.dispatchEvent(new CustomEvent("sr:presence-changed", { detail: snapshot }));
    return snapshot;
  }

  function publishUnavailable(status) {
    return publish(createPresenceSnapshot(null, status, Date.now()));
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }

  function syncFromChannel(expectedGeneration) {
    if (!channel || expectedGeneration !== generation || !subscribed) return;
    let state = {};
    try { state = channel.presenceState() || {}; } catch {}

    // A SUBSCRIBED socket alone is not proof that this tab is present. Keep an
    // unknown/connecting snapshot until our tracked meta appears in state.
    if (!hasPresenceSession(state, USER_ID, tabId, presenceKey)) {
      publishUnavailable(navigator.onLine === false ? "reconnecting" : "connecting");
      return;
    }
    publish(createPresenceSnapshot(state, "connected", Date.now()));
  }

  async function performTrack(expectedGeneration) {
    const activeChannel = channel;
    if (!activeChannel || !subscribed || expectedGeneration !== generation) return;
    try {
      const result = await activeChannel.track({
        user_id: USER_ID,
        tab_id: tabId,
        presence_key: presenceKey,
        display_name: getStablePresenceLabel(),
        alias: aliasForUserId(USER_ID),
        online_at: new Date().toISOString(),
      });
      if (activeChannel !== channel || expectedGeneration !== generation) return;
      if (result && result !== "ok") {
        publishUnavailable("reconnecting");
        return;
      }
      syncFromChannel(expectedGeneration);
    } catch {
      if (activeChannel === channel && expectedGeneration === generation) {
        publishUnavailable("reconnecting");
      }
    }
  }

  function trackCurrentPresence(expectedGeneration = generation) {
    trackQueue = trackQueue
      .catch(() => {})
      .then(() => performTrack(expectedGeneration));
    return trackQueue;
  }

  async function teardown({ publishStatus = "" } = {}) {
    clearReconnectTimer();
    const oldChannel = channel;
    const wasSubscribed = subscribed;
    channel = null;
    subscribed = false;
    generation += 1;
    if (publishStatus) publishUnavailable(publishStatus);
    if (!oldChannel) return;

    try {
      if (wasSubscribed) await oldChannel.untrack();
    } catch {}
    try { await supabase.removeChannel(oldChannel); } catch {}
  }

  function scheduleCleanReconnect(delay = 6000) {
    if (reconnectTimer || intentionallyStopped) return;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = 0;
      if (intentionallyStopped || subscribed || document.visibilityState === "hidden") return;
      await teardown();
      start();
    }, delay);
  }

  async function start() {
    if (channel || starting) return starting;
    if (stopping) await stopping;
    intentionallyStopped = false;
    publishUnavailable(navigator.onLine === false ? "reconnecting" : "connecting");

    const expectedGeneration = ++generation;
    starting = Promise.resolve().then(() => {
      if (intentionallyStopped || expectedGeneration !== generation) return;
      const nextChannel = supabase.channel(CHANNEL_NAME, {
        config: { presence: { key: presenceKey } },
      });
      channel = nextChannel;

      nextChannel
        .on("presence", { event: "sync" }, () => syncFromChannel(expectedGeneration))
        .on("presence", { event: "join" }, () => syncFromChannel(expectedGeneration))
        .on("presence", { event: "leave" }, () => syncFromChannel(expectedGeneration))
        .subscribe((status) => {
          if (nextChannel !== channel || expectedGeneration !== generation) return;
          if (status === "SUBSCRIBED") {
            clearReconnectTimer();
            subscribed = true;
            publishUnavailable("connecting");
            trackCurrentPresence(expectedGeneration);
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            subscribed = false;
            publishUnavailable("reconnecting");
            // Supabase normally rejoins this same channel. The delayed clean
            // restart is only a watchdog and removes the old channel first.
            scheduleCleanReconnect();
            return;
          }
          if (status === "CLOSED" && !intentionallyStopped) {
            subscribed = false;
            publishUnavailable("reconnecting");
            scheduleCleanReconnect(1200);
          }
        });
    }).catch(() => {
      publishUnavailable("reconnecting");
      scheduleCleanReconnect(1200);
    }).finally(() => {
      starting = null;
    });
    return starting;
  }

  function stop() {
    intentionallyStopped = true;
    if (stopping) return stopping;
    stopping = teardown({ publishStatus: "unknown" }).finally(() => {
      stopping = null;
    });
    return stopping;
  }

  function retrack() {
    if (!subscribed) return Promise.resolve();
    return trackCurrentPresence(generation);
  }

  const owner = Object.freeze({
    version: OWNER_VERSION,
    getSnapshot: () => window.__srPresenceSnapshot || createPresenceSnapshot(null, "unknown", Date.now()),
    start,
    stop,
    retrack,
  });

  window.addEventListener("sr:nickname-updated", retrack);
  window.addEventListener("offline", () => {
    subscribed = false;
    publishUnavailable("reconnecting");
  });
  window.addEventListener("online", () => {
    if (!channel) start();
    else scheduleCleanReconnect(3000);
  });
  window.addEventListener("pagehide", stop);
  window.addEventListener("beforeunload", stop);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted || !channel) start();
  });

  return owner;
}

function ensureCountPill() {
  const wrap = document.getElementById("UA07_SECRET_ENVELOPE_WRAP");
  const btn = document.getElementById("UA07_SECRET_ENVELOPE");
  if (!wrap || !btn) return null;

  let pill = document.getElementById("UA07_ONLINE_COUNT");
  if (!pill) {
    pill = document.createElement("span");
    pill.id = "UA07_ONLINE_COUNT";
    pill.innerHTML = `
      <span class="ua07-online-lamp" aria-hidden="true"></span>
      <span class="ua07-online-num" aria-hidden="true">…</span>
    `;
    pill.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "gap:6px",
      "min-width:32px",
      "height:18px",
      "padding:0 8px",
      "border-radius:999px",
      "border:1px solid rgba(255,255,255,0.22)",
      "background:rgba(255,255,255,0.08)",
      "color:rgba(255,255,255,0.92)",
      "font-size:11px",
      "font-weight:800",
      "letter-spacing:0.2px",
      "user-select:none",
    ].join(";");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.justifyContent = "center";
    wrap.style.gap = "6px";
    wrap.insertBefore(pill, btn);
  }
  return pill;
}

function connectedTitle(snapshot) {
  const users = Array.isArray(snapshot?.users) ? snapshot.users : [];
  const names = users.map((user) => user.display_name || user.alias || "User");
  const shown = names.slice(0, 12);
  let title = `Online: ${snapshot.count}`;
  if (shown.length) title += `\n${shown.join(", ")}`;
  if (names.length > shown.length) title += `\n+${names.length - shown.length} more`;
  return title;
}

function renderCountPill(pill, snapshot) {
  if (!pill || !snapshot) return;
  const number = pill.querySelector(".ua07-online-num");
  const lamp = pill.querySelector(".ua07-online-lamp");
  let text = "—";
  let title = "Online count unknown";
  let lampColor = "rgba(160,168,184,.90)";
  let lampGlow = "rgba(160,168,184,.35)";

  if (snapshot.status === "connected") {
    text = String(snapshot.count);
    title = connectedTitle(snapshot);
    lampColor = "rgba(90,255,145,.92)";
    lampGlow = "rgba(90,255,145,.65)";
  } else if (snapshot.status === "connecting") {
    text = "…";
    title = "Connecting…";
    lampColor = "rgba(243,204,114,.94)";
    lampGlow = "rgba(243,204,114,.55)";
  } else if (snapshot.status === "reconnecting") {
    title = "Reconnecting · Online count unknown";
    lampColor = "rgba(255,153,92,.94)";
    lampGlow = "rgba(255,153,92,.52)";
  }

  if (number) number.textContent = text;
  if (lamp) {
    lamp.style.cssText = [
      "width:10px",
      "height:10px",
      "border-radius:999px",
      `background:${lampColor}`,
      `box-shadow:0 0 10px ${lampGlow}`,
      "border:1px solid rgba(255,255,255,0.26)",
    ].join(";");
  }
  pill.dataset.presenceStatus = snapshot.status;
  pill.title = title;
  pill.setAttribute("aria-label", title.replace(/\s+/g, " "));
}

function bindCounterConsumer(owner) {
  if (window.__srPresenceCounterBound) return;
  window.__srPresenceCounterBound = true;
  let pill = null;

  const render = (snapshot) => {
    pill = pill || ensureCountPill();
    if (pill) renderCountPill(pill, snapshot || owner.getSnapshot());
  };
  window.addEventListener("sr:presence-changed", (event) => render(event.detail));

  let tries = 0;
  const waitForPill = () => {
    tries += 1;
    pill = ensureCountPill();
    if (pill) {
      render(owner.getSnapshot());
      return;
    }
    if (tries < 120) setTimeout(waitForPill, 250);
  };
  waitForPill();
}

let owner = window.__srPresenceOwner;
if (!owner) {
  owner = createPresenceOwner();
  window.__srPresenceOwner = owner;
  owner.start();
}
bindCounterConsumer(owner);
