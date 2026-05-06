import { getStableUserId } from "./stable-user-identity.js";
import { supabase } from "./supabase-client.js";

/*
 * Suggestion picker reactions.
 * Scope: public Suggestions modal only.
 * UI rule: the face of the card/reply shows only the selected reaction summary + a small picker button.
 * The full reaction list opens only when the user clicks the picker button.
 */

const REACTIONS = [
  ["like", "👍", "أعجبني"],
  ["love", "❤️", "أحببته"],
  ["angry", "😡", "أغضبني"],
  ["laugh", "😂", "أضحكني"],
  ["sad", "😢", "أحزنني"],
  ["slipper", "🩴", "فردة شبشب"]
];
const REACTION_MAP = Object.fromEntries(REACTIONS.map(([key, icon, label]) => [key, { icon, label }]));
const API = "/api/suggestion-item-reactions";
const SUGGESTIONS_TABLE = "suggestions";
const REPLIES_TABLE = "suggestion_replies";
const REACTIONS_TABLE = "suggestion_item_reactions";

let suggestions = [];
let replies = [];
let state = Object.create(null);
let visibleItems = [];
let busy = false;
let timer = 0;
let realtimeChannel = null;
let realtimeKey = "";

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
function keyFor(type, id){ return `${type}:${id}`; }
function emptyCounts(){ return { like: 0, love: 0, angry: 0, laugh: 0, sad: 0, slipper: 0 }; }
function itemState(item){ return state[keyFor(item.type, item.id)] || { counts: emptyCounts(), mine: "" }; }

function ensureStyle(){
  if (document.getElementById("sr-suggestion-picker-reactions-style")) return;
  const style = document.createElement("style");
  style.id = "sr-suggestion-picker-reactions-style";
  style.textContent = `
    .sr-suggest-react-host{display:inline-flex!important;align-items:center!important;gap:6px!important;margin:6px 0!important;position:relative!important;vertical-align:middle!important;}
    .sr-suggest-react-current{display:inline-flex!important;align-items:center!important;gap:4px!important;border:1px solid rgba(255,255,255,.14)!important;background:rgba(255,255,255,.06)!important;border-radius:999px!important;padding:4px 8px!important;font-size:12px!important;font-weight:800!important;min-height:25px!important;}
    .sr-suggest-react-current.is-empty{opacity:.55!important;font-weight:700!important;}
    .sr-suggest-react-open{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:26px!important;height:26px!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.18)!important;background:rgba(255,255,255,.08)!important;color:inherit!important;cursor:pointer!important;font-weight:900!important;line-height:1!important;}
    .sr-suggest-react-open:hover{background:rgba(255,255,255,.14)!important;transform:translateY(-1px)!important;}
    .sr-suggest-react-menu{position:fixed!important;z-index:2147483000!important;display:none!important;align-items:center!important;gap:5px!important;padding:7px!important;border-radius:999px!important;background:rgba(18,18,22,.96)!important;border:1px solid rgba(255,255,255,.18)!important;box-shadow:0 14px 40px rgba(0,0,0,.35)!important;backdrop-filter:blur(12px)!important;}
    .sr-suggest-react-menu.is-open{display:flex!important;}
    .sr-suggest-react-choice{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:34px!important;height:34px!important;border-radius:999px!important;border:0!important;background:rgba(255,255,255,.08)!important;color:#fff!important;cursor:pointer!important;font-size:18px!important;line-height:1!important;}
    .sr-suggest-react-choice:hover{background:rgba(34,197,94,.22)!important;transform:translateY(-2px) scale(1.08)!important;}
    .sr-suggest-react-choice.is-active{background:rgba(34,197,94,.30)!important;outline:1px solid rgba(34,197,94,.75)!important;}
  `;
  document.head.appendChild(style);
}

function findSuggestionsModal(){
  const inputs = Array.from(document.querySelectorAll("textarea, input"));
  const input = inputs.find((el) => /write a suggestion|suggestion/i.test(String(el.getAttribute("placeholder") || "")) && isVisible(el));
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

async function loadSourceRows(){
  const [suggestionsRes, repliesRes] = await Promise.all([
    supabase.from(SUGGESTIONS_TABLE).select("id,text,created_at").order("created_at", { ascending: false }).limit(250),
    supabase.from(REPLIES_TABLE).select("id,suggestion_id,text,message,reply,content,body,created_at").order("created_at", { ascending: false }).limit(500)
  ]);
  if (!suggestionsRes.error) suggestions = Array.isArray(suggestionsRes.data) ? suggestionsRes.data : [];
  if (!repliesRes.error) replies = Array.isArray(repliesRes.data) ? repliesRes.data : [];
}

function findTextElement(modal, rawText, excludeSelector = ""){
  const body = norm(rawText);
  if (!modal || body.length < 2) return null;
  const nodes = Array.from(modal.querySelectorAll("div,p,span,li,article,section"));
  let best = null;
  let score = Infinity;
  for (const el of nodes) {
    if (!isVisible(el)) continue;
    if (excludeSelector && el.closest?.(excludeSelector)) continue;
    if (el.closest?.(".sr-suggest-react-host")) continue;
    if (el.querySelector?.("textarea,input")) continue;
    const text = norm(el.textContent || "");
    if (!text.includes(body)) continue;
    const extra = Math.max(0, text.length - body.length);
    const r = el.getBoundingClientRect();
    const s = extra * 25 + (r.width * r.height) / 120;
    if (s < score) { score = s; best = el; }
  }
  return best;
}
function climbToCard(el){
  if (!el) return null;
  let best = el;
  let cur = el;
  for (let i = 0; i < 6 && cur; i += 1, cur = cur.parentElement) {
    if (!(cur instanceof HTMLElement)) continue;
    if (Array.from(cur.querySelectorAll?.("button,a,[role='button']") || []).some((b) => /replies\s*\(\d+\)/i.test(String(b.textContent || "")))) return cur;
    const r = cur.getBoundingClientRect();
    if (r.width > 260 && r.height > 55) best = cur;
  }
  return best;
}
function findRepliesButton(card){
  return Array.from(card?.querySelectorAll?.("button,a,[role='button']") || []).find((b) => /replies\s*\(\d+\)/i.test(String(b.textContent || ""))) || null;
}
function textOfReply(row){
  return String(row?.text ?? row?.message ?? row?.reply ?? row?.content ?? row?.body ?? "").trim();
}

function buildVisibleItems(modal){
  const items = [];
  const seen = new Set();
  for (const row of suggestions) {
    const id = Number(row?.id);
    const text = String(row?.text || "").trim();
    if (!id || !text) continue;
    const textEl = findTextElement(modal, text);
    if (!textEl) continue;
    const card = climbToCard(textEl) || textEl;
    const anchor = findRepliesButton(card) || textEl;
    const key = keyFor("suggestion", id);
    if (!seen.has(key)) {
      seen.add(key);
      items.push({ type: "suggestion", id, el: card, textEl, anchor });
    }
  }
  for (const row of replies) {
    const id = Number(row?.id);
    const text = textOfReply(row);
    if (!id || !text) continue;
    const textEl = findTextElement(modal, text, ".sr-suggest-react-host");
    if (!textEl) continue;
    const key = keyFor("reply", id);
    if (!seen.has(key)) {
      seen.add(key);
      items.push({ type: "reply", id, el: textEl, textEl, anchor: textEl });
    }
  }
  return items;
}

async function loadReactionState(items){
  const targets = items.map((x) => ({ target_type: x.type, target_id: x.id }));
  if (!targets.length) return;
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "list", targets, user_id: uid() })
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data?.reactions && typeof data.reactions === "object") state = data.reactions;
}

function topReaction(counts){
  let bestKey = "";
  let bestCount = 0;
  for (const [key] of REACTIONS) {
    const n = Number(counts?.[key] || 0);
    if (n > bestCount) { bestKey = key; bestCount = n; }
  }
  return { key: bestKey, count: bestCount };
}
function hostHtml(item){
  const st = itemState(item);
  const mine = st.mine;
  const top = topReaction(st.counts || {});
  const displayKey = mine || top.key;
  const meta = displayKey ? REACTION_MAP[displayKey] : null;
  const count = displayKey ? Number(st.counts?.[displayKey] || 0) : 0;
  const current = meta
    ? `<span class="sr-suggest-react-current" title="${esc(meta.label)}"><span>${esc(meta.icon)}</span><span>${count || ""}</span></span>`
    : `<span class="sr-suggest-react-current is-empty">تفاعل</span>`;
  return `${current}<button type="button" class="sr-suggest-react-open" data-react-type="${esc(item.type)}" data-react-id="${esc(item.id)}" title="اختيار تفاعل">⌄</button>`;
}
function renderMenu(){
  let menu = document.getElementById("sr-suggest-react-menu");
  if (menu) return menu;
  menu = document.createElement("div");
  menu.id = "sr-suggest-react-menu";
  menu.className = "sr-suggest-react-menu";
  document.body.appendChild(menu);
  return menu;
}
function closeMenu(){
  const menu = document.getElementById("sr-suggest-react-menu");
  if (menu) menu.classList.remove("is-open");
}
function openMenu(button, item){
  const menu = renderMenu();
  const mine = itemState(item).mine;
  menu.innerHTML = REACTIONS.map(([key, icon, label]) => `<button type="button" class="sr-suggest-react-choice ${mine === key ? "is-active" : ""}" data-react-choice="${esc(key)}" data-react-type="${esc(item.type)}" data-react-id="${esc(item.id)}" title="${esc(label)}">${esc(icon)}</button>`).join("");
  const rect = button.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 260, rect.left - 112))}px`;
  menu.style.top = `${Math.max(8, rect.top - 46)}px`;
  menu.classList.add("is-open");
}
function attach(items){
  ensureStyle();
  for (const item of items) {
    const key = keyFor(item.type, item.id);
    let host = document.querySelector(`.sr-suggest-react-host[data-react-key="${cssEscape(key)}"]`);
    if (!host) {
      host = document.createElement("span");
      host.className = "sr-suggest-react-host";
      host.dataset.reactKey = key;
    }
    host.innerHTML = hostHtml(item);
    if (item.type === "suggestion" && item.anchor?.parentElement) {
      if (host.nextElementSibling !== item.anchor) item.anchor.parentElement.insertBefore(host, item.anchor);
    } else if (item.anchor?.parentElement) {
      if (host.previousElementSibling !== item.anchor) item.anchor.insertAdjacentElement("afterend", host);
    } else if (item.el) item.el.appendChild(host);
  }
}
async function refresh(){
  if (busy) return;
  const modal = findSuggestionsModal();
  if (!modal) return;
  busy = true;
  try {
    await loadSourceRows();
    visibleItems = buildVisibleItems(modal);
    await loadReactionState(visibleItems);
    attach(visibleItems);
    setupRealtime(visibleItems);
  } catch {
  } finally {
    busy = false;
  }
}
function schedule(delay = 350){
  clearTimeout(timer);
  timer = setTimeout(refresh, delay);
}
function itemFromDataset(ds){
  const type = String(ds?.reactType || "");
  const id = Number(ds?.reactId || 0);
  return visibleItems.find((x) => x.type === type && x.id === id) || (type && id ? { type, id } : null);
}
async function toggle(type, id, reaction){
  if (!uid()) return;
  const item = itemFromDataset({ reactType: type, reactId: id }) || { type, id };
  const key = keyFor(type, id);
  const prev = itemState(item);
  state[key] = { counts: { ...emptyCounts(), ...(prev.counts || {}) }, mine: prev.mine === reaction ? "" : reaction };
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
    attach(visibleItems);
    closeMenu();
    schedule(350);
  }
}
function setupRealtime(items){
  const key = items.map((x) => keyFor(x.type, x.id)).sort().join(",");
  if (!key || key === realtimeKey) return;
  realtimeKey = key;
  try { if (realtimeChannel) supabase.removeChannel(realtimeChannel); } catch {}
  try {
    realtimeChannel = supabase.channel(`sr_suggestion_item_reactions_${String(items.length)}_${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: REACTIONS_TABLE }, () => schedule(120))
      .subscribe();
  } catch {}
}
function bind(){
  document.addEventListener("click", (event) => {
    const open = event.target?.closest?.("button.sr-suggest-react-open");
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      const item = itemFromDataset(open.dataset);
      if (item) openMenu(open, item);
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
    const txt = String(event.target?.textContent || "");
    if (/suggestions|replies|add suggestion/i.test(txt) || event.target?.closest?.("[id*='suggestion' i], [class*='suggestion' i]")) {
      schedule(350);
      setTimeout(() => schedule(0), 900);
    }
  }, true);
  window.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu);
  window.addEventListener("focus", () => schedule(250));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(250); });
}
function boot(){ bind(); schedule(900); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
