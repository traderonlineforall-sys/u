import { getStableUserId } from "./stable-user-identity.js";
import { supabase } from "./supabase-client.js";

/*
 * Suggestions reactions — clean rebuild.
 * Scope: public Suggestions modal only.
 * No full-page scanning, no global MutationObserver, no polling loops, no reply-panel work.
 * Cloudflare is used only when a user clicks a reaction.
 */

const REACTIONS = [
  ["like", "👍", "أعجبني"],
  ["love", "❤️", "أحببته"],
  ["angry", "😡", "أغضبني"],
  ["laugh", "😂", "أضحكني"],
  ["sad", "😢", "أحزنني"],
  ["slipper", "🩴", "فردة شبشب"]
];

const SUGGESTIONS_TABLE = "suggestions";
const REACTIONS_TABLE = "suggestion_reactions";
const KEYS = REACTIONS.map(([key]) => key);
const MAX_SUGGESTIONS = 250;

let suggestions = [];
let reactions = Object.create(null);
let activeItems = [];
let loading = false;
let renderTimer = 0;
let realtimeChannel = null;
let realtimeKey = "";

function esc(value = "") {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function norm(value = "") {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cssEscape(value = "") {
  try { return CSS.escape(String(value)); }
  catch { return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
}

function userId() {
  try { return String(getStableUserId() || "").trim(); }
  catch { return ""; }
}

function validId(value) {
  const s = String(value || "").trim();
  return /^\d+$/.test(s) ? s : "";
}

function validReaction(value) {
  const s = String(value || "").trim();
  return KEYS.includes(s) ? s : "";
}

function emptyCounts() {
  return { like: 0, love: 0, angry: 0, laugh: 0, sad: 0, slipper: 0 };
}

function isVisible(el) {
  try {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 8 && r.height > 8 && cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity || 1) !== 0;
  } catch { return false; }
}

function getSuggestionsModal() {
  const textareas = Array.from(document.querySelectorAll("textarea"));
  const suggestionInput = textareas.find((el) => /write a suggestion|suggestion/i.test(String(el.placeholder || "")) && isVisible(el));
  if (!suggestionInput) return null;

  let modal = null;
  let cur = suggestionInput;
  for (let i = 0; i < 8 && cur; i += 1, cur = cur.parentElement) {
    if (!(cur instanceof HTMLElement) || !isVisible(cur)) continue;
    const text = norm(cur.textContent || "");
    if (text.includes("suggestions") && text.includes("add suggestion")) modal = cur;
  }
  return modal || suggestionInput.closest("div, section, dialog") || null;
}

function getRepliesButtons(modal) {
  if (!modal?.querySelectorAll) return [];
  return Array.from(modal.querySelectorAll("button, a, [role='button']"))
    .filter((btn) => isVisible(btn) && /replies\s*\(\d+\)/i.test(String(btn.textContent || "")));
}

function getCardForRepliesButton(btn) {
  let best = btn.parentElement || btn;
  let cur = btn;
  for (let i = 0; i < 7 && cur; i += 1, cur = cur.parentElement) {
    if (!(cur instanceof HTMLElement) || !isVisible(cur)) continue;
    const text = norm(cur.textContent || "");
    if (!text || text.length < 6) continue;
    const r = cur.getBoundingClientRect();
    if (r.width > 260 && r.height > 60) best = cur;
    if (cur.querySelector?.("textarea[placeholder*='reply' i], input[placeholder*='reply' i]")) return cur;
  }
  return best;
}

function matchSuggestionForCard(card) {
  const text = norm(card?.textContent || "");
  if (!text) return null;

  let best = null;
  let bestLen = 0;
  for (const row of suggestions) {
    const id = validId(row?.id);
    const body = norm(row?.text || "");
    if (!id || body.length < 2) continue;
    if (text.includes(body) && body.length > bestLen) {
      best = { id, text: row.text || "" };
      bestLen = body.length;
    }
  }
  return best;
}

function buildItems(modal) {
  const out = [];
  const seen = new Set();
  const buttons = getRepliesButtons(modal);

  for (const repliesButton of buttons) {
    const card = getCardForRepliesButton(repliesButton);
    const match = matchSuggestionForCard(card);
    if (!match || seen.has(match.id)) continue;
    seen.add(match.id);
    out.push({ id: match.id, card, repliesButton });
  }

  return out;
}

function summarize(rows = []) {
  const uid = userId();
  const out = Object.create(null);
  for (const row of rows) {
    const sid = String(row?.suggestion_id || "");
    const reaction = validReaction(row?.reaction);
    if (!sid || !reaction) continue;
    if (!out[sid]) out[sid] = { counts: emptyCounts(), mine: "" };
    out[sid].counts[reaction] = (out[sid].counts[reaction] || 0) + 1;
    if (uid && String(row?.user_id || "") === uid) out[sid].mine = reaction;
  }
  return out;
}

async function loadSuggestions() {
  const { data, error } = await supabase
    .from(SUGGESTIONS_TABLE)
    .select("id,text,created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_SUGGESTIONS);
  if (error) throw error;
  suggestions = Array.isArray(data) ? data : [];
}

async function loadReactionCounts(ids) {
  if (!ids.length) return;
  const { data, error } = await supabase
    .from(REACTIONS_TABLE)
    .select("suggestion_id,user_id,reaction")
    .in("suggestion_id", ids.map(Number))
    .limit(5000);
  if (error) throw error;
  reactions = summarize(Array.isArray(data) ? data : []);
}

function countsFor(id) { return reactions[String(id)]?.counts || emptyCounts(); }
function mineFor(id) { return String(reactions[String(id)]?.mine || ""); }

function reactionHtml(id) {
  const counts = countsFor(id);
  const mine = mineFor(id);
  const buttons = REACTIONS.map(([key, icon, label]) => {
    const active = mine === key;
    return `
      <button type="button" class="sr-suggestion-reaction-btn" data-suggestion-id="${esc(id)}" data-suggestion-reaction="${esc(key)}" aria-pressed="${active ? "true" : "false"}" title="${esc(label)}">
        <span class="sr-reaction-icon">${esc(icon)}</span><span class="sr-reaction-count">${Number(counts[key] || 0)}</span>
      </button>`;
  }).join("");

  return `
    <div class="sr-suggestion-reactions" data-suggestion-reactions-for="${esc(id)}">
      <span class="sr-reaction-label">تفاعل:</span>${buttons}
    </div>`;
}

function ensureStyle() {
  if (document.getElementById("sr-suggestion-reactions-clean-style")) return;
  const style = document.createElement("style");
  style.id = "sr-suggestion-reactions-clean-style";
  style.textContent = `
    .sr-suggestion-reactions-host{margin:10px 0 8px!important;display:block!important;clear:both!important;}
    .sr-suggestion-reactions{display:flex!important;align-items:center!important;gap:6px!important;flex-wrap:wrap!important;width:fit-content!important;max-width:100%!important;padding:7px 9px!important;border-radius:999px!important;background:rgba(255,255,255,.055)!important;border:1px solid rgba(255,255,255,.12)!important;box-shadow:0 8px 22px rgba(0,0,0,.18)!important;}
    .sr-reaction-label{font-size:12px!important;opacity:.78!important;font-weight:800!important;margin-inline-end:2px!important;}
    .sr-suggestion-reaction-btn{border:1px solid rgba(255,255,255,.18)!important;border-radius:999px!important;padding:5px 9px!important;cursor:pointer!important;background:rgba(255,255,255,.08)!important;color:inherit!important;font-weight:800!important;display:inline-flex!important;align-items:center!important;gap:5px!important;line-height:1!important;min-width:46px!important;justify-content:center!important;transition:transform .12s ease,background .12s ease,border-color .12s ease!important;}
    .sr-suggestion-reaction-btn[aria-pressed="true"]{background:rgba(34,197,94,.20)!important;border-color:rgba(34,197,94,.85)!important;}
    .sr-suggestion-reaction-btn:hover{transform:translateY(-1px) scale(1.04)!important;}
    .sr-reaction-count{font-size:12px!important;}
  `;
  document.head.appendChild(style);
}

function attachRows(items) {
  ensureStyle();
  for (const item of items) {
    const { id, repliesButton } = item;
    if (!id || !repliesButton?.parentElement) continue;

    let host = document.querySelector(`.sr-suggestion-reactions-host[data-suggestion-reactions-host="${cssEscape(id)}"]`);
    if (!host) {
      host = document.createElement("div");
      host.className = "sr-suggestion-reactions-host";
      host.dataset.suggestionReactionsHost = id;
    }

    if (host.nextElementSibling !== repliesButton) repliesButton.parentElement.insertBefore(host, repliesButton);
    const html = reactionHtml(id);
    if (host.innerHTML !== html) host.innerHTML = html;
  }
}

async function refresh() {
  if (loading) return;
  const modal = getSuggestionsModal();
  if (!modal) return;

  loading = true;
  try {
    await loadSuggestions();
    activeItems = buildItems(modal);
    const ids = activeItems.map((item) => item.id);
    await loadReactionCounts(ids);
    attachRows(activeItems);
    setupRealtime(ids);
  } catch {
    // Reactions must never block or freeze the Suggestions modal.
  } finally {
    loading = false;
  }
}

function scheduleRefresh(delay = 250) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(refresh, delay);
}

function updateOneFromResponse(id, data) {
  if (data?.reactions?.[id]) reactions[id] = data.reactions[id];
  attachRows(activeItems);
}

function optimistic(id, reaction) {
  const state = reactions[id] || { counts: emptyCounts(), mine: "" };
  const prev = state.mine || "";
  if (prev && state.counts[prev] > 0) state.counts[prev] -= 1;
  if (prev === reaction) state.mine = "";
  else {
    state.mine = reaction;
    state.counts[reaction] = (state.counts[reaction] || 0) + 1;
  }
  reactions[id] = state;
  attachRows(activeItems);
}

async function toggleReaction(button) {
  const id = validId(button?.dataset?.suggestionId);
  const reaction = validReaction(button?.dataset?.suggestionReaction);
  if (!id || !reaction || !userId()) return;

  button.disabled = true;
  optimistic(id, reaction);
  try {
    const res = await fetch("/api/suggestion-reactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "toggle", suggestion_id: Number(id), reaction, user_id: userId() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Reaction failed");
    updateOneFromResponse(id, data);
  } catch {
    scheduleRefresh(120);
  }
}

function keyFor(ids) { return ids.slice().sort((a, b) => Number(a) - Number(b)).join(","); }

function setupRealtime(ids) {
  const key = keyFor(ids);
  if (!key || key === realtimeKey) return;
  realtimeKey = key;
  try { if (realtimeChannel) supabase.removeChannel(realtimeChannel); } catch {}
  realtimeChannel = null;

  try {
    const visible = new Set(ids.map(String));
    realtimeChannel = supabase
      .channel(`sr_suggestion_reactions_${key.replaceAll(",", "_")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: REACTIONS_TABLE }, (payload) => {
        const sid = String(payload?.new?.suggestion_id || payload?.old?.suggestion_id || "");
        if (!sid || visible.has(sid)) scheduleRefresh(120);
      })
      .subscribe();
  } catch {}
}

function bind() {
  document.addEventListener("click", (event) => {
    const reactionBtn = event.target?.closest?.("button[data-suggestion-reaction]");
    if (reactionBtn) {
      event.preventDefault();
      event.stopPropagation();
      toggleReaction(reactionBtn);
      return;
    }

    const target = event.target;
    const text = String(target?.textContent || "");
    const likelyOpen = /suggestions|add suggestion|replies/i.test(text) || target?.closest?.("#supportSuggestionsBtn, [id*='suggestion' i], [class*='suggestion' i]");
    if (likelyOpen) {
      scheduleRefresh(350);
      setTimeout(() => scheduleRefresh(0), 900);
    }
  }, true);

  window.addEventListener("focus", () => scheduleRefresh(250));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleRefresh(250);
  });
}

function boot() {
  bind();
  scheduleRefresh(800);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
