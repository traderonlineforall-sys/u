import { getStableUserId } from "./stable-user-identity.js";
import { supabase } from "./supabase-client.js";

/*
 * Suggestion picker reactions.
 * Scope: public Suggestions modal only.
 * UX:
 * - Picker button sits beside the author name for every visible suggestion/reply.
 * - The face shows only reactions already selected by users.
 * - Hovering a visible reaction shows the user names that selected it.
 * - No full-page scan, no polling loop, no MutationObserver.
 */

const REACTIONS = [
  { key: "like", icon: "👍", label: "أعجبني", kind: "emoji" },
  { key: "love", icon: "❤️", label: "أحببته", kind: "emoji" },
  { key: "angry", icon: "😡", label: "أغضبني", kind: "emoji" },
  { key: "laugh", icon: "😂", label: "أضحكني", kind: "emoji" },
  { key: "sad", icon: "😢", label: "أحزنني", kind: "emoji" },
  { key: "slipper", icon: "/reactions/slipper-funny.png", label: "فردة شبشب", kind: "image" }
];
const REACTION_MAP = Object.fromEntries(REACTIONS.map((x) => [x.key, x]));
const API = "/api/suggestion-item-reactions";
const SUGGESTIONS_TABLE = "suggestions";
const REPLIES_TABLE = "suggestion_replies";
const REACTIONS_TABLE = "suggestion_item_reactions";
const SOURCE_CACHE_MS = 60000;

let suggestions = [];
let repliesBySuggestion = new Map();
let sourceLoadedAt = 0;
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
function norm(value = ""){
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function cssEscape(value = ""){
  try { return CSS.escape(String(value)); } catch { return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
}
function uid(){
  try { return String(getStableUserId() || "").trim(); } catch { return ""; }
}
function isVisible(el){
  try {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 8 && r.height > 8 && cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity || 1) !== 0;
  } catch { return false; }
}
function keyFor(type, id){ return `${type}:${Number(id)}`; }
function emptyCounts(){ return { like: 0, love: 0, angry: 0, laugh: 0, sad: 0, slipper: 0 }; }
function emptyUsers(){ return { like: [], love: [], angry: [], laugh: [], sad: [], slipper: [] }; }
function itemState(item){ return state[keyFor(item.type, item.id)] || { counts: emptyCounts(), mine: "", users: emptyUsers() }; }
function replyText(row){ return String(row?.text ?? row?.message ?? row?.reply ?? row?.content ?? row?.body ?? "").trim(); }
function reactionVisual(meta){
  if (!meta) return "";
  if (meta.kind === "image") return `<img class="sr-suggest-react-img" src="${esc(meta.icon)}" alt="${esc(meta.label)}" loading="lazy" decoding="async">`;
  return `<span class="sr-suggest-react-emoji">${esc(meta.icon)}</span>`;
}

function ensureStyle(){
  if (document.getElementById("sr-suggestion-picker-reactions-style")) return;
  const style = document.createElement("style");
  style.id = "sr-suggestion-picker-reactions-style";
  style.textContent = `
    .sr-suggest-react-host{display:inline-flex!important;align-items:center!important;gap:5px!important;margin-inline-start:7px!important;position:relative!important;vertical-align:middle!important;}
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
    .sr-suggest-react-img{width:20px!important;height:20px!important;object-fit:contain!important;border-radius:999px!important;display:inline-block!important;vertical-align:middle!important;filter:drop-shadow(0 1px 3px rgba(0,0,0,.28))!important;}
    .sr-suggest-react-choice .sr-suggest-react-img{width:29px!important;height:29px!important;}
    .sr-suggest-react-badge .sr-suggest-react-img{width:20px!important;height:20px!important;}
  `;
  document.head.appendChild(style);
}

function findSuggestionsModal(){
  const input = Array.from(document.querySelectorAll("textarea,input"))
    .find((el) => /write a suggestion|suggestion/i.test(String(el.getAttribute("placeholder") || "")) && isVisible(el));
  if (!input) return null;
  let best = null;
  let cur = input;
  for (let i = 0; i < 8 && cur; i += 1, cur = cur.parentElement) {
    if (!(cur instanceof HTMLElement) || !isVisible(cur)) continue;
    const text = norm(cur.textContent || "");
    if (text.includes("suggestions") && text.includes("add suggestion")) best = cur;
  }
  return best || input.closest("div,section,dialog");
}
function repliesButtons(modal){
  return Array.from(modal?.querySelectorAll?.("button,a,[role='button']") || [])
    .filter((b) => isVisible(b) && /replies\s*\(\d+\)/i.test(String(b.textContent || "")));
}
function cardForRepliesButton(btn){
  let best = btn.parentElement || btn;
  let cur = btn;
  for (let i = 0; i < 7 && cur; i += 1, cur = cur.parentElement) {
    if (!(cur instanceof HTMLElement) || !isVisible(cur)) continue;
    const text = norm(cur.textContent || "");
    const r = cur.getBoundingClientRect();
    if (text.length > 8 && r.width > 260 && r.height > 55) best = cur;
    if (cur.querySelector?.("textarea[placeholder*='reply' i], input[placeholder*='reply' i]")) return cur;
  }
  return best;
}
function findTextElement(scope, rawText){
  const body = norm(rawText);
  if (!scope || body.length < 2) return null;
  const nodes = Array.from(scope.querySelectorAll?.("div,p,span,li,article,section") || []);
  let best = null;
  let bestScore = Infinity;
  for (const el of nodes) {
    if (!isVisible(el)) continue;
    if (el.closest?.(".sr-suggest-react-host")) continue;
    if (el.querySelector?.("textarea,input")) continue;
    const text = norm(el.textContent || "");
    if (!text.includes(body)) continue;
    const extra = Math.max(0, text.length - body.length);
    const r = el.getBoundingClientRect();
    const score = extra * 20 + (r.width * r.height) / 160;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}
function matchSuggestion(card){
  const text = norm(card?.textContent || "");
  let best = null;
  let bestLen = 0;
  for (const row of suggestions) {
    const body = norm(row?.text || "");
    const id = Number(row?.id || 0);
    if (!id || body.length < 2) continue;
    if (text.includes(body) && body.length > bestLen) {
      best = { id, text: row.text || "" };
      bestLen = body.length;
    }
  }
  return best;
}
function findAuthorLine(root, textEl){
  const candidates = [];
  const tr = textEl?.getBoundingClientRect?.();
  const nodes = Array.from(root?.querySelectorAll?.("div,span,p,a,strong,b") || []);
  for (const el of nodes) {
    if (!isVisible(el) || el.closest?.(".sr-suggest-react-host")) continue;
    const t = String(el.textContent || "").trim();
    if (!/User[-\s]*\d+/i.test(t)) continue;
    const nt = norm(t);
    if (nt.includes("replies") || nt.length > 120) continue;
    const r = el.getBoundingClientRect();
    const distance = tr ? Math.abs(r.bottom - tr.top) + (r.top > tr.top ? 2000 : 0) : 0;
    candidates.push({ el, score: distance + nt.length + (r.width * r.height) / 2500 });
  }
  candidates.sort((a,b) => a.score - b.score);
  return candidates[0]?.el || null;
}

async function loadSourceRows(force = false){
  const now = Date.now();
  if (!force && suggestions.length && now - sourceLoadedAt < SOURCE_CACHE_MS) return;
  const [sRes, rRes] = await Promise.all([
    supabase.from(SUGGESTIONS_TABLE).select("id,text,created_at").order("created_at", { ascending: false }).limit(250),
    supabase.from(REPLIES_TABLE).select("id,suggestion_id,text,message,reply,content,body,created_at").order("created_at", { ascending: false }).limit(500)
  ]);
  if (!sRes.error) suggestions = Array.isArray(sRes.data) ? sRes.data : [];
  repliesBySuggestion = new Map();
  if (!rRes.error && Array.isArray(rRes.data)) {
    for (const row of rRes.data) {
      const sid = Number(row?.suggestion_id || 0);
      if (!sid) continue;
      if (!repliesBySuggestion.has(sid)) repliesBySuggestion.set(sid, []);
      repliesBySuggestion.get(sid).push(row);
    }
  }
  sourceLoadedAt = now;
}
function visibleItemsFromModal(modal){
  const out = [];
  const seen = new Set();
  for (const btn of repliesButtons(modal)) {
    const card = cardForRepliesButton(btn);
    const suggestion = matchSuggestion(card);
    if (!suggestion) continue;
    const mainTextEl = findTextElement(card, suggestion.text) || btn;
    const sKey = keyFor("suggestion", suggestion.id);
    if (!seen.has(sKey)) {
      seen.add(sKey);
      const author = findAuthorLine(card, mainTextEl) || mainTextEl;
      out.push({ type: "suggestion", id: suggestion.id, anchor: author, fallbackAnchor: btn, container: author.parentElement || card });
    }
    for (const reply of repliesBySuggestion.get(suggestion.id) || []) {
      const rid = Number(reply?.id || 0);
      const text = replyText(reply);
      if (!rid || !text) continue;
      const replyTextEl = findTextElement(card, text);
      if (!replyTextEl) continue;
      const rKey = keyFor("reply", rid);
      if (seen.has(rKey)) continue;
      seen.add(rKey);
      const author = findAuthorLine(card, replyTextEl) || replyTextEl;
      out.push({ type: "reply", id: rid, anchor: author, fallbackAnchor: replyTextEl, container: author.parentElement || card });
    }
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
  const active = REACTIONS.filter((r) => Number(counts[r.key] || 0) > 0);
  if (!active.length) return "";
  return `<span class="sr-suggest-react-summary">${active.map((meta) => {
    const mineCls = st.mine === meta.key ? " is-mine" : "";
    const n = Number(counts[meta.key] || 0);
    const names = (users[meta.key] || []).slice(0, 12).join("، ") || meta.label;
    return `<span class="sr-suggest-react-badge${mineCls}" title="${esc(names)}">${reactionVisual(meta)}<span>${n}</span></span>`;
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
    let host = document.querySelector(`.sr-suggest-react-host[data-react-key="${cssEscape(key)}"]`);
    if (!host) {
      host = document.createElement("span");
      host.className = "sr-suggest-react-host";
      host.dataset.reactKey = key;
    }
    const html = hostHtml(item);
    if (host.innerHTML !== html) host.innerHTML = html;
    if (item.anchor) {
      const target = item.anchor;
      if (host.parentElement !== target) target.appendChild(host);
    } else if (item.fallbackAnchor?.parentElement) {
      if (host.previousElementSibling !== item.fallbackAnchor) item.fallbackAnchor.insertAdjacentElement("afterend", host);
    } else if (item.container && host.parentElement !== item.container) {
      item.container.appendChild(host);
    }
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
  menu.innerHTML = REACTIONS.map((meta) => `<button type="button" class="sr-suggest-react-choice ${mine === meta.key ? "is-active" : ""}" data-react-choice="${esc(meta.key)}" data-react-type="${esc(item.type)}" data-react-id="${esc(item.id)}" title="${esc(meta.label)}">${reactionVisual(meta)}</button>`).join("");
  const r = btn.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 250, r.left - 105))}px`;
  menu.style.top = `${Math.max(8, r.top - 46)}px`;
  menu.classList.add("is-open");
}
async function refresh(options = {}){
  if (busy) return;
  const modal = findSuggestionsModal();
  if (!modal) return;
  busy = true;
  try {
    await loadSourceRows(!!options.forceSource);
    visibleItems = visibleItemsFromModal(modal);
    await loadState(visibleItems, !!options.forceState);
    attach(visibleItems);
    setupRealtime(visibleItems);
  } catch {
  } finally {
    busy = false;
  }
}
function schedule(delay = 320, options = {}){
  clearTimeout(timer);
  timer = setTimeout(() => refresh(options), delay);
}
async function toggle(type, id, reaction){
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
    schedule(220, { forceState: true });
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
        schedule(180, { forceState: true });
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
    const text = String(event.target?.textContent || "");
    if (/suggestions|replies|add suggestion/i.test(text) || event.target?.closest?.("[id*='suggestion' i], [class*='suggestion' i]")) {
      schedule(360, { forceSource: false });
      setTimeout(() => schedule(0, { forceSource: false }), 900);
    }
  }, true);
  window.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu);
  window.addEventListener("focus", () => schedule(300, { forceState: true }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(300, { forceState: true }); });
}
function boot(){ bind(); schedule(900, { forceSource: true, forceState: true }); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
