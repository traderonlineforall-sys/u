import { getStableUserId } from "./stable-user-identity.js";

/*
 * Extra suggestion reactions layer.
 * Scope: Suggestions reactions row only.
 * Adds: 😂 أضحكني, 😢 أحزنني, 🩴 فردة شبشب
 */

const EXTRA_REACTIONS = [
  ["laugh", "😂", "أضحكني"],
  ["sad", "😢", "أحزنني"],
  ["slipper", "🩴", "فردة شبشب"]
];

let timer = 0;
let loading = false;
let state = Object.create(null);

function userId(){
  try { return String(getStableUserId() || "").trim(); } catch { return ""; }
}

function esc(value = ""){
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function idsOnPage(){
  return Array.from(document.querySelectorAll(".sr-suggestion-reactions[data-suggestion-reactions-for]"))
    .map((el) => String(el.getAttribute("data-suggestion-reactions-for") || "").trim())
    .filter((id, idx, arr) => /^\d+$/.test(id) && arr.indexOf(id) === idx);
}

async function api(body){
  const res = await fetch("/api/suggestion-reactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, user_id: userId() })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

async function load(){
  if (loading) return;
  const ids = idsOnPage();
  if (!ids.length) return;
  loading = true;
  try {
    const data = await api({ action: "list", suggestion_ids: ids.map(Number) });
    state = data?.reactions && typeof data.reactions === "object" ? data.reactions : Object.create(null);
    render();
  } catch {
    render();
  } finally {
    loading = false;
  }
}

function countsFor(id){
  return state[String(id)]?.counts || {};
}
function mineFor(id){
  return String(state[String(id)]?.mine || "");
}

function makeButton(id, key, icon, label){
  const counts = countsFor(id);
  const active = mineFor(id) === key;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sr-suggestion-reaction-btn sr-suggestion-extra-reaction-btn";
  btn.dataset.suggestionReaction = key;
  btn.dataset.suggestionId = id;
  btn.setAttribute("aria-pressed", active ? "true" : "false");
  btn.title = label;
  btn.style.cssText = `border:1px solid ${active ? "rgba(34,197,94,.85)" : "rgba(255,255,255,.18)"};border-radius:999px;padding:5px 9px;cursor:pointer;background:${active ? "rgba(34,197,94,.20)" : "rgba(255,255,255,.08)"};color:inherit;font-weight:800;display:inline-flex;align-items:center;gap:5px;line-height:1;transition:transform .12s ease, background .12s ease;min-width:46px;justify-content:center;`;
  btn.innerHTML = `<span>${esc(icon)}</span><span style="font-size:12px;">${Number(counts[key] || 0)}</span>`;
  btn.addEventListener("mouseenter", () => { btn.style.transform = "translateY(-1px) scale(1.04)"; });
  btn.addEventListener("mouseleave", () => { btn.style.transform = ""; });
  return btn;
}

function render(){
  document.querySelectorAll(".sr-suggestion-reactions[data-suggestion-reactions-for]").forEach((row) => {
    const id = String(row.getAttribute("data-suggestion-reactions-for") || "").trim();
    if (!/^\d+$/.test(id)) return;
    row.querySelectorAll(".sr-suggestion-extra-reaction-btn").forEach((el) => el.remove());
    EXTRA_REACTIONS.forEach(([key, icon, label]) => row.appendChild(makeButton(id, key, icon, label)));
  });
}

async function toggle(btn){
  const id = String(btn?.dataset?.suggestionId || "").trim();
  const reaction = String(btn?.dataset?.suggestionReaction || "").trim();
  if (!/^\d+$/.test(id) || !EXTRA_REACTIONS.some(([key]) => key === reaction)) return;
  btn.disabled = true;
  try {
    const data = await api({ action: "toggle", suggestion_id: Number(id), reaction });
    if (data?.reactions && typeof data.reactions === "object") {
      state[id] = data.reactions[id] || { counts: {}, mine: "" };
    }
    render();
    setTimeout(schedule, 250);
  } catch {
    btn.disabled = false;
  }
}

function schedule(delay = 300){
  clearTimeout(timer);
  timer = setTimeout(load, delay);
}

function boot(){
  document.addEventListener("click", (event) => {
    const btn = event.target?.closest?.("button.sr-suggestion-extra-reaction-btn[data-suggestion-reaction]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    toggle(btn);
  }, true);

  try {
    const observer = new MutationObserver(() => schedule(250));
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch {}

  window.addEventListener("focus", () => schedule(120));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule(120);
  });

  schedule(100);
  setTimeout(() => schedule(0), 1500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
