import { getStableUserId } from "./stable-user-identity.js";
import { supabase } from "./supabase-client.js";

/*
 * Suggestion reactions UI.
 * Scope: suggestion cards/rows only.
 * Cloudflare-friendly design:
 * - No polling against Cloudflare.
 * - Reaction counts are read directly from Supabase.
 * - Live updates use Supabase Realtime.
 * - Writes use the existing /api/suggestion-reactions endpoint only when the user clicks a reaction.
 * - Public suggestion cards are detected even if the original renderer did not add data-suggestion-id.
 * Does not change SR data, header, search, menus, themes, or suggestion deletion behavior.
 */

const REACTIONS = [
  ["like", "👍", "أعجبني"],
  ["love", "❤️", "أحببته"],
  ["angry", "😡", "أغضبني"]
];

const REACTIONS_TABLE = "suggestion_reactions";
const SUGGESTIONS_TABLE = "suggestions";

let renderTimer = 0;
let loading = false;
let reactionState = Object.create(null);
let realtimeChannel = null;
let realtimeIdsKey = "";
let suggestionsCache = [];
let suggestionsLoadedAt = 0;
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

function normalizeText(value = ""){
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function loadSuggestionsForMatching(force = false){
  const now = Date.now();
  if (!force && suggestionsCache.length && now - suggestionsLoadedAt < 45000) return;
  try {
    const { data, error } = await supabase
      .from(SUGGESTIONS_TABLE)
      .select("id,text,user_id,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    suggestionsCache = Array.isArray(data) ? data : [];
    suggestionsLoadedAt = now;
  } catch {
    suggestionsCache = [];
    suggestionsLoadedAt = now;
  }
}

function matchSuggestionIdFromText(text){
  const hay = normalizeText(text);
  if (!hay || !suggestionsCache.length) return "";
  let best = null;
  let bestLen = 0;
  for (const row of suggestionsCache) {
    const id = normalizeId(row?.id);
    const body = normalizeText(row?.text || "");
    if (!id || !body || body.length < 2) continue;
    if (hay.includes(body) && body.length > bestLen) {
      best = row;
      bestLen = body.length;
    }
  }
  return best ? normalizeId(best.id) : "";
}

function getSuggestionIdFromElement(el){
  if (!el) return "";
  const direct = normalizeId(el.dataset?.suggestionId || el.dataset?.suggestion_id || el.getAttribute?.("data-suggestion-id") || "");
  if (direct) return direct;

  const adminDelete = el.querySelector?.("button[data-action='delete-suggestion'][data-id]");
  const adminId = normalizeId(adminDelete?.getAttribute?.("data-id") || "");
  if (adminId) return adminId;

  const matched = matchSuggestionIdFromText(el.textContent || "");
  if (matched) {
    try { el.dataset.suggestionId = matched; } catch {}
    return matched;
  }

  const closest = el.closest?.("[data-suggestion-id],[data-suggestion_id]");
  if (closest && closest !== el) return getSuggestionIdFromElement(closest);
  return "";
}

function findPublicSuggestionCardFromRepliesButton(btn){
  if (!btn) return null;
  let best = null;
  let el = btn;
  for (let i = 0; i < 8 && el; i += 1, el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    const text = normalizeText(el.textContent || "");
    if (!text || text.length < 8) continue;
    const hasReplyBox = !!el.querySelector?.("textarea[placeholder*='reply' i], input[placeholder*='reply' i]");
    const hasSuggestion = !!matchSuggestionIdFromText(text);
    if (hasSuggestion) best = el;
    if (hasSuggestion && hasReplyBox) return el;
  }
  return best;
}

function findSuggestionContainers(){
  const out = [];
  const seen = new Set();

  function push(el, id, mode, anchor = null){
    id = normalizeId(id);
    if (!el || !id) return;
    const key = `${mode}:${id}:${anchor ? "anchor" : "card"}:${out.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ el, id, mode, anchor });
  }

  document.querySelectorAll("#adminTabSuggestions .admin-row").forEach((row) => {
    const id = getSuggestionIdFromElement(row);
    if (id) push(row, id, "admin");
  });

  document.querySelectorAll("[data-suggestion-id], [data-suggestion_id]").forEach((el) => {
    if (el.closest?.("#adminTabSuggestions")) return;
    const id = getSuggestionIdFromElement(el);
    if (id) push(el, id, "public");
  });

  // Fallback for the current Suggestions modal renderer: it shows a Replies(n) button
  // but does not expose data-suggestion-id on the card.
  document.querySelectorAll("button, a, [role='button']").forEach((btn) => {
    const label = normalizeText(btn.textContent || "");
    if (!/replies\s*\(\d+\)/i.test(label)) return;
    const card = findPublicSuggestionCardFromRepliesButton(btn);
    const id = getSuggestionIdFromElement(card);
    if (card && id) push(card, id, "public-replies", btn);
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
  loading = true;
  try {
    await loadSuggestionsForMatching(!!options.forceSuggestions);
    const ids = idsOnPage();
    if (!ids.length) {
      renderAll();
      return;
    }

    const key = idsKey(ids);
    const now = Date.now();
    if (!options.force && key === lastLoadKey && now - lastLoadAt < 1200) {
      ensureRealtimeSubscription(ids);
      renderAll();
      return;
    }

    lastLoadKey = key;
    lastLoadAt = now;
    const { data, error } = await supabase
      .from(REACTIONS_TABLE)
      .select("suggestion_id,user_id,reaction")
      .in("suggestion_id", ids.map(Number))
      .limit(5000);

    if (error) throw error;
    reactionState = summarizeRows(Array.isArray(data) ? data : []);
    renderAll();
    ensureRealtimeSubscription(ids);
  } catch {
    renderAll();
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
  const { el, id, mode, anchor } = item;
  if (!el || !id) return;
  let host = el.querySelector?.(`.sr-suggestion-reactions-host[data-suggestion-reactions-host="${cssEscape(id)}"]`);
  if (!host) {
    host = document.createElement("div");
    host.className = "sr-suggestion-reactions-host";
    host.dataset.suggestionReactionsHost = id;
    host.style.marginTop = "8px";

    if (anchor && anchor.parentElement) {
      anchor.insertAdjacentElement("afterend", host);
    } else {
      const main = mode === "admin" ? el.querySelector(".admin-row-main") : el;
      (main || el).appendChild(host);
    }
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

async function apiToggle(id, reaction){
  const res = await fetch("/api/suggestion-reactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "toggle", suggestion_id: Number(id), reaction, user_id: getUserId() })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Reaction failed");
  return data;
}

async function toggleReaction(btn){
  const id = normalizeId(btn?.dataset?.suggestionId || "");
  const reaction = normalizeReaction(btn?.dataset?.suggestionReaction || "");
  if (!id || !reaction || !getUserId()) return;

  btn.disabled = true;
  applyOptimistic(id, reaction);

  try {
    const data = await apiToggle(id, reaction);
    if (data?.reactions && typeof data.reactions === "object") {
      reactionState[id] = data.reactions[id] || { counts: { like: 0, love: 0, angry: 0 }, mine: "" };
      renderAll();
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

  try {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  } catch {}
  realtimeChannel = null;

  try {
    const visible = new Set(ids.map(String));
    realtimeChannel = supabase
      .channel(`sr_suggestion_reactions_${key.replaceAll(",", "_")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: REACTIONS_TABLE }, (payload) => {
        const sid = String(payload?.new?.suggestion_id || payload?.old?.suggestion_id || "");
        if (!sid || visible.has(sid)) scheduleLoad(80, { force: true });
      })
      .subscribe();
  } catch {
    realtimeChannel = null;
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

  window.addEventListener("focus", () => scheduleLoad(120, { force: true, forceSuggestions: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleLoad(120, { force: true, forceSuggestions: true });
  });
}

function boot(){
  bind();
  scheduleLoad(100, { force: true, forceSuggestions: true });
  setTimeout(() => scheduleLoad(0, { force: true, forceSuggestions: true }), 1500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
