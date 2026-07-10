import { getStableUserId } from "./stable-user-identity.js";

/*
 * Support Presence/palette consumer.
 *
 * This module never opens a Realtime channel. It renders the single snapshot
 * owned by online-users-count.js and reacts to explicit Support DOM updates.
 */

const USER_ID = getStableUserId();
const SCHEME_COUNT = 12;
let presenceSnapshot = window.__srPresenceSnapshot || null;
let onlineIds = new Set(presenceSnapshot?.onlineUserIds || []);
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
    const id = String(row.getAttribute("data-sender-id") || "").trim();
    const name = getCleanText(row.querySelector(".support-msg-name"));
    const key = id || name;
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  });

  return keys;
}

function buildSchemeMap() {
  const keys = collectVisibleUserKeys();
  const assigned = new Map();
  const used = new Set();
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

function presenceStateForUser(id) {
  if (presenceSnapshot?.status !== "connected") return "unknown";
  return id && onlineIds.has(id) ? "online" : "offline";
}

function ensurePresenceBadge(anchor, state) {
  if (!anchor?.parentElement) return;
  let badge = anchor.parentElement.querySelector(":scope > .support-presence-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "support-presence-badge";
    anchor.insertAdjacentElement("afterend", badge);
  }

  const text = state === "online" ? "Online" : state === "offline" ? "Offline" : "Unknown";
  if (badge.textContent !== text) badge.textContent = text;
  badge.classList.toggle("is-online", state === "online");
  badge.classList.toggle("is-offline", state === "offline");
  badge.classList.toggle("is-unknown", state === "unknown");
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

let sortingSupportUsers = false;

function sortSupportUsersListByPresence() {
  const list = document.querySelector("#supportUsersList");
  if (!list || sortingSupportUsers) return;
  const rows = Array.from(list.querySelectorAll(".support-user"));
  if (rows.length < 2) return;

  const rowKey = (row) => row.getAttribute("data-user-id") || getCleanText(row.querySelector(".support-user-name")) || "";
  const originalOrder = rows.map(rowKey).join("\n");
  const normalizedName = (row) => getCleanText(row.querySelector(".support-user-name")).toLocaleLowerCase("ar-EG");
  const lastSeenValue = (row) => {
    const value = row.getAttribute("data-last-seen") || row.getAttribute("data-last-message-at") || row.getAttribute("data-created-at") || "";
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  };

  const sorted = rows.slice().sort((a, b) => {
    const aId = String(a.getAttribute("data-user-id") || "").trim();
    const bId = String(b.getAttribute("data-user-id") || "").trim();
    const aMe = aId === USER_ID;
    const bMe = bId === USER_ID;
    if (aMe !== bMe) return aMe ? -1 : 1;

    if (presenceSnapshot?.status === "connected") {
      const aOnline = !!aId && onlineIds.has(aId);
      const bOnline = !!bId && onlineIds.has(bId);
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
    }

    const aUnread = !!a.querySelector(".support-user-unread:not(:empty)");
    const bUnread = !!b.querySelector(".support-user-unread:not(:empty)");
    if (aUnread !== bUnread) return aUnread ? -1 : 1;

    const aSeen = lastSeenValue(a);
    const bSeen = lastSeenValue(b);
    if (aSeen !== bSeen) return bSeen - aSeen;
    return normalizedName(a).localeCompare(normalizedName(b), "ar", { sensitivity: "base", numeric: true });
  });

  if (sorted.map(rowKey).join("\n") === originalOrder) return;
  sortingSupportUsers = true;
  try {
    const fragment = document.createDocumentFragment();
    sorted.forEach((row) => fragment.appendChild(row));
    list.appendChild(fragment);
  } finally {
    sortingSupportUsers = false;
  }
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
    if (row.getAttribute("data-bubble-scheme") !== scheme) row.setAttribute("data-bubble-scheme", scheme);
    const state = presenceStateForUser(id);
    row.classList.toggle("is-online", state === "online");
    row.classList.toggle("is-offline", state === "offline");
    row.classList.toggle("is-presence-unknown", state === "unknown");
    ensurePresenceBadge(row.querySelector(".support-user-name"), state);
  });

  document.querySelectorAll("#supportMessagesList .support-msg").forEach((row) => {
    const name = getCleanText(row.querySelector(".support-msg-name"));
    const id = String(row.getAttribute("data-sender-id") || "").trim() || nameToId.get(name) || "";
    const key = id || name;
    const scheme = schemeMap.get(key) || schemeMap.get(name) || String(hashText(key || name) % SCHEME_COUNT);
    if (row.getAttribute("data-bubble-scheme") !== scheme) row.setAttribute("data-bubble-scheme", scheme);
    const state = presenceStateForUser(id);
    row.classList.toggle("is-online", state === "online");
    row.classList.toggle("is-offline", state === "offline");
    row.classList.toggle("is-presence-unknown", state === "unknown");
    ensurePresenceBadge(row.querySelector(".support-msg-name"), state);
  });

  sortSupportUsersListByPresence();
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(applySupportVisualState);
}

function acceptPresenceSnapshot(snapshot) {
  presenceSnapshot = snapshot || window.__srPresenceSnapshot || null;
  onlineIds = new Set(presenceSnapshot?.onlineUserIds || []);
  scheduleApply();
}

function init() {
  window.addEventListener("sr:presence-changed", (event) => acceptPresenceSnapshot(event.detail));
  window.addEventListener("sr:support-dom-changed", scheduleApply);
  window.addEventListener("sr:nickname-updated", scheduleApply);
  acceptPresenceSnapshot(window.__srPresenceSnapshot || null);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
