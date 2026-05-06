import { getStableUserId } from "./stable-user-identity.js";
import { supabase } from "./supabase-client.js";

/*
 * Suggestions reactions UI — safe/light version.
 * Scope: Suggestions modal/cards only.
 * This version avoids full-page MutationObserver loops and heavy repeated DOM scans.
 * Cloudflare-friendly: Cloudflare is used only when a user clicks a reaction.
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
const REACTION_KEYS = REACTIONS.map(([key]) => key);

let suggestionsCache = [];
let suggestionsLoadedAt = 0;
let reactionState = Object.create(null);
let currentIdsKey = "";
let renderTimer = 0;
let loading = false;
let realtimeChannel = null;
let scanInterval = 0;

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

function getUserId(){
  try { return String(getStableUserId() || "").trim(); } catch { return ""; }
}

function normalizeId(value){
  const s = String(value || "").trim();
  return /^\d+$/.test(s) ? s : "";
}

function normalizeReaction(value){
  const s = String(value || "").trim();
  return REACTION_KEYS.includes(s) ? s : "";
}

function emptyCounts(){
  return { like: 0, love: 0, angry: 0, laugh: 0, sad: 0, slipper: 0 };
}

function visible(el){
  try {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 8 && r.height > 6 && cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity || 1) !== 0;
  } catch { return false; }
}

function findSuggestionsModal(){
  const inputs = Array.from(document.querySelectorAll("textarea, input"));
  const input = inputs.find((el) => /write a suggestion|suggestion/i.test(String(el.getAttribute("placeholder") || "")) && visible(el));
  if (!input) return null;

  let best = null;
  let el = input;
  for (let i = 0; i < 8 && el; i += 1, el = el.parentElement) {
    if (!(el instanceof HTMLElement) || !visible(el)) continue;
    const text = norm(el.textContent || "");
    if (text.includes("suggestions") && text.includes("add suggestion")) best = el;
  }
  return best || input.closest("div, section, dialog") || null;
}

async function loadSuggestions(force = false){
  const now = Date.now();
  if (!force && suggestionsCache.length && now - suggestionsLoadedAt < 60000) return;
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

function findRepliesButton(root){
  if (!root?.querySelectorAll) return null;
  return Array.from(root.querySelectorAll("button, a, [role='button']")).find((btn) => /replies\s*\(\d+\)/i.test(String(btn.textContent || ""))) || null;
}

function findTextElement(modal, suggestionText){
  const body = norm(suggestionText);
  if (!modal || !body) return null;

  const nodes = Array.from(modal.querySelectorAll("div, p, span, li, article, section"));
  let best = null;
  let bestScore = Infinity;

  for (const el of nodes) {
    if (!visible(el)) continue;
    if (el.closest?.(".sr-suggestion-reactions-host")) continue;
    if (el.querySelector?.("textarea, input")) continue;
    const text = norm(el.textContent || "");
    if (!text || !text.includes(body)) continue;

    const r = el.getBoundingClientRect();
    const extra = Math.max(0, text.length - body.length);
    const area = Math.max(1, r.width * r.height);
    const hasReplies = findRepliesButton(el) ? 1 : 0;
    const score = extra * 30 + area / 90 + hasReplies * 1200;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function findCard(textEl){
  if (!textEl) return null;
  let best = textEl;
  let el = textEl;
  for (let i = 0; i < 7 && el; i += 1, el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    if (findRepliesButton(el)) return el;
    const r = el.getBoundingClientRect();
    if (r.width >= 280 && r.height >= 55) best = el;
  }
  return best;
}

function findVisibleSuggestionItems(modal){
  if (!modal) return [];
  const out = [];
  const seen = new Set();

  for (const row of suggestionsCache) {
    const id = normalizeId(row?.id);
    const text = String(row?.text || "").trim();
    if (!id || !text || seen.has(id)) continue;
    const textEl = findTextElement(modal, text);
    if (!textEl) continue;
    const card = findCard(textEl) || textEl;
    const repliesButton = findRepliesButton(card);
    seen.add(id);
    out.push({ id, card, textEl, repliesButton });
  }
  return out;
}

function summarizeRows(rows = [], userId = getUserId()){
  const out = Object.create(null);
  for (const row of rows || []) {
    const sid = String(row?.suggestion_id || "");
    const reaction = normalizeReaction(row?.reaction);
    if (!sid || !reaction) continue;
    if (!out[sid]) out[sid] = { counts: emptyCounts(), mine: "" };
    out[sid].counts[reaction] = (out[sid].counts[reaction] || 0) + 1;
    if (userId && String(row?.user_id || "") === userId) out[sid].mine = reaction;
  }
  return out;
}

function idsKey(ids){
  return ids.slice().sort((a, b) => Number(a) - Number(b)).join(",");
}

async function loadCounts(ids){
  if (!ids.length) return;
  const key = idsKey(ids);
  if (key === currentIdsKey && Object.keys(reactionState).length) return;
  currentIdsKey = key;

  const { data, error } = await supabase
    .from(REACTIONS_TABLE)
    .select("suggestion_id,user_id,reaction")
    .in("suggestion_id", ids.map(Number))
    .limit(5000);
  if (error) throw error;
  reactionState = summarizeRows(Array.isArray(data) ? data : []);
}

function countsFor(id){ return reactionState[String(id)]?.counts || emptyCounts(); }
function mineFor(id){ return String(reactionState[String(id)]?.mine || ""); }

function buildHtml(id){
  const counts = countsFor(id);
  const mine = mineFor(id);
  const buttons = REACTIONS.map(([key, icon, label]) => {
    const active = mine === key;
    return `
      <button type="button" class="sr-suggestion-reaction-btn" data-suggestion-reaction="${esc(key)}" data-suggestion-id="${esc(id)}" aria-pressed="${active ? "true" : "false"}" title="${esc(label)}" style="border:1px solid ${active ? "rgba(34,197,94,.85)" : "rgba(255,255,255,.18)"};border-radius:999px;padding:5px 9px;cursor:pointer;background:${active ? "rgba(34,197,94,.20)" : "rgba(255,255,255,.08)"};color:inherit;font-weight:800;display:inline-flex;align-items:center;gap:5px;line-height:1;min-width:46px;justify-content:center;">
        <span>${icon}</span><span style="font-size:12px;">${Number(counts[key] || 0)}</span>
      </button>`;
  }).join("");

  return `
    <div class="sr-suggestion-reactions" data-suggestion-reactions-for="${esc(id)}" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:10px 0 7px;padding:7px 9px;width:fit-content;max-width:100%;border-radius:999px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 22px rgba(0,0,0,.18);">
      <span style="font-size:12px;opacity:.75;font-weight:800;margin-inline-end:2px;">تفاعل:</span>${buttons}
    </div>`;
}

function attachReactionRow(item){
  const { id, card, textEl, repliesButton } = item;
  if (!id || !card) return;

  let host = card.querySelector(`.sr-suggestion-reactions-host[data-suggestion-reactions-host="${cssEscape(id)}"]`)
    || document.querySelector(`.sr-suggestion-reactions-host[data-suggestion-reactions-host="${cssEscape(id)}"]`);
  if (!host) {
    host = document.createElement("div");
    host.className = "sr-suggestion-reactions-host";
    host.dataset.suggestionReactionsHost = id;
  }

  if (repliesButton && repliesButton.parentElement) {
    if (host.nextElementSibling !== repliesButton) repliesButton.parentElement.insertBefore(host, repliesButton);
  } else if (textEl && textEl.parentElement) {
    if (host.previousElementSibling !== textEl) textEl.insertAdjacentElement("afterend", host);
  } else if (host.parentElement !== card) {
    card.appendChild(host);
  }

  const html = buildHtml(id);
  if (host.innerHTML !== html) host.innerHTML = html;
}

function render(items){
  for (const item of items) attachReactionRow(item);
}

async function refresh(options = {}){
  if (loading) return;
  const modal = findSuggestionsModal();
  if (!modal) return;

  loading = true;
  try {
    await loadSuggestions(!!options.forceSuggestions);
    const items = findVisibleSuggestionItems(modal);
    const ids = items.map((x) => x.id);
    if (ids.length) {
      await loadCounts(ids);
      render(items);
      ensureRealtime(ids);
    }
  } catch {
    // Never break or freeze the Suggestions modal if reactions are unavailable.
  } finally {
    loading = false;
  }
}

function scheduleRefresh(delay = 220, options = {}){
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => refresh(options), delay);
}

function setOptimistic(id, reaction){
  const state = reactionState[id] || { counts: emptyCounts(), mine: "" };
  const prev = state.mine || "";
  if (prev && state.counts[prev] > 0) state.counts[prev] -= 1;
  if (prev === reaction) state.mine = "";
  else {
    state.mine = reaction;
    state.counts[reaction] = (state.counts[reaction] || 0) + 1;
  }
  reactionState[id] = state;
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

async function toggle(btn){
  const id = normalizeId(btn?.dataset?.suggestionId);
  const reaction = normalizeReaction(btn?.dataset?.suggestionReaction);
  if (!id || !reaction) return;

  btn.disabled = true;
  setOptimistic(id, reaction);
  scheduleRefresh(0);

  try {
    const data = await apiToggle(id, reaction);
    if (data?.reactions?.[id]) reactionState[id] = data.reactions[id];
    currentIdsKey = "";
    scheduleRefresh(80);
  } catch {
    currentIdsKey = "";
    scheduleRefresh(80, { forceSuggestions: true });
  }
}

function ensureRealtime(ids){
  const key = idsKey(ids);
  if (!key || key === realtimeIdsKey) return;
  realtimeIdsKey = key;
  try { if (realtimeChannel) supabase.removeChannel(realtimeChannel); } catch {}
  realtimeChannel = null;
  try {
    const visibleIds = new Set(ids.map(String));
    realtimeChannel = supabase
      .channel(`sr_suggestion_reactions_${key.replaceAll(",", "_")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: REACTIONS_TABLE }, (payload) => {
        const sid = String(payload?.new?.suggestion_id || payload?.old?.suggestion_id || "");
        if (!sid || visibleIds.has(sid)) {
          currentIdsKey = "";
          scheduleRefresh(80);
        }
      })
      .subscribe();
  } catch {}
}

function bind(){
  document.addEventListener("click", (event) => {
    const reactionBtn = event.target?.closest?.("button[data-suggestion-reaction]");
    if (reactionBtn) {
      event.preventDefault();
      event.stopPropagation();
      toggle(reactionBtn);
      return;
    }

    const text = String(event.target?.textContent || "");
    if (/suggestions|add suggestion|replies/i.test(text) || event.target?.closest?.("#supportSuggestionsBtn, [id*='suggestion' i], [class*='suggestion' i]")) {
      scheduleRefresh(250, { forceSuggestions: true });
      setTimeout(() => scheduleRefresh(900), 900);
    }
  }, true);

  window.addEventListener("focus", () => scheduleRefresh(120, { forceSuggestions: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleRefresh(120, { forceSuggestions: true });
  });

  if (!scanInterval) {
    scanInterval = setInterval(() => {
      if (!findSuggestionsModal()) return;
      scheduleRefresh(0);
    }, 2200);
  }
}

function boot(){
  bind();
  scheduleRefresh(600, { forceSuggestions: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
