import { getStableUserId } from "./stable-user-identity.js";
import { supabase } from "./supabase-client.js";

/*
 * Suggestion picker reactions.
 * Scope: Suggestions modal only.
 * Depends on anchors rendered by public/suggestions.js:
 *   .sr-suggest-react-anchor[data-reaction-target-type][data-reaction-target-id]
 * This avoids text matching and makes every new suggestion/reply get its own reaction picker.
 */

const REACTIONS = [
  { key: "like", icon: "👍", label: "أعجبني" },
  { key: "love", icon: "❤️", label: "أحببته" },
  { key: "angry", icon: "😡", label: "أغضبني" },
  { key: "laugh", icon: "😂", label: "أضحكني" },
  { key: "sad", icon: "😢", label: "أحزنني" },
  { key: "slipper", icon: "👎", label: "لم يعجبني" }
];
const REACTION_MAP = Object.fromEntries(REACTIONS.map((x) => [x.key, x]));
const API = "/api/suggestion-item-reactions";
const REACTIONS_TABLE = "suggestion_item_reactions";

let state = Object.create(null);
let visibleItems = [];
let busy = false;
let timer = 0;
let realtimeChannel = null;
let realtimeKey = "";
let lastTargetsKey = "";

function esc(value = ""){
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function cssEscape(value = ""){
  try { return CSS.escape(String(value)); } catch { return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
}
function uid(){
  try { return String(getStableUserId() || "").trim(); } catch { return ""; }
}
function keyFor(type, id){ return `${type}:${Number(id)}`; }
function emptyCounts(){ return { like: 0, love: 0, angry: 0, laugh: 0, sad: 0, slipper: 0 }; }
function emptyUsers(){ return { like: [], love: [], angry: [], laugh: [], sad: [], slipper: [] }; }
function itemState(item){ return state[keyFor(item.type, item.id)] || { counts: emptyCounts(), mine: "", users: emptyUsers() }; }
function validType(value){ return value === "suggestion" || value === "reply" ? value : ""; }
function validId(value){ const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
function validReaction(value){ return REACTIONS.some((x) => x.key === value) ? value : ""; }

function ensureStyle(){
  if (document.getElementById("sr-suggestion-picker-reactions-style")) return;
  const style = document.createElement("style");
  style.id = "sr-suggestion-picker-reactions-style";
  style.textContent = `
    .sr-suggest-react-anchor{display:inline-flex!important;align-items:center!important;vertical-align:middle!important;margin-inline-start:7px!important;}
    .sr-suggest-react-host{display:inline-flex!important;align-items:center!important;gap:5px!important;position:relative!important;vertical-align:middle!important;}
    .sr-suggest-react-summary{display:inline-flex!important;align-items:center!important;gap:5px!important;border:1px solid rgba(255,255,255,.14)!important;background:rgba(255,255,255,.06)!important;border-radius:999px!important;padding:3px 7px!important;font-size:12px!important;font-weight:800!important;min-height:23px!important;}
    .sr-suggest-react-badge{display:inline-flex!important;align-items:center!important;gap:2px!important;cursor:help!important;}
    .sr-suggest-react-badge.is-mine{filter:drop-shadow(0 0 6px rgba(34,197,94,.55))!important;}
    .sr-suggest-react-open{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:23px!important;height:23px!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.18)!important;background:rgba(255,255,255,.08)!important;color:inherit!important;cursor:pointer!important;font-weight:900!important;line-height:1!important;padding:0!important;}
    .sr-suggest-react-open:hover{background:rgba(255,255,255,.14)!important;transform:translateY(-1px)!important;}
    .sr-suggest-react-menu{position:fixed!important;z-index:2147483000!important;display:none!important;align-items:center!important;gap:5px!important;padding:7px!important;border-radius:999px!important;background:rgba(18,18,22,.96)!important;border:1px solid rgba(255,255,255,.18)!important;box-shadow:0 14px 40px rgba(0,0,0,.35)!important;backdrop-filter:blur(12px)!important;}
    .sr-suggest-react-menu.is-open{display:flex!important;}
    .sr-suggest-react-choice{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:34px!important;height:34px!important;border-radius:999px!important;border:0!important;background:rgba(255,255,255,.08)!important;color:#fff!important;cursor:pointer!important;font-size:18px!important;line-height:1!important;}
    .sr-suggest-react-choice:hover{background:rgba(34,197,94,.22)!important;transform:translateY(-2px) scale(1.08)!important;}
    .sr-suggest-react-choice.is-active{background:rgba(34,197,94,.30)!important;outline:1px solid rgba(34,197,94,.75)!important;}
  `;
  document.head.appendChild(style);
}
function anchors(){
  return Array.from(document.querySelectorAll(".sr-suggest-react-anchor[data-reaction-target-type][data-reaction-target-id]")).filter((el) => {
    const type = validType(el.dataset.reactionTargetType || "");
    const id = validId(el.dataset.reactionTargetId || "");
    return !!type && !!id;
  });
}
function collectItems(){
  const out = [];
  const seen = new Set();
  for (const anchor of anchors()) {
    const type = validType(anchor.dataset.reactionTargetType || "");
    const id = validId(anchor.dataset.reactionTargetId || "");
    const key = keyFor(type, id);
    if (!type || !id || seen.has(key)) continue;
    seen.add(key);
    out.push({ type, id, anchor });
  }
  return out;
}
function targetsKey(items){ return items.map((x) => keyFor(x.type, x.id)).sort().join(","); }
async function loadState(items, force = false){
  const key = targetsKey(items);
  if (!force && key && key === lastTargetsKey && Object.keys(state).length) return;
  lastTargetsKey = key;
  if (!items.length) return;
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "list", targets: items.map((x) => ({ target_type: x.type, target_id: x.id })), user_id: uid() })
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data?.reactions && typeof data.reactions === "object") state = data.reactions;
}
function selectedSummaryHtml(item){
  const st = itemState(item);
  const counts = { ...emptyCounts(), ...(st.counts || {}) };
  const users = { ...emptyUsers(), ...(st.users || {}) };
  const active = REACTIONS.filter((meta) => Number(counts[meta.key] || 0) > 0);
  if (!active.length) return "";
  return `<span class="sr-suggest-react-summary">${active.map((meta) => {
    const mineCls = st.mine === meta.key ? " is-mine" : "";
    const n = Number(counts[meta.key] || 0);
    const names = (users[meta.key] || []).slice(0, 12).join("، ") || meta.label;
    return `<span class="sr-suggest-react-badge${mineCls}" title="${esc(names)}"><span>${esc(meta.icon)}</span><span>${n}</span></span>`;
  }).join("")}</span>`;
}
function hostHtml(item){
  return `${selectedSummaryHtml(item)}<button type="button" class="sr-suggest-react-open" data-react-type="${esc(item.type)}" data-react-id="${esc(item.id)}" title="اختيار تفاعل">⌄</button>`;
}
function attach(items){
  ensureStyle();
  const activeKeys = new Set(items.map((item) => keyFor(item.type, item.id)));
  document.querySelectorAll(".sr-suggest-react-host[data-react-key]").forEach((host) => {
    if (!activeKeys.has(host.dataset.reactKey || "")) host.remove();
  });
  for (const item of items) {
    const key = keyFor(item.type, item.id);
    let host = item.anchor.querySelector(`.sr-suggest-react-host[data-react-key="${cssEscape(key)}"]`);
    if (!host) {
      host = document.createElement("span");
      host.className = "sr-suggest-react-host";
      host.dataset.reactKey = key;
      item.anchor.appendChild(host);
    }
    const html = hostHtml(item);
    if (host.innerHTML !== html) host.innerHTML = html;
  }
}
function menuElement(){
  let menu = document.getElementById("sr-suggest-react-menu");
  if (menu) return menu;
  menu = document.createElement("div");
  menu.id = "sr-suggest-react-menu";
  menu.className = "sr-suggest-react-menu";
  document.body.appendChild(menu);
  return menu;
}
function closeMenu(){ document.getElementById("sr-suggest-react-menu")?.classList.remove("is-open"); }
function itemFrom(type, id){ return visibleItems.find((x) => x.type === type && Number(x.id) === Number(id)) || { type, id: Number(id) }; }
function openMenu(btn, item){
  const menu = menuElement();
  const mine = itemState(item).mine;
  menu.innerHTML = REACTIONS.map((meta) => `<button type="button" class="sr-suggest-react-choice ${mine === meta.key ? "is-active" : ""}" data-react-choice="${esc(meta.key)}" data-react-type="${esc(item.type)}" data-react-id="${esc(item.id)}" title="${esc(meta.label)}">${esc(meta.icon)}</button>`).join("");
  const r = btn.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 250, r.left - 105))}px`;
  menu.style.top = `${Math.max(8, r.top - 46)}px`;
  menu.classList.add("is-open");
}
async function refresh(options = {}){
  if (busy) return;
  busy = true;
  try {
    visibleItems = collectItems();
    await loadState(visibleItems, !!options.forceState);
    attach(visibleItems);
    setupRealtime(visibleItems);
  } catch {
  } finally {
    busy = false;
  }
}
function schedule(delay = 180, options = {}){
  clearTimeout(timer);
  timer = setTimeout(() => refresh(options), delay);
}
async function toggle(type, id, reaction){
  reaction = validReaction(reaction);
  if (!uid() || !type || !id || !reaction) return;
  const item = itemFrom(type, id);
  const key = keyFor(type, id);
  const prev = itemState(item);
  const counts = { ...emptyCounts(), ...(prev.counts || {}) };
  if (prev.mine && counts[prev.mine] > 0) counts[prev.mine] -= 1;
  const mine = prev.mine === reaction ? "" : reaction;
  if (mine) counts[mine] = (counts[mine] || 0) + 1;
  state[key] = { counts, mine, users: prev.users || emptyUsers() };
  attach(visibleItems);
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "toggle", target_type: type, target_id: Number(id), reaction, user_id: uid() })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.reactions?.[key]) state[key] = data.reactions[key];
  } finally {
    closeMenu();
    attach(visibleItems);
    lastTargetsKey = "";
    schedule(160, { forceState: true });
  }
}
function setupRealtime(items){
  const key = targetsKey(items);
  if (!key || key === realtimeKey) return;
  realtimeKey = key;
  try { if (realtimeChannel) supabase.removeChannel(realtimeChannel); } catch {}
  try {
    realtimeChannel = supabase.channel(`sr_suggestion_item_reactions_${items.length}`)
      .on("postgres_changes", { event: "*", schema: "public", table: REACTIONS_TABLE }, () => {
        lastTargetsKey = "";
        schedule(140, { forceState: true });
      })
      .subscribe();
  } catch {}
}
function bind(){
  document.addEventListener("click", (event) => {
    const openBtn = event.target?.closest?.("button.sr-suggest-react-open");
    if (openBtn) {
      event.preventDefault();
      event.stopPropagation();
      openMenu(openBtn, itemFrom(String(openBtn.dataset.reactType || ""), Number(openBtn.dataset.reactId || 0)));
      return;
    }
    const choice = event.target?.closest?.("button.sr-suggest-react-choice");
    if (choice) {
      event.preventDefault();
      event.stopPropagation();
      toggle(String(choice.dataset.reactType || ""), Number(choice.dataset.reactId || 0), String(choice.dataset.reactChoice || ""));
      return;
    }
    if (!event.target?.closest?.("#sr-suggest-react-menu")) closeMenu();
  }, true);
  window.addEventListener("sr:suggestions-rendered", () => schedule(60, { forceState: true }));
  window.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu);
  window.addEventListener("focus", () => schedule(180, { forceState: true }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(180, { forceState: true }); });
}
function boot(){ bind(); schedule(700, { forceState: true }); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
