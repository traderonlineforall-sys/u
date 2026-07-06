/*
 * Online users counter (near the UA07 envelope)
 *
 * Uses Supabase Realtime Presence to estimate how many clients currently have
 * the tool open. Each browser tab registers a presence payload under a unique
 * presence key.
 *
 * Docs:
 * - Supabase Realtime Presence overview: https://supabase.com/docs/guides/realtime/presence
 */

import { supabase } from "./supabase-client.js";
import { getStableUserId, getStablePresenceLabel, aliasForUserId } from "./stable-user-identity.js";

const USER_ID = getStableUserId();

function ensureCountPill() {
  const wrap = document.getElementById("UA07_SECRET_ENVELOPE_WRAP");
  const btn = document.getElementById("UA07_SECRET_ENVELOPE");
  if (!wrap || !btn) return null;

  let pill = document.getElementById("UA07_ONLINE_COUNT");
  if (!pill) {
    pill = document.createElement("span");
    pill.id = "UA07_ONLINE_COUNT";
    // Requested UX: a green "lamp" indicator + the online count.
    pill.innerHTML = `
      <span class="ua07-online-lamp" aria-hidden="true"></span>
      <span class="ua07-online-num" aria-hidden="true">0</span>
    `;
    pill.title = "Online";
    pill.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "gap:6px",
      "min-width:32px",
      "height:18px",
      "padding:0 8px",
      "border-radius:999px",
      "border:1px solid rgba(255,255,255,0.22)",
      "background:rgba(255,255,255,0.08)",
      "color:rgba(255,255,255,0.92)",
      "font-size:11px",
      "font-weight:800",
      "letter-spacing:0.2px",
      "user-select:none",
    ].join(";");

    // Lamp styling (inline to keep this feature self-contained)
    try {
      const lamp = pill.querySelector(".ua07-online-lamp");
      if (lamp) {
        lamp.style.cssText = [
          "width:10px",
          "height:10px",
          "border-radius:999px",
          "background:rgba(90, 255, 145, 0.92)",
          "box-shadow:0 0 10px rgba(90, 255, 145, 0.65), 0 0 22px rgba(90, 255, 145, 0.25)",
          "border:1px solid rgba(255,255,255,0.26)",
        ].join(";");
      }
    } catch {}

    // Keep layout stable: add a small gap between pill and envelope.
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.justifyContent = "center";
    wrap.style.gap = "6px";

    // Insert pill before the envelope button.
    wrap.insertBefore(pill, btn);
  }
  return pill;
}

function countPresenceState(state) {
  // state is an object keyed by presence keys.
  try {
    return Object.keys(state || {}).length;
  } catch {
    return 0;
  }
}

function buildOnlineTitle(state){
  try{
    const keys = Object.keys(state || {});
    const names = [];
    for (const key of keys) {
      const metas = Array.isArray(state?.[key]) ? state[key] : [];
      const label = String(metas?.[0]?.display_name || metas?.[0]?.alias || aliasForUserId(key) || "User").trim();
      names.push(label);
    }
    const n = names.length;
    const max = 12;
    const shown = names.slice(0, max);
    const extra = n - shown.length;
    if(n <= 0) return "Online: 0";
    let t = `Online: ${n}`;
    t += `\n${shown.join(", ")}`;
    if(extra > 0) t += `\n+${extra} more`;
    return t;
  }catch{
    return "Online";
  }
}

function setCount(pill, n){
  try{
    const el = pill?.querySelector?.(".ua07-online-num");
    if(el) el.textContent = String(n);
  }catch{}
}

function setTitle(pill, state){
  try{
    const title = buildOnlineTitle(state);
    pill.title = title;
    pill.setAttribute("aria-label", title.replace(/\s+/g, " "));
  }catch{}
}

async function startPresence() {
  if (!supabase) return;
  const pill = ensureCountPill();
  if (!pill) return;

  const channel = supabase.channel("sr_tool_online", {
    config: {
      presence: {
        key: USER_ID,
      },
    },
  });

  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState();
    const n = countPresenceState(state);
    setCount(pill, n);
    setTitle(pill, state);
  });

  channel.on("presence", { event: "join" }, () => {
    const state = channel.presenceState();
    const n = countPresenceState(state);
    setCount(pill, n);
    setTitle(pill, state);
  });

  channel.on("presence", { event: "leave" }, () => {
    const state = channel.presenceState();
    const n = countPresenceState(state);
    setCount(pill, n);
    setTitle(pill, state);
  });

  async function trackCurrentName(){
    try {
      await channel.track({
        online_at: new Date().toISOString(),
        display_name: getStablePresenceLabel(),
        alias: aliasForUserId(USER_ID),
        user_id: USER_ID
      });
    } catch {}
  }

  window.addEventListener("sr:nickname-updated", trackCurrentName);

  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await trackCurrentName();
    }
  });
}

function init() {
  // The UA07 logo/envelope is injected by app.js, so we may need to wait.
  let tries = 0;
  const tick = () => {
    tries += 1;
    if (document.getElementById("UA07_SECRET_ENVELOPE") && document.getElementById("UA07_SECRET_ENVELOPE_WRAP")) {
      startPresence().catch(()=>{});
      return;
    }
    if (tries < 80) setTimeout(tick, 200);
  };
  tick();
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(init, 0);
} else {
  document.addEventListener("DOMContentLoaded", init);
}
