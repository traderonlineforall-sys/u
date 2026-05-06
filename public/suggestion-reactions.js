import { getStableUserId } from "./stable-user-identity.js";
import { supabase } from "./supabase-client.js";

/*
 * Suggestion reactions UI.
 * Scope: suggestion cards/rows only. Does not change SR data, header, search,
 * menus, themes, or suggestion deletion behavior.
 */

const REACTIONS = [
  ["like", "👍", "أعجبني"],
  ["love", "❤️", "أحببته"],
  ["angry", "😡", "أغضبني"]
];

const POLL_MS = 6000;

let renderTimer = 0;
let loading = false;
let reactionState = Object.create(null);
let realtimeChannel = null;
let realtimeIdsKey = "";
let pollTimer = 0;

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

function getUserId(){
  try { return getStableUserId(); } catch { return ""; }
}

function normalizeId(value){
  const s = String(value || "").trim();
  return /^\d+$/.test(s) ? s : "";
}

function getSuggestionIdFromElement(el){
  if (!el) return "";
  const direct = normalizeId(el.dataset?.suggestionId || el.dataset?.suggestion_id || el.getAttribute?.("data-suggestion-id") || "");
  if (direct) return direct;

  const adminDelete = el.querySelector?.("button[data-action='delete-suggestion'][data-id]");
  const adminId = normalizeId(adminDelete?.getAttribute?.("data-id") || "");
  if (adminId) return adminId;

  const closest = el.closest?.("[data-suggestion-id],[data-suggestion_id]");
  if (closest && closest !== el) return getSuggestionIdFromElement(closest);
  return "";
}

function findSuggestionContainers(){
  const out = [];
  const seen = new Set();

  document.querySelectorAll("#adminTabSuggestions .admin-row").forEach((row) => {
    const id = getSuggestionIdFromElement(row);
    if (!id) return;
    const key = `admin:${id}:${out.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ el: row, id, mode: "admin" });
  });

  document.querySelectorAll("[data-suggestion-id], [data-suggestion_id]").forEach((el) => {
    if (el.closest?.("#adminTabSuggestions")) return;
    const id = getSuggestionIdFromElement(el);
    if (!id) return;
    const key = `public:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ el, id, mode: "public" });
  });

  return out;
}

function idsOnPage(){
  return Array.from(new Set(findSuggestionContainers().map((x) => x.id).filter(Boolean)));
}

function idsKey(ids = idsOnPage()){
  return ids.slice().sort((a, b) => Number(a) - Number(b)).join(",");
}

async function api(body){
  const res = await fetch("/api/suggestion-reactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, user_id: getUserId() })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

async function loadReactions(){
  if (loading) return;
  const ids = idsOnPage();
  if (!ids.length) return;
  loading = true;
  try {
    const data = await api({ action: "list", suggestion_ids: ids.map(Number) });
    if (data?.missing_table) {
      reactionState = Object.create(null);
      renderAll({ missingTable: true });
      return;
    }
    reactionState = data?.reactions && typeof data.reactions === "object" ? data.reactions : Object.create(null);
    renderAll();
    ensureRealtimeSubscription(ids);
    ensurePolling();
  } catch {
    // Keep the suggestions UI stable if reactions are temporarily unavailable.
  } finally {
    loading = false;
  }
}

function reactionCounts(id){
  const item = reactionState[String(id)] || {};
  return item.counts || { like: 0, love: 0, angry: 0 };
}

function myReaction(id){
  const item = reactionState[String(id)] || {};
  return String(item.mine || "");
}

function buildHtml(id, missingTable = false){
  if (missingTable) {
    return `<div class="sr-suggestion-reactions-disabled" style="font-size:12px;opacity:.68;margin-top:8px;">Suggestion reactions table is not configured yet.</div>`;
  }
  const counts = reactionCounts(id);
  const mine = myReaction(id);
  const buttons = REACTIONS.map(([key, icon, label]) => {
    const active = mine === key;
    return `
      <button type="button" class="sr-suggestion-reaction-btn" data-suggestion-reaction="${esc(key)}" data-suggestion-id="${esc(id)}" aria-pressed="${active ? "true" : "false"}" title="${esc(label)}" style="border:1px solid ${active ? "rgba(34,197,94,.85)" : "rgba(255,255,255,.18)"};border-radius:999px;padding:5px 9px;cursor:pointer;background:${active ? "rgba(34,197,94,.20)" : "rgba(255,255,255,.08)"};color:inherit;font-weight:800;display:inline-flex;align-items:center;gap:5px;line-height:1;transition:transform .12s ease, background .12s ease;">
        <span>${icon}</span><span style="font-size:12px;">${Number(counts[key] || 0)}</span>
      </button>
    `;
  }).join("");
  return `
    <div class="sr-suggestion-reactions" data-suggestion-reactions-for="${esc(id)}" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:9px;">
      <span style="font-size:12px;opacity:.75;font-weight:800;margin-inline-end:2px;">تفاعل:</span>
      ${buttons}
    </div>
  `;
}

function attachToContainer(item, options = {}){
  const { el, id, mode } = item;
  if (!el || !id) return;
  let host = el.querySelector?.(`.sr-suggestion-reactions-host[data-suggestion-reactions-host="${cssEscape(id)}"]`);
  if (!host) {
    host = document.createElement("div");
    host.className = "sr-suggestion-reactions-host";
    host.dataset.suggestionReactionsHost = id;
    const main = mode === "admin" ? el.querySelector(".admin-row-main") : el;
    (main || el).appendChild(host);
  }
  host.innerHTML = buildHtml(id, !!options.missingTable);
}

function renderAll(options = {}){
  findSuggestionContainers().forEach((item) => attachToContainer(item, options));
}

async function toggleReaction(btn){
  const id = normalizeId(btn?.dataset?.suggestionId || "");
  const reaction = String(btn?.dataset?.suggestionReaction || "").trim();
  if (!id || !REACTIONS.some(([key]) => key === reaction)) return;
  btn.disabled = true;
  try {
    const data = await api({ action: "toggle", suggestion_id: Number(id), reaction });
    if (data?.reactions && typeof data.reactions === "object") {
      reactionState[id] = data.reactions[id] || { counts: { like: 0, love: 0, angry: 0 }, mine: "" };
    }
    renderAll();
    setTimeout(scheduleLoad, 250);
  } catch {
    btn.disabled = false;
  }
}

function scheduleLoad(delay = 350){
  clearTimeout(renderTimer);
  renderTimer = setTimeout(loadReactions, delay);
}

function ensureRealtimeSubscription(ids = idsOnPage()){
  const key = idsKey(ids);
  if (!key || realtimeIdsKey === key) return;
  realtimeIdsKey = key;

  try {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  } catch {}
  realtimeChannel = null;

  try {
    const visible = new Set(ids.map(String));
    realtimeChannel = supabase
      .channel(`sr_suggestion_reactions_${key.replaceAll(",", "_")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "suggestion_reactions" }, (payload) => {
        const sid = String(payload?.new?.suggestion_id || payload?.old?.suggestion_id || "");
        if (!sid || visible.has(sid)) scheduleLoad(80);
      })
      .subscribe();
  } catch {
    realtimeChannel = null;
  }
}

function ensurePolling(){
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState === "hidden") return;
    if (!idsOnPage().length) return;
    loadReactions();
  }, POLL_MS);
}

function bind(){
  document.addEventListener("click", (event) => {
    const btn = event.target?.closest?.("button[data-suggestion-reaction]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    toggleReaction(btn);
  }, true);

  try {
    const observer = new MutationObserver(() => {
      scheduleLoad(250);
      ensureRealtimeSubscription(idsOnPage());
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch {}

  window.addEventListener("focus", () => scheduleLoad(120));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleLoad(120);
  });
}

function boot(){
  bind();
  scheduleLoad();
  setTimeout(scheduleLoad, 1500);
  ensurePolling();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
