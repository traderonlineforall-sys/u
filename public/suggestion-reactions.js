import { getStableUserId } from "./stable-user-identity.js";
import { supabase } from "./supabase-client.js";

/*
 * Suggestion reactions UI.
 * Scope: suggestion cards/rows only.
 * Cloudflare-friendly design:
 * - No Worker/API polling for reactions.
 * - Reads/writes suggestion_reactions directly through Supabase anon + RLS.
 * - Uses Supabase Realtime for live updates.
 * - Only refreshes on page focus/visibility or DOM changes, with debouncing.
 * Does not change SR data, header, search, menus, themes, or suggestion deletion behavior.
 */

const REACTIONS = [
  ["like", "👍", "أعجبني"],
  ["love", "❤️", "أحببته"],
  ["angry", "😡", "أغضبني"]
];

const TABLE = "suggestion_reactions";

let renderTimer = 0;
let loading = false;
let reactionState = Object.create(null);
let realtimeChannel = null;
let realtimeIdsKey = "";
let realtimeReady = false;
let lastLoadKey = "";
let lastLoadAt = 0;

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
  try { return String(getStableUserId() || "").trim(); } catch { return ""; }
}

function normalizeId(value){
  const s = String(value || "").trim();
  return /^\d+$/.test(s) ? s : "";
}

function normalizeReaction(value){
  const s = String(value || "").trim();
  return REACTIONS.some(([key]) => key === s) ? s : "";
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

function summarizeRows(rows = [], userId = getUserId()){
  const out = Object.create(null);
  rows.forEach((row) => {
    const sid = String(row?.suggestion_id || "");
    const reaction = normalizeReaction(row?.reaction);
    if (!sid || !reaction) return;
    if (!out[sid]) out[sid] = { counts: { like: 0, love: 0, angry: 0 }, mine: "" };
    out[sid].counts[reaction] = (out[sid].counts[reaction] || 0) + 1;
    if (userId && String(row?.user_id || "") === userId) out[sid].mine = reaction;
  });
  return out;
}

async function loadReactions(options = {}){
  if (loading) return;
  const ids = idsOnPage();
  if (!ids.length) return;

  const key = idsKey(ids);
  const now = Date.now();
  if (!options.force && key === lastLoadKey && now - lastLoadAt < 1200) {
    ensureRealtimeSubscription(ids);
    return;
  }

  loading = true;
  lastLoadKey = key;
  lastLoadAt = now;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("suggestion_id,user_id,reaction")
      .in("suggestion_id", ids.map(Number))
      .limit(5000);

    if (error) throw error;
    reactionState = summarizeRows(Array.isArray(data) ? data : []);
    renderAll();
    ensureRealtimeSubscription(ids);
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

function buildHtml(id){
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

function attachToContainer(item){
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
  host.innerHTML = buildHtml(id);
}

function renderAll(){
  findSuggestionContainers().forEach((item) => attachToContainer(item));
}

function applyOptimistic(id, reaction){
  const state = reactionState[id] || { counts: { like: 0, love: 0, angry: 0 }, mine: "" };
  const prev = state.mine || "";
  if (prev && state.counts[prev] > 0) state.counts[prev] -= 1;
  if (prev === reaction) {
    state.mine = "";
  } else {
    state.mine = reaction;
    state.counts[reaction] = (state.counts[reaction] || 0) + 1;
  }
  reactionState[id] = state;
  renderAll();
}

async function toggleReaction(btn){
  const id = normalizeId(btn?.dataset?.suggestionId || "");
  const reaction = normalizeReaction(btn?.dataset?.suggestionReaction || "");
  const userId = getUserId();
  if (!id || !reaction || !userId) return;

  btn.disabled = true;
  const current = myReaction(id);
  applyOptimistic(id, reaction);

  try {
    if (current === reaction) {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("suggestion_id", Number(id))
        .eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error: deleteError } = await supabase
        .from(TABLE)
        .delete()
        .eq("suggestion_id", Number(id))
        .eq("user_id", userId);
      if (deleteError) throw deleteError;
      const { error: insertError } = await supabase
        .from(TABLE)
        .insert({ suggestion_id: Number(id), user_id: userId, reaction });
      if (insertError) throw insertError;
    }
    scheduleLoad(250, { force: true });
  } catch {
    scheduleLoad(120, { force: true });
  }
}

function scheduleLoad(delay = 350, options = {}){
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => loadReactions(options), delay);
}

function ensureRealtimeSubscription(ids = idsOnPage()){
  const key = idsKey(ids);
  if (!key || realtimeIdsKey === key) return;
  realtimeIdsKey = key;
  realtimeReady = false;

  try {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  } catch {}
  realtimeChannel = null;

  try {
    const visible = new Set(ids.map(String));
    realtimeChannel = supabase
      .channel(`sr_suggestion_reactions_${key.replaceAll(",", "_")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, (payload) => {
        const sid = String(payload?.new?.suggestion_id || payload?.old?.suggestion_id || "");
        if (!sid || visible.has(sid)) scheduleLoad(80, { force: true });
      })
      .subscribe((status) => {
        realtimeReady = status === "SUBSCRIBED";
      });
  } catch {
    realtimeChannel = null;
    realtimeReady = false;
  }
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
      scheduleLoad(300);
      ensureRealtimeSubscription(idsOnPage());
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch {}

  window.addEventListener("focus", () => scheduleLoad(120, { force: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleLoad(120, { force: true });
  });
}

function boot(){
  bind();
  scheduleLoad();
  setTimeout(() => scheduleLoad(0, { force: true }), 1500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
