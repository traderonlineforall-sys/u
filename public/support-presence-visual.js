import { supabase } from "./supabase-client.js";
import { getStableUserId, getStoredUserName } from "./stable-user-identity.js";

/*
 * Support visual presence + palette enhancer.
 * Scope: Support chat DOM only. No SR data, no header, no menus.
 * - Assigns every visible support user/message a fixed, strongly separated palette scheme.
 * - Adds Online/Offline badges using Supabase Realtime Presence.
 */

const USER_ID = getStableUserId();
function currentUserName(){ return getStoredUserName() || "User"; }
const CHANNEL_NAME = "sr_support_online_presence_v1";
const SCHEME_COUNT = 12;
const onlineIds = new Set([USER_ID]);
let channel = null;
let observer = null;
let scheduled = false;

function hashText(value = "") {
  let h = 2166136261;
  const s = String(value || "").trim().toLowerCase();
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getCleanText(node) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function collectVisibleUserKeys() {
  const keys = [];
  const seen = new Set();

  document.querySelectorAll("#supportUsersList .support-user").forEach((row) => {
    const id = String(row.getAttribute("data-user-id") || "").trim();
    const name = getCleanText(row.querySelector(".support-user-name"));
    const key = id || name;
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  });

  document.querySelectorAll("#supportMessagesList .support-msg").forEach((row) => {
    const name = getCleanText(row.querySelector(".support-msg-name"));
    if (name && !seen.has(name)) {
      seen.add(name);
      keys.push(name);
    }
  });

  return keys;
}

function buildSchemeMap() {
  const keys = collectVisibleUserKeys();
  const assigned = new Map();
  const used = new Set();

  // Stable order by hash keeps the same visible users apart without depending on render order.
  keys.sort((a, b) => hashText(a) - hashText(b));

  for (const key of keys) {
    let scheme = hashText(key) % SCHEME_COUNT;
    let guard = 0;
    while (used.has(scheme) && guard < SCHEME_COUNT) {
      scheme = (scheme + 3) % SCHEME_COUNT;
      guard += 1;
    }
    assigned.set(key, String(scheme));
    used.add(scheme);
  }

  return assigned;
}

function ensurePresenceBadge(anchor, isOnline) {
  if (!anchor) return;
  const parent = anchor.parentElement;
  if (!parent) return;

  let badge = parent.querySelector(":scope > .support-presence-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "support-presence-badge";
    anchor.insertAdjacentElement("afterend", badge);
  }

  badge.textContent = isOnline ? "Online" : "Offline";
  badge.classList.toggle("is-online", !!isOnline);
  badge.classList.toggle("is-offline", !isOnline);
}

function getNameToIdMap() {
  const map = new Map();
  document.querySelectorAll("#supportUsersList .support-user").forEach((row) => {
    const id = String(row.getAttribute("data-user-id") || "").trim();
    const name = getCleanText(row.querySelector(".support-user-name"));
    if (id && name) map.set(name, id);
  });
  return map;
}

function applySupportVisualState() {
  scheduled = false;
  const schemeMap = buildSchemeMap();
  const nameToId = getNameToIdMap();

  document.querySelectorAll("#supportUsersList .support-user").forEach((row) => {
    const id = String(row.getAttribute("data-user-id") || "").trim();
    const name = getCleanText(row.querySelector(".support-user-name"));
    const key = id || name;
    const scheme = schemeMap.get(key) || schemeMap.get(name) || String(hashText(key || name) % SCHEME_COUNT);
    row.setAttribute("data-bubble-scheme", scheme);
    const isOnline = !!id && onlineIds.has(id);
    row.classList.toggle("is-online", isOnline);
    row.classList.toggle("is-offline", !isOnline);
    ensurePresenceBadge(row.querySelector(".support-user-name"), isOnline);
  });

  document.querySelectorAll("#supportMessagesList .support-msg").forEach((row) => {
    const name = getCleanText(row.querySelector(".support-msg-name"));
    const id = nameToId.get(name) || "";
    const key = id || name;
    const scheme = schemeMap.get(key) || schemeMap.get(name) || String(hashText(key || name) % SCHEME_COUNT);
    row.setAttribute("data-bubble-scheme", scheme);
    const isOnline = id ? onlineIds.has(id) : false;
    row.classList.toggle("is-online", isOnline);
    row.classList.toggle("is-offline", !isOnline);
    ensurePresenceBadge(row.querySelector(".support-msg-name"), isOnline);
  });
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(applySupportVisualState);
}

function watchSupportDom() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList" || m.type === "attributes") {
        scheduleApply();
        return;
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"]
  });
  scheduleApply();
}

function syncPresenceState() {
  onlineIds.clear();
  onlineIds.add(USER_ID);
  try {
    const state = channel?.presenceState?.() || {};
    Object.values(state).forEach((entries) => {
      (entries || []).forEach((entry) => {
        const id = String(entry?.user_id || "").trim();
        if (id) onlineIds.add(id);
      });
    });
  } catch {}
  scheduleApply();
}

function startPresence() {
  try {
    channel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: USER_ID } }
    });

    channel
      .on("presence", { event: "sync" }, syncPresenceState)
      .on("presence", { event: "join" }, syncPresenceState)
      .on("presence", { event: "leave" }, syncPresenceState)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.track({
            user_id: USER_ID,
            name: currentUserName(),
            online_at: new Date().toISOString()
          }).catch(() => {});
          syncPresenceState();
        }
      });
  } catch {
    scheduleApply();
  }
}

window.addEventListener("sr:nickname-updated", () => {
  try {
    channel?.track?.({ user_id: USER_ID, name: currentUserName(), online_at: new Date().toISOString() });
  } catch {}
});

window.addEventListener("beforeunload", () => {
  try { channel?.untrack?.(); } catch {}
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    watchSupportDom();
    startPresence();
  }, { once: true });
} else {
  watchSupportDom();
  startPresence();
}
