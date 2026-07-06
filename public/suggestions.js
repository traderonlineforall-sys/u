import { supabase as sharedSupabase } from "./supabase-client.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_NAME } from "./supabase-config.js";
import { getStableUserId, aliasForUserId, getStoredUserName, requireNicknameLogin } from "./stable-user-identity.js";

const elInput = document.getElementById("suggestionInput");
const elBtn = document.getElementById("suggestionAddBtn");
const elStatus = document.getElementById("suggestionStatus");
const elList = document.getElementById("suggestionsList");

// UI controls (open/close)
const elOverlay = document.getElementById("suggestionsOverlay");
const elFab = document.getElementById("suggestionsFab");
const elClose = document.getElementById("suggestionsCloseBtn");
const badgeSuggestions = document.getElementById("badgeSuggestions");

// Unread tracking (per user/device)
const LS_SUG_SEEN = "sr_suggestions_seen_at";
// On first run, avoid counting all historical suggestions as unread
if(!localStorage.getItem(LS_SUG_SEEN)){
  try{ localStorage.setItem(LS_SUG_SEEN, new Date().toISOString()); }catch{}
}
function getSugSeenTs(){ const v = localStorage.getItem(LS_SUG_SEEN) || ""; return v ? Date.parse(v) : 0; }
function markSugSeen(){ try{ localStorage.setItem(LS_SUG_SEEN, new Date().toISOString()); }catch{} updateSugBadgeFromCache(); }
function setBadge(el, count){
  if(!el) return;
  const n = Number(count||0);
  if(n>0){ el.textContent = String(n); el.classList.add("is-on"); }
  else{ el.textContent = ""; el.classList.remove("is-on"); }
}

let sugCache = [];
function updateSugBadgeFromCache(){
  const seenTs = getSugSeenTs();
  let c = 0;
  for(const r of (sugCache||[])){
    const ts = Date.parse(r.created_at||"") || 0;
    if(ts > seenTs) c += 1;
  }
  // If overlay open, treat as read
  const isOpen = elOverlay?.classList.contains("is-open");
  setBadge(badgeSuggestions, isOpen ? 0 : c);
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message, type = "info") {
  elStatus.textContent = message || "";
  elStatus.dataset.type = type;
}

function isConfigured() {
  return (
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_URL.startsWith("http") &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_URL.includes("PASTE_") &&
    !SUPABASE_ANON_KEY.includes("PASTE_")
  );
}

let supabase = null;

// Anonymous user id (stored locally) used for admin blocks
const USER_ID = getStableUserId();

function currentDisplayName(){
  return getStoredUserName() || aliasForUserId(USER_ID);
}
let profileNameMap = new Map();

// Per-user colors to make multi-user threads clear
function hueFromString(str = "") {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 360;
}

function colorForUserId(userId = "") {
  const hue = hueFromString(userId);
  return `hsl(${hue}, 85%, 60%)`;
}

// Replies (optional)
let REPLIES_SUPPORTED = null;
async function detectRepliesTable() {
  if (REPLIES_SUPPORTED !== null) return REPLIES_SUPPORTED;
  try {
    const res = await supabase.from("suggestion_replies").select("id").limit(1);
    REPLIES_SUPPORTED = !res.error;
  } catch {
    REPLIES_SUPPORTED = false;
  }
  return REPLIES_SUPPORTED;
}

async function isBlocked() {
  if (!supabase) return null;
  const now = new Date().toISOString();
  // Preferred schema: expires_at
  let res = await supabase
    .from("blocks")
    .select("expires_at")
    .eq("user_id", USER_ID)
    .gt("expires_at", now)
    .order("expires_at", { ascending: false })
    .limit(1);

  // Legacy/compat schema: blocked_until
  if (res.error && (String(res.error.message || "").includes("expires_at") || String(res.error.details || "").includes("expires_at"))) {
    res = await supabase
      .from("blocks")
      .select("blocked_until")
      .eq("user_id", USER_ID)
      .gt("blocked_until", now)
      .order("blocked_until", { ascending: false })
      .limit(1);
    if (!res.error && res.data && res.data[0]) {
      return { expires_at: res.data[0].blocked_until };
    }
  }

  if (res.error) return null;
  return (res.data && res.data[0]) ? res.data[0] : null;
}



function redirectToNickname(){
  try { requireNicknameLogin(); }
  catch { location.href = "/login?nickname=1"; }
}

function displayNameForUser(userId, rowName = ""){
  const uid = String(userId || "");
  const direct = String(rowName || "").trim();
  return direct || profileNameMap.get(uid) || aliasForUserId(uid) || "User";
}

async function loadProfileNamesForRows(rows){
  profileNameMap = new Map();
  if(!supabase || !Array.isArray(rows) || rows.length === 0) return;
  const ids = Array.from(new Set(rows.map(r => String(r?.user_id || "").trim()).filter(Boolean))).slice(0, 500);
  if(!ids.length) return;
  try{
    let res = await supabase
      .from("support_users")
      .select("user_id, display_name, nickname_reset_required")
      .in("user_id", ids)
      .limit(500);
    if(res.error && /nickname_reset_required|column .*does not exist|schema cache/i.test(String(res.error.message || ""))){
      res = await supabase.from("support_users").select("user_id, display_name").in("user_id", ids).limit(500);
    }
    if(res.error || !Array.isArray(res.data)) return;
    for(const r of res.data){
      if(!r?.user_id || r.nickname_reset_required) continue;
      const dn = String(r.display_name || "").trim();
      if(dn) profileNameMap.set(String(r.user_id), dn);
    }
  }catch{}
}

async function loadSuggestions() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("suggestions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error(error);
    setStatus(`Something went wrong. Please contact ${ADMIN_NAME}.`, "error");
    return;
  }

  // Cache for unread badge
  sugCache = Array.isArray(data) ? data : [];
  updateSugBadgeFromCache();

  if (!Array.isArray(data) || data.length === 0) {
    elList.innerHTML = `<div class="suggestions-empty">No suggestions yet.</div>`;
    return;
  }

  const repliesOk = await detectRepliesTable().catch(()=>false);
  await loadProfileNamesForRows(data).catch(()=>{});

  // Preload reply counts so users can see them without opening each thread.
  let replyCountMap = new Map();
  if (repliesOk) {
    try {
      const ids = (Array.isArray(data) ? data : [])
        .map(r => Number(r?.id))
        .filter(n => Number.isFinite(n));

      if (ids.length) {
        const res = await supabase
          .from("suggestion_replies")
          .select("suggestion_id")
          .in("suggestion_id", ids)
          .limit(5000);
        if (!res.error && Array.isArray(res.data)) {
          for (const rr of res.data) {
            const sid = Number(rr?.suggestion_id);
            if (!Number.isFinite(sid)) continue;
            replyCountMap.set(sid, (replyCountMap.get(sid) || 0) + 1);
          }
        }
      }
    } catch (e) {
      // If anything goes wrong, just skip counts (threads will still load on click).
      replyCountMap = new Map();
    }
  }

  elList.innerHTML = data
    .map((x) => {
      const when = x?.created_at ? new Date(x.created_at).toLocaleString() : "";
      const text = escapeHtml(x?.text ?? "");
      const uid = String(x?.user_id || "");
      const name = escapeHtml(displayNameForUser(uid, x?.name));
      const col = colorForUserId(uid || name);
      const sid = String(x?.id || "");
      const rCount = repliesOk ? (replyCountMap.get(Number(x?.id)) || 0) : 0;
      const hasReplies = !!rCount;

      return `
        <div class="suggestion-item${hasReplies ? " has-replies" : ""}" style="--u:${escapeHtml(col)}" data-id="${escapeHtml(sid)}">
          <div class="suggestion-meta">
            <span class="suggestion-who">
              <span class="suggestion-dot" aria-hidden="true"></span>
              <span class="suggestion-name">${name}</span>
              <span class="sr-suggest-react-anchor" data-reaction-target-type="suggestion" data-reaction-target-id="${escapeHtml(sid)}" aria-label="Suggestion reaction"></span>
            </span>
            <span class="suggestion-when">${when}</span>
          </div>
          <div class="suggestion-text">${text}</div>
          ${repliesOk ? `
            <div class="suggestion-actions">
              <button class="sug-replies-toggle${hasReplies ? " has-replies" : ""}" type="button" data-id="${escapeHtml(sid)}" data-reply-count="${escapeHtml(String(rCount))}" aria-expanded="false">
                <span class="sug-replies-icon" aria-hidden="true">↩</span>
                <span class="sug-replies-label">Replies</span>
                ${hasReplies ? `<span class="sug-replies-badge" aria-label="${escapeHtml(String(rCount))} replies">${escapeHtml(String(rCount))}</span>` : ``}
              </button>
            </div>
            <div class="suggestion-replies" id="sugReplies_${escapeHtml(sid)}" style="display:none"></div>
          ` : ``}
        </div>
      `;
    })
    .join("");

  if(repliesOk){
    elList.querySelectorAll("button.sug-replies-toggle").forEach((btn)=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.getAttribute("data-id");
        if(!id) return;
        await toggleRepliesPanel(id, btn);
      });
    });
  }
  window.dispatchEvent(new CustomEvent("sr:suggestions-rendered"));
}

async function addSuggestion() {
  if (!supabase) return;

  const displayName = currentDisplayName();
  if(!getStoredUserName()){
    redirectToNickname();
    return;
  }

  const text = (elInput.value || "").trim();
  if (!text) {
    setStatus("Please write a suggestion first.", "warn");
    elInput.focus();
    return;
  }

  const blocked = await isBlocked();
  if (blocked) {
    setStatus(`You are blocked until ${new Date(blocked.expires_at).toLocaleString()}. Please contact ${ADMIN_NAME}.`, "error");
    return;
  }


  elBtn.disabled = true;
  elInput.disabled = true;
  setStatus("Posting…", "info");

  const payload = {
    text,
    user_id: USER_ID,
    display_name: displayName,
  };

  const apiRes = await fetch("/api/public-suggestion", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const apiData = await apiRes.json().catch(() => ({}));
  if(apiData?.nickname_required){
    redirectToNickname();
    return;
  }
  const error = apiRes.ok && apiData?.ok ? null : new Error(apiData?.error || "Could not add suggestion.");

  elBtn.disabled = false;
  elInput.disabled = false;

  if (error) {
    console.error(error);
    setStatus(`Could not add your suggestion. Please contact ${ADMIN_NAME}.`, "error");
    return;
  }

  elInput.value = "";
  setStatus("Added ✅", "success");
  // If realtime is not available for some reason, reload as fallback
  await loadSuggestions();
}

// -------- Replies (optional feature) --------
function renderReplyItem(r){
  const when = r?.created_at ? new Date(r.created_at).toLocaleString() : "";
  const uid = String(r?.user_id || "");
  const name = escapeHtml(displayNameForUser(uid, r?.name));
  const col = colorForUserId(uid || name);
  const text = escapeHtml(r?.text ?? "");
  const rid = String(r?.id || "");
  return `
    <div class="sug-reply-item" style="--u:${escapeHtml(col)}" data-reply-id="${escapeHtml(rid)}">
      <div class="sug-reply-meta">
        <span class="sug-reply-dot" aria-hidden="true"></span>
        <b class="sug-reply-name">${name}</b>
        <span class="sr-suggest-react-anchor" data-reaction-target-type="reply" data-reaction-target-id="${escapeHtml(rid)}" aria-label="Reply reaction"></span>
        <span class="sug-reply-when">${when}</span>
      </div>
      <div class="sug-reply-text">${text}</div>
    </div>
  `;
}

async function toggleRepliesPanel(suggestionId, btn){
  const box = document.getElementById(`sugReplies_${suggestionId}`);
  if(!box) return;
  const open = box.style.display !== "none";
  if(open){
    box.style.display = "none";
    btn?.setAttribute("aria-expanded", "false");
    const cnt = Number(btn?.dataset?.replyCount || 0);
    btn.textContent = cnt ? `↩ Replies (${cnt})` : "↩ Replies";
    return;
  }
  box.style.display = "block";
  btn?.setAttribute("aria-expanded", "true");
  await renderRepliesPanel(suggestionId, box, btn);
}

async function renderRepliesPanel(suggestionId, box, btn){
  box.innerHTML = `<div class="sug-replies-loading">Loading…</div>`;

  const ok = await detectRepliesTable().catch(()=>false);
  if(!ok){
    box.innerHTML = `<div class="sug-replies-empty">Replies are not configured on the database yet. Please contact ${escapeHtml(ADMIN_NAME)}.</div>`;
    return;
  }

  const { data, error } = await supabase
    .from("suggestion_replies")
    .select("*")
    .eq("suggestion_id", Number(suggestionId))
    .order("created_at", { ascending: true })
    .limit(200);

  if(error){
    console.error(error);
    box.innerHTML = `<div class="sug-replies-empty">Could not load replies. Please contact ${escapeHtml(ADMIN_NAME)}.</div>`;
    return;
  }

  const replies = Array.isArray(data) ? data : [];
  await loadProfileNamesForRows(replies).catch(()=>{});
  const count = replies.length;
  if(btn){
    btn.dataset.replyCount = String(count);
    btn.textContent = count ? `▾ Replies (${count})` : "▾ Replies";
  }

  const blocked = await isBlocked();
  const disabled = blocked ? "disabled" : "";
  const blockedText = blocked ? `You are blocked until ${new Date(blocked.expires_at).toLocaleString()}.` : "";

  box.innerHTML = `
    <div class="sug-replies-list">
      ${replies.length ? replies.map(renderReplyItem).join("") : `<div class="sug-replies-empty">No replies yet.</div>`}
    </div>
    <div class="sug-reply-compose">
      <textarea class="sug-reply-input" rows="2" maxlength="1200" placeholder="Write a reply…" ${disabled}></textarea>
      <div class="sug-reply-actions">
        <button class="sug-reply-send" type="button" ${disabled}>Reply</button>
        <span class="sug-reply-hint">${escapeHtml(blockedText || "Enter to send • Shift+Enter for new line")}</span>
      </div>
    </div>
  `;

  const input = box.querySelector("textarea.sug-reply-input");
  const send = box.querySelector("button.sug-reply-send");

  async function post(){
    if(!input) return;
    const text = (input.value || "").trim();
    if(!text) return;
    const bl = await isBlocked();
    if (bl) {
      setStatus(`You are blocked until ${new Date(bl.expires_at).toLocaleString()}. Please contact ${ADMIN_NAME}.`, "error");
      return;
    }

    try{
      if(!getStoredUserName()){
        redirectToNickname();
        return;
      }
      send && (send.disabled = true);
      const payload = {
        suggestion_id: Number(suggestionId),
        text,
        user_id: USER_ID,
        name: currentDisplayName(),
      };
      const apiRes = await fetch("/api/public-suggestion-reply", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const apiData = await apiRes.json().catch(() => ({}));
      if(apiData?.nickname_required){
        redirectToNickname();
        return;
      }
      if(!apiRes.ok || !apiData?.ok) throw new Error(apiData?.error || "Could not post reply.");
      input.value = "";
      await renderRepliesPanel(suggestionId, box, btn);
    }catch(e){
      console.error(e);
      setStatus(`Could not post reply. Please contact ${ADMIN_NAME}.`, "error");
    }finally{
      send && (send.disabled = false);
    }
  }

  send?.addEventListener("click", post);
  input?.addEventListener("keydown", (e)=>{
    if(e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      post();
    }
  });
  window.dispatchEvent(new CustomEvent("sr:suggestions-rendered"));
  setTimeout(()=> input?.focus(), 0);
}

function openPanel() {
  if (!elOverlay) return;
  elOverlay.classList.add("is-open");
  elOverlay.setAttribute("aria-hidden", "false");
  elFab?.setAttribute("aria-expanded", "true");
  // Opening the panel marks suggestions as read for this user/device
  markSugSeen();
  // Slight delay to ensure visible before focusing
  setTimeout(() => elInput?.focus(), 0);
}

function closePanel() {
  if (!elOverlay) return;
  elOverlay.classList.remove("is-open");
  elOverlay.setAttribute("aria-hidden", "true");
  elFab?.setAttribute("aria-expanded", "false");
  updateSugBadgeFromCache();
}

function wire() {
  // Toggle UI
  elFab?.addEventListener("click", openPanel);
  elClose?.addEventListener("click", closePanel);
  elOverlay?.addEventListener("click", (e) => {
    // Close only when clicking outside the modal content
    if (e.target === elOverlay) closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });

  // Add suggestion
  elBtn?.addEventListener("click", addSuggestion);
  elInput?.addEventListener("keydown", (e) => {
    // Textarea UX: Enter posts, Shift+Enter inserts newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addSuggestion();
    }
  });
}

function init() {
  if (!elInput || !elBtn || !elStatus || !elList) return;

  wire();

  if (!isConfigured()) {
    setStatus(`Configuration is missing. Please contact ${ADMIN_NAME}.`, "error");
    elBtn.disabled = true;
    elInput.disabled = true;
    elList.innerHTML = `<div class="suggestions-empty">Suggestions are currently unavailable.</div>`;
    return;
  }

  // Use shared Supabase client (singleton) to avoid multiple GoTrueClient warnings.
  supabase = sharedSupabase;

  // Initial load
  loadSuggestions();
  window.addEventListener("sr:suggestions-changed", () => loadSuggestions());

  // Realtime updates (INSERT/UPDATE/DELETE)
  supabase
    .channel("suggestions-public")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "suggestions" },
      () => loadSuggestions()
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // silent
      }
    });

  // Realtime updates for replies to keep reply counts fresh.
  detectRepliesTable().then((ok)=>{
    if(!ok) return;
    supabase
      .channel("suggestion-replies")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "suggestion_replies" },
        () => loadSuggestions()
      )
      .subscribe(()=>{});
  });
}

document.addEventListener("DOMContentLoaded", init);
