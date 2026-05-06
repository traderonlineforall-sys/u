import { getStableUserId } from "./stable-user-identity.js";
import { supabase } from "./supabase-client.js";

/*
 * Suggestion reactions UI.
 * Scope: suggestion cards/rows only.
 * Cloudflare-friendly design:
 * - No polling against Cloudflare.
 * - Reaction counts are read directly from Supabase.
 * - Live updates use Supabase Realtime.
 * - Writes use /api/suggestion-reactions only when the user clicks a reaction.
 * - Public suggestion cards are detected even if the original renderer did not add data-suggestion-id.
 * Does not change SR data, header, search, menus, themes, or suggestion deletion behavior.
 */

const REACTIONS = [
  ["like", "👍", "أعجبني"],
  ["love", "❤️", "أحببته"],
  ["angry", "😡", "أغضبني"],
  ["laugh", "😂", "أضحكني"],
  ["sad", "😢", "أحزنني"],
  ["slipper", "🩴", "فردة شبشب"]
];

const REACTIONS_TABLE = "suggestion_reactions";
const SUGGESTIONS_TABLE = "suggestions";
const ALL_REACTION_KEYS = REACTIONS.map(([key]) => key);

let renderTimer = 0;
let loading = false;
let reactionState = Object.create(null);
let realtimeChannel = null;
let realtimeIdsKey = "";
let suggestionsCache = [];
let suggestionsLoadedAt = 0;
let lastLoadKey = "";
let lastLoadAt = 0;
const renderedHtmlById = new Map();

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
  return ALL_REACTION_KEYS.includes(s) ? s : "";
}

function emptyCounts(){
  return { like: 0, love: 0, angry: 0, laugh: 0, sad: 0, slipper: 0 };
}

function normalizeText(value = ""){
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isVisibleElement(el){
  try {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 8 && r.height > 6 && cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity || 1) !== 0;
  } catch {
    return false;
  }
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

function isRepliesButton(el){
  const label = normalizeText(el?.textContent || "");
  return /replies\s*\(\d+\)/i.test(label);
}

function findRepliesButtonIn(el){
  if (!el?.querySelectorAll) return null;
  return Array.from(el.querySelectorAll("button, a, [role='button']")).find(isRepliesButton) || null;
}

function findSuggestionBodyElement(row){
  const id = normalizeId(row?.id);
  const body = normalizeText(row?.text || "");
  if (!id || !body) return null;

  const direct = document.querySelector(`[data-suggestion-id="${cssEscape(id)}"], [data-suggestion_id="${cssEscape(id)}"]`);
  if (direct && isVisibleElement(direct)) return direct;

  const candidates = [];
  const roots = Array.from(document.querySelectorAll("[id*='suggestion' i], [class*='suggestion' i]")).filter(isVisibleElement);
  const searchRoots = roots.length ? roots : [document.body || document.documentElement];

  for (const root of searchRoots) {
    const nodes = root.querySelectorAll?.("div, p, span, li, article, section, main") || [];
    for (const el of nodes) {
      if (!isVisibleElement(el)) continue;
      if (el.closest?.(".sr-suggestion-reactions-host")) continue;
      const tag = String(el.tagName || "").toLowerCase();
      if (["script", "style", "textarea", "input", "button", "a"].includes(tag)) continue;
      const text = normalizeText(el.textContent || "");
      if (!text || !text.includes(body)) continue;

      const r = el.getBoundingClientRect();
      const extra = Math.max(0, text.length - body.length);
      const hasReplies = !!findRepliesButtonIn(el);
      const hasReplyBox = !!el.querySelector?.("textarea[placeholder*='reply' i], input[placeholder*='reply' i]");
      const area = Math.max(1, r.width * r.height);
      const score = (hasReplies ? 0 : 8000) + (hasReplyBox ? 0 : 1000) + extra * 8 + Math.min(area / 100, 5000);
      candidates.push({ el, score, hasReplies, hasReplyBox });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.el || null;
}

function climbToSuggestionCard(el){
  if (!el) return null;
  let best = el;
  let cur = el;
  for (let i = 0; i < 7 && cur; i += 1, cur = cur.parentElement) {
    if (!(cur instanceof HTMLElement)) continue;
    const replies = findRepliesButtonIn(cur);
    const replyBox = cur.querySelector?.("textarea[placeholder*='reply' i], input[placeholder*='reply' i]");
    if (replies || replyBox) {
      best = cur;
      break;
    }
    const r = cur.getBoundingClientRect();
    if (r.width >= 260 && r.height >= 60) best = cur;
  }
  return best;
}

function findSuggestionContainers(){
  const out = [];
  const seen = new Set();

  function push(el, id, mode, anchor = null, textEl = null){
    id = normalizeId(id);
    if (!el || !id) return;
    const key = `${mode}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ el, id, mode, anchor, textEl });
  }

  document.querySelectorAll("#adminTabSuggestions .admin-row").forEach((row) => {
    const id = getSuggestionIdFromElement(row);
    if (id) push(row, id, "admin", null, row);
  });

  suggestionsCache.forEach((row) => {
    const id = normalizeId(row?.id);
    const textEl = findSuggestionBodyElement(row);
    if (!id || !textEl) return;
    const card = climbToSuggestionCard(textEl) || textEl;
    const anchor = findRepliesButtonIn(card) || null;
    push(card, id, "public", anchor, textEl);
  });

  document.querySelectorAll("[data-suggestion-id], [data-suggestion_id]").forEach((el) => {
    if (el.closest?.("#adminTabSuggestions")) return;
    const id = getSuggestionIdFromElement(el);
    if (!id) return;
    const anchor = findRepliesButtonIn(el) || null;
    push(el, id, "public-data", anchor, el);
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
    if (!out[sid]) out[sid] = { counts: emptyCounts(), mine: "" };
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
  return item.counts || emptyCounts();
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
      <button type="button" class="sr-suggestion-reaction-btn" data-suggestion-reaction="${esc(key)}" data-suggestion-id="${esc(id)}" aria-pressed="${active ? "true" : "false"}" title="${esc(label)}" style="border:1px solid ${active ? "rgba(34,197,94,.85)" : "rgba(255,255,255,.18)"};border-radius:999px;padding:5px 9px;cursor:pointer;background:${active ? "rgba(34,197,94,.20)" : "rgba(255,255,255,.08)"};color:inherit;font-weight:800;display:inline-flex;align-items:center;gap:5px;line-height:1;transition:transform .12s ease, background .12s ease;min-width:46px;justify-content:center;">
        <span>${icon}</span><span style="font-size:12px;">${Number(counts[key] || 0)}</span>
      </button>
    `;
  }).join("");
  return `
    <div class="sr-suggestion-reactions" data-suggestion-reactions-for="${esc(id)}" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:10px 0 7px;padding:7px 9px;width:fit-content;max-width:100%;border-radius:999px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 22px rgba(0,0,0,.18);">
      <span style="font-size:12px;opacity:.75;font-weight:800;margin-inline-end:2px;">تفاعل:</span>
      ${buttons}
    </div>
  `;
}

function attachToContainer(item){
  const { el, id, mode, anchor, textEl } = item;
  if (!el || !id) return;
  let host = document.querySelector(`.sr-suggestion-reactions-host[data-suggestion-reactions-host="${cssEscape(id)}"]`);
  if (!host) {
    host = document.createElement("div");
    host.className = "sr-suggestion-reactions-host";
    host.dataset.suggestionReactionsHost = id;
    host.style.marginTop = "8px";
  }

  if (mode === "admin") {
    const main = el.querySelector(".admin-row-main") || el;
    if (host.parentElement !== main) main.appendChild(host);
  } else if (anchor && anchor.parentElement) {
    if (host.nextElementSibling !== anchor) anchor.parentElement.insertBefore(host, anchor);
  } else if (textEl && textEl.parentElement) {
    if (host.previousElementSibling !== textEl) textEl.insertAdjacentElement("afterend", host);
  } else if (host.parentElement !== el) {
    el.appendChild(host);
  }

  const html = buildHtml(id);
  if (renderedHtmlById.get(id) !== html || host.innerHTML !== html) {
    host.innerHTML = html;
    renderedHtmlById.set(id, html);
  }
}

function renderAll(){
  findSuggestionContainers().forEach((item) => attachToContainer(item));
}

function applyOptimistic(id, reaction){
  const state = reactionState[id] || { counts: emptyCounts(), mine: "" };
  const prev = state.mine || "";
  if (prev && state.counts[prev] > 0) state.counts[prev] -= 1;
  if (prev === reaction) {
    state.mine = "";
  } else {
    state.mine = reaction;
    state.counts[reaction] = (state.counts[reaction] || 0) + 1;
  }
  reactionState[id] = state;
  renderedHtmlById.delete(id);
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
      reactionState[id] = data.reactions[id] || { counts: emptyCounts(), mine: "" };
      renderedHtmlById.delete(id);
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

  document.addEventListener("mouseenter", (event) => {
    const btn = event.target?.closest?.("button[data-suggestion-reaction]");
    if (btn) btn.style.transform = "translateY(-1px) scale(1.04)";
  }, true);
  document.addEventListener("mouseleave", (event) => {
    const btn = event.target?.closest?.("button[data-suggestion-reaction]");
    if (btn) btn.style.transform = "";
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
