
import { supabase } from "./supabase-client.js";
import { ADMIN_NAME } from "./supabase-config.js";
import { getStableUserId, getStoredUserName, setStoredUserName } from "./stable-user-identity.js";
import { playSoftNotification, unlockSound } from "./notification-sound.js";
// Fixed Functions base for Cloudflare/Next.js.
// No Vercel/Netlify probing and no startup ping, to keep requests lower and behavior deterministic.
const SR_FN_BASE = "/api";
function resolveFnBase() {
  return Promise.resolve(SR_FN_BASE);
}

// ---------- User identity ----------
const USER_ID = getStableUserId();

function getUserName() {
  return getStoredUserName();
}
function setUserName(name) {
  setStoredUserName(name);
}

// ---------- Elements ----------
const supportBtn = document.getElementById("supportToggleBtn");
const supportBadge = document.getElementById("badgeSupport");

const nameOverlay = document.getElementById("supportNameOverlay");
const nameInput = document.getElementById("supportNameInput");
const nameConfirmBtn = document.getElementById("supportNameConfirmBtn");
const nameCloseBtn = document.getElementById("supportNameCloseBtn");

const chatOverlay = document.getElementById("supportChatOverlay");
const chatCloseBtn = document.getElementById("supportChatCloseBtn");
const chatBackBtn = document.getElementById("supportChatBackBtn");
const chatTitle = document.getElementById("supportChatTitle");
const chatSubtitle = document.getElementById("supportChatSubtitle");

const usersList = document.getElementById("supportUsersList");
const messagesList = document.getElementById("supportMessagesList");
const msgInput = document.getElementById("supportMessageInput");
const sendBtn = document.getElementById("supportSendBtn");
const statusEl = document.getElementById("supportChatStatus");

// Emoji + attachments
const emojiBtn = document.getElementById("supportEmojiBtn");
const emojiPopover = document.getElementById("supportEmojiPopover");
const attachBtn = document.getElementById("supportAttachBtn");
const attachInput = document.getElementById("supportAttachInput");
const attachPreview = document.getElementById("supportAttachPreview");

// ---------- Paste image (Ctrl+V / Snipping Tool) ----------
msgInput?.addEventListener("paste", async (e) => {
  try{
    const items = e.clipboardData?.items;
    if(!items) return;
    for (const it of items){
      if(it.kind === "file" && (it.type || "").startsWith("image/")){
        const file = it.getAsFile();
        if(!file) continue;
        // Attach pasted image as if user selected it
        setSelectedFile(new File([file], `pasted-${Date.now()}.png`, { type: file.type || "image/png" }));
        statusEl.textContent = "Image pasted. Press Send to upload.";
        e.preventDefault();
        return;
      }
    }
  }catch(err){
    console.error(err);
  }
});


let selectedFile = null;

// ---------- Per-user colors (to make multi-user public chat easy to follow) ----------
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
  // bright, readable color
  return `hsl(${hue}, 85%, 60%)`;
}

// Return a small bundle of CSS colors for nicer full-bubble coloring
function colorBundleForUserId(userId = "") {
  const hue = hueFromString(userId);
  return {
    accent: `hsl(${hue}, 85%, 60%)`,
    // Slightly darker background tint (keeps text readable)
    bg: `hsla(${hue}, 65%, 35%, 0.22)`,
    border: `hsla(${hue}, 80%, 55%, 0.28)`,
  };
}

// ---------- Optional profiles table (admin can delete names) ----------
let PROFILE_TABLE_OK = null;

async function detectProfileTable() {
  if (PROFILE_TABLE_OK !== null) return PROFILE_TABLE_OK;
  try {
    const res = await supabase.from("support_users").select("user_id").limit(1);
    PROFILE_TABLE_OK = !res.error;
  } catch {
    PROFILE_TABLE_OK = false;
  }
  return PROFILE_TABLE_OK;
}

async function fetchProfileName() {
  const ok = await detectProfileTable();
  if (!ok) return null;
  try {
    const res = await supabase
      .from("support_users")
      .select("display_name")
      .eq("user_id", USER_ID)
      .limit(1);
    if (res.error) return null;
    return res.data && res.data[0] ? (res.data[0].display_name || null) : null;
  } catch {
    return null;
  }
}

async function upsertProfileName(name) {
  const ok = await detectProfileTable();
  if (!ok) return;
  const safe = String(name || "").trim().slice(0, 60);
  if (!safe) return;
  try {
    const res = await supabase
      .from("support_users")
      .upsert({ user_id: USER_ID, display_name: safe }, { onConflict: "user_id" });
    if (res.error) throw res.error;
  } catch (e) {
    // If the table is not properly configured, don't break the chat.
    console.warn("support_users upsert failed", e);
  }
}

// ---------- Helpers ----------
function escapeHtml(s = "") {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// Convert URLs in plain text to safe clickable links.
function linkifyText(raw = "") {
  const urlRe = /(https?:\/\/[^\s]+)/g;
  const parts = String(raw).split(urlRe);
  return parts.map(p => {
    if (p.match(urlRe)) {
      const safeUrl = escapeHtml(p);
      return `<a class="support-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
    }
    return escapeHtml(p);
  }).join("");
}

function renderMessageHtml(m) {
  const text = m?.message || "";
  // If message contains an attachment marker on its last line, render a nicer label.
  // Format: "Attachment: <name>\n<url>" or any text ending with a URL.
  const lines = String(text).split("\n");
  const last = lines[lines.length - 1] || "";
  const urlMatch = last.match(/^(https?:\/\/[^\s]+)$/);
  if (urlMatch) {
    const url = urlMatch[1];
    let label = "Open attachment";
    if (lines.length >= 2 && lines[lines.length - 2].toLowerCase().startsWith("attachment:")) {
      label = lines[lines.length - 2].slice("attachment:".length).trim() || label;
      // Remove the marker line from body
      const body = lines.slice(0, -2).join("\n");
      const bodyHtml = body ? `<div class="support-msg-text">${linkifyText(body)}</div>` : "";
      return `${bodyHtml}<div class="support-attach-line">📎 <a class="support-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></div>`;
    }
    // No explicit marker; keep normal linkified body.
  }
  return `<div class="support-msg-text">${linkifyText(text)}</div>`;
}
function fmtTime(ts) {
  try { return new Date(ts).toLocaleString(); } catch { return ""; }
}
function setStatus(text, type = "info") {
  statusEl.textContent = text || "";
  statusEl.dataset.type = type;
}
function show(el) { el.style.display = "flex"; }
function hide(el) { el.style.display = "none"; }

// ---------- Emoji UI ----------
const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😎","🤝","👍",
  "🙏","👏","🔥","💡","✅","⚠️","❌","📌","📎","❤️",
  "🎉","🚀","🧠","🛠️","🧾","📞","💬","🤔","😅","😢",
  "😡","🫡","👌","✍️","🗑️","🔒","🔓","⏳","🕒","📍"
];

function renderEmojiPopover(){
  if(!emojiPopover) return;
  emojiPopover.innerHTML = `
    <div class="support-emoji-grid">
      ${EMOJIS.map(e=>`<button class="support-emoji-btn" type="button" data-emoji="${e}">${e}</button>`).join("")}
    </div>
  `;
  emojiPopover.querySelectorAll("button.support-emoji-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const e = btn.getAttribute("data-emoji") || "";
      insertAtCursor(msgInput, e);
      closeEmojiPopover();
      msgInput?.focus();
    });
  });
}

function openEmojiPopover(){
  if(!emojiPopover) return;
  renderEmojiPopover();
  emojiPopover.style.display = "block";
}
function closeEmojiPopover(){
  if(!emojiPopover) return;
  emojiPopover.style.display = "none";
}
function toggleEmojiPopover(){
  if(!emojiPopover) return;
  const open = emojiPopover.style.display !== "none" && emojiPopover.style.display !== "";
  if(open) closeEmojiPopover(); else openEmojiPopover();
}

function insertAtCursor(input, text){
  if(!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const v = input.value || "";
  input.value = v.slice(0, start) + text + v.slice(end);
  const p = start + text.length;
  try{ input.setSelectionRange(p, p); }catch{}
}

// Close emoji popover on outside click
document.addEventListener("click", (e)=>{
  if(!emojiPopover) return;
  const t = e.target;
  if(t === emojiBtn) return;
  if(emojiPopover.contains(t)) return;
  closeEmojiPopover();
});

// ---------- Attachments ----------
const UPLOAD_BUCKET = "support-uploads";

function setSelectedFile(file){
  selectedFile = file || null;
  renderAttachmentPreview();
}

function renderAttachmentPreview(){
  if(!attachPreview) return;
  if(!selectedFile){
    attachPreview.style.display = "none";
    attachPreview.innerHTML = "";
    return;
  }
  const name = escapeHtml(selectedFile.name || "file");
  const sizeKb = Math.round((selectedFile.size || 0) / 1024);
  attachPreview.style.display = "block";
  attachPreview.innerHTML = `
    <span class="support-attach-chip">
      📎 <span>${name}</span>
      <span style="opacity:.7;">(${sizeKb} KB)</span>
      <button class="support-attach-remove" type="button" aria-label="Remove">×</button>
    </span>
  `;
  attachPreview.querySelector(".support-attach-remove")?.addEventListener("click", ()=>{
    setSelectedFile(null);
    if(attachInput) attachInput.value = "";
  });
}

function sanitizeFileName(name){
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

async function uploadAttachment(file){
  // Basic size guard (public chat): 10MB
  const max = 10 * 1024 * 1024;
  if((file.size || 0) > max){
    throw new Error("File is too large (max 10MB)");
  }

  const safeName = sanitizeFileName(file.name);
  const pathBase = `${USER_ID}/${Date.now()}_${safeName}`;

  let path = pathBase;
  let up = await supabase.storage.from(UPLOAD_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if(up.error && String(up.error.message || "").includes("already exists")){
    path = `${USER_ID}/${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName}`;
    up = await supabase.storage.from(UPLOAD_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  }
  if(up.error) throw up.error;

  const pub = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
  const url = pub?.data?.publicUrl;
  if(!url) throw new Error("Could not get public URL");
  return { url, name: file.name };
}

async function isBlocked() {
  // blocks table (supports either `expires_at` or legacy `blocked_until`)
  const now = new Date().toISOString();

  // Preferred schema: expires_at
  let res = await supabase
    .from("blocks")
    .select("expires_at, reason")
    .eq("user_id", USER_ID)
    .gt("expires_at", now)
    .order("expires_at", { ascending: false })
    .limit(1);

  // Legacy fallback: blocked_until
  if (res.error && (String(res.error.message || "").includes("expires_at") || String(res.error.details || "").includes("expires_at"))) {
    res = await supabase
      .from("blocks")
      .select("blocked_until, reason")
      .eq("user_id", USER_ID)
      .gt("blocked_until", now)
      .order("blocked_until", { ascending: false })
      .limit(1);

    if (!res.error && res.data && res.data[0]) {
      return { expires_at: res.data[0].blocked_until, reason: res.data[0].reason };
    }
  }

  if (res.error) return null;
  return (res.data && res.data[0]) ? res.data[0] : null;
}

// ---------- Chat state ----------
let activeRoom = { type: "public", room_id: "public" }; // default
let sub = null;
let bgSub = null;

// ---------- Unread tracking ----------
const LS_PUBLIC_SEEN = "sr_support_seen_public";
function lsDmSeenKey(roomId){ return `sr_support_seen_dm_${roomId}`; }
function getSeen(key){ return localStorage.getItem(key) || ""; }
function setSeen(key, iso){ try{ localStorage.setItem(key, iso); }catch{} }

function maxIso(a, b){
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return "";
  if (!Number.isFinite(ta)) return b || "";
  if (!Number.isFinite(tb)) return a || "";
  return ta >= tb ? (a || "") : (b || "");
}

function getLatestSeenIso(type, roomId){
  if(type === "public") return getSeen(LS_PUBLIC_SEEN);
  if(type === "dm") return getSeen(lsDmSeenKey(roomId));
  return "";
}

function markRoomSeenAt(type, roomId, iso){
  const current = getLatestSeenIso(type, roomId);
  const nextIso = maxIso(current, iso || new Date().toISOString()) || new Date().toISOString();
  if(type === "public") setSeen(LS_PUBLIC_SEEN, nextIso);
  if(type === "dm") setSeen(lsDmSeenKey(roomId), nextIso);
  updateBadgesFromRecentCache();
}

function markActiveRoomSeenFromRows(rows){
  if(!Array.isArray(rows) || !rows.length) return;
  let latestIso = "";
  for(const r of rows){
    if(!isRowInActiveRoom(r)) continue;
    latestIso = maxIso(latestIso, r?.created_at || "");
  }
  if(latestIso) markRoomSeenAt(activeRoom.type, activeRoom.room_id, latestIso);
}

// On first run, avoid counting all historical messages as unread
if(!getSeen(LS_PUBLIC_SEEN)){
  setSeen(LS_PUBLIC_SEEN, new Date().toISOString());
}

function markRoomSeen(type, roomId){
  markRoomSeenAt(type, roomId, new Date().toISOString());
}

let recentCache = [];
function setFabBadge(el, count){
  if(!el) return;
  const n = Number(count||0);
  if(n > 0){
    el.textContent = String(n);
    el.classList.add("is-on");
  }else{
    el.textContent = "";
    el.classList.remove("is-on");
  }
}

function computeUnread(recentRows){
  const publicSeen = getSeen(LS_PUBLIC_SEEN);
  const publicSeenTs = publicSeen ? Date.parse(publicSeen) : 0;
  const dmByOther = new Map();
  let publicCount = 0;

  for(const r of (recentRows||[])){
    const ts = Date.parse(r.created_at || "") || 0;
    if(r.room_type === "public" && r.room_id === "public"){
      if(r.sender_id && r.sender_id !== USER_ID && ts > publicSeenTs) publicCount += 1;
    }
    if(r.room_type === "dm" && typeof r.room_id === "string" && r.room_id.includes(USER_ID)){
      // count only messages from the other side
      if(!r.sender_id || r.sender_id === USER_ID) continue;
      const key = lsDmSeenKey(r.room_id);
      const seen = getSeen(key);
      const seenTs = seen ? Date.parse(seen) : 0;
      if(ts > seenTs){
        const otherId = r.sender_id;
        dmByOther.set(otherId, (dmByOther.get(otherId) || 0) + 1);
      }
    }
  }

  let dmTotal = 0;
  for(const v of dmByOther.values()) dmTotal += v;
  return { publicCount, dmByOther, dmTotal, total: publicCount + dmTotal };
}

function updateBadgesFromRecentCache(){
  const { total, dmByOther, dmTotal } = computeUnread(recentCache);
  setFabBadge(supportBadge, total);

  // Make the Support button "light up" when there are unread private (DM) messages.
  if(supportBtn){
    if((dmTotal || 0) > 0) supportBtn.classList.add("has-private");
    else supportBtn.classList.remove("has-private");
  }

  // per-user unread badges
  usersList?.querySelectorAll(".support-user").forEach(btn=>{
    const uid = btn.getAttribute("data-user-id");
    const badge = btn.querySelector(".support-user-unread");
    if(!badge) return;
    if(!uid || uid === USER_ID){
      badge.textContent = "";
      badge.classList.remove("is-on");
      return;
    }
    const c = dmByOther.get(uid) || 0;
    badge.textContent = String(c);
    if(c>0) badge.classList.add("is-on"); else badge.classList.remove("is-on");
  });
}

function roomKeyForDm(otherUserId) {
  const a = USER_ID;
  const b = otherUserId;
  return (a < b) ? `${a}__${b}` : `${b}__${a}`;
}

function setRoomPublic() {
  activeRoom = { type: "public", room_id: "public" };
  chatTitle.textContent = "Team Support";
  chatSubtitle.textContent = "Public chat";
  chatBackBtn.style.display = "none";
  // Viewing the public room marks it as read
  markRoomSeen("public", "public");
}

function setRoomDm(other) {
  activeRoom = { type: "dm", room_id: roomKeyForDm(other.user_id), other };
  chatTitle.textContent = `Chat with ${other.sender_name || "User"}`;
  chatSubtitle.textContent = "Private chat";
  chatBackBtn.style.display = "inline-flex";
  // Viewing this DM room marks it as read
  markRoomSeen("dm", activeRoom.room_id);
}

// ---------- Data loading ----------
async function loadUsers() {
  // Always keep a small cache of recent rows for unread counters.
  // This is separate from the user list source.
  let recentRows = [];
  try {
    const res = await supabase
      .from("support_messages")
      .select("sender_id, sender_name, room_type, room_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!res.error && Array.isArray(res.data)) {
      recentRows = res.data;
      recentCache = res.data;
    }
  } catch {}

  // Preferred source: `support_users` profiles (allows admin to delete names)
  const profileOk = await detectProfileTable();
  if (profileOk) {
    try {
      const res = await supabase
        .from("support_users")
        .select("user_id, display_name")
        .order("display_name", { ascending: true })
        .limit(500);

      if (!res.error && Array.isArray(res.data)) {
        const map = new Map();
        for (const r of res.data) {
          if (!r || !r.user_id) continue;
          map.set(String(r.user_id), String(r.display_name || "User"));
        }
        // Ensure current user appears
        map.set(USER_ID, getUserName() || map.get(USER_ID) || "Me");

        const items = Array.from(map.entries()).map(([sender_id, sender_name]) => ({ sender_id, sender_name }));
        items.sort((x, y) => (x.sender_name || "").localeCompare(y.sender_name || ""));

        usersList.innerHTML = items
          .map((u) => {
            const isMe = u.sender_id === USER_ID;
            const col = colorForUserId(u.sender_id);
            return `
              <button class="support-user ${isMe ? "me" : ""}" data-user-id="${escapeHtml(u.sender_id)}" type="button" style="--u:${escapeHtml(col)}">
                <span class="support-user-dot" aria-hidden="true"></span>
                <span class="support-user-name">${escapeHtml(u.sender_name || "User")}</span>
                ${isMe ? '<span class="support-user-badge">You</span>' : '<span class="support-user-unread" aria-hidden="true"></span>'}
              </button>
            `;
          })
          .join("");

        updateBadgesFromRecentCache();

        usersList.querySelectorAll("button.support-user").forEach((btn) => {
          btn.addEventListener("click", () => {
            const uid = btn.getAttribute("data-user-id");
            if (!uid || uid === USER_ID) return;
            const name = btn.querySelector(".support-user-name")?.textContent || "User";
            setRoomDm({ user_id: uid, sender_name: name });
            refreshRoom();
          });
        });
        return;
      }
    } catch (e) {
      console.warn("support_users load failed", e);
    }
  }

  // Legacy fallback: derive unique names from recent messages (public + dm)
  const seen = new Map();
  for (const r of recentRows || []) {
    if (!r || !r.sender_id) continue;
    if (!seen.has(r.sender_id)) seen.set(r.sender_id, r.sender_name || "User");
  }
  seen.set(USER_ID, getUserName() || "Me");

  const items = Array.from(seen.entries()).map(([sender_id, sender_name]) => ({ sender_id, sender_name }));
  items.sort((x, y) => (x.sender_name || "").localeCompare(y.sender_name || ""));

  usersList.innerHTML = items
    .map((u) => {
      const isMe = u.sender_id === USER_ID;
      const col = colorForUserId(u.sender_id);
      return `
        <button class="support-user ${isMe ? "me" : ""}" data-user-id="${escapeHtml(u.sender_id)}" type="button" style="--u:${escapeHtml(col)}">
          <span class="support-user-dot" aria-hidden="true"></span>
          <span class="support-user-name">${escapeHtml(u.sender_name || "User")}</span>
          ${isMe ? '<span class="support-user-badge">You</span>' : '<span class="support-user-unread" aria-hidden="true"></span>'}
        </button>
      `;
    })
    .join("");

  updateBadgesFromRecentCache();

  usersList.querySelectorAll("button.support-user").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.getAttribute("data-user-id");
      if (!uid || uid === USER_ID) return;
      const name = btn.querySelector(".support-user-name")?.textContent || "User";
      setRoomDm({ user_id: uid, sender_name: name });
      refreshRoom();
    });
  });
}

function isPublicRoomRow(m) {
  return String(m?.room_type || "public") === "public";
}

function isRowInActiveRoom(m) {
  if (!m) return false;
  if (activeRoom.type === "public") return isPublicRoomRow(m);
  return String(m.room_type || "") === activeRoom.type && String(m.room_id || "") === String(activeRoom.room_id || "");
}

function renderSupportMessageRow(m) {
  const mine = m.sender_id === USER_ID;
  const bundle = colorBundleForUserId(m.sender_id || m.sender_name || "");
  const safeId = m.id == null ? "" : escapeHtml(String(m.id));
  return `
      <div class="support-msg ${mine ? "mine" : ""}" style="--u:${escapeHtml(bundle.accent)};--ubg:${escapeHtml(bundle.bg)};--uborder:${escapeHtml(bundle.border)}">
        <div class="support-msg-meta">
          <span class="support-msg-dot" aria-hidden="true"></span>
          <span class="support-msg-name">${escapeHtml(m.sender_name || "User")}</span>
          <span class="support-msg-time">${escapeHtml(fmtTime(m.created_at))}</span>
          ${mine && safeId && !String(safeId).startsWith("local-") ? `<button class="support-del-btn" data-id="${safeId}" title="Delete">🗑️</button>` : ""}
        </div>
        ${renderMessageHtml(m)}
      </div>
    `;
}

function appendSupportMessage(m) {
  if (!messagesList || !m) return;
  messagesList.insertAdjacentHTML("beforeend", renderSupportMessageRow(m));
  bindDeleteButtons();
  messagesList.scrollTop = messagesList.scrollHeight;
}

async function loadMessages() {
  let query = supabase
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(300);

  if (activeRoom.type !== "public") {
    query = query.eq("room_type", activeRoom.type).eq("room_id", activeRoom.room_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    setStatus(`Could not load messages. Please contact ${ADMIN_NAME}.`, "error");
    return;
  }

  const rows = (data || []).filter((m) => activeRoom.type === "public" ? isPublicRoomRow(m) : true);
  messagesList.innerHTML = rows.map(renderSupportMessageRow).join("");

  // scroll to bottom
  bindDeleteButtons();
  messagesList.scrollTop = messagesList.scrollHeight;
}


async function deleteOwnMessage(messageId, triggerBtn){
  if(!messageId) return;
  const blocked = await isBlocked();
  if (blocked) {
    setStatus(`You are blocked until ${fmtTime(blocked.expires_at)}. Please contact ${ADMIN_NAME}.`, "error");
    return;
  }

  const row = triggerBtn?.closest?.(".support-msg") || messagesList.querySelector(`button.support-del-btn[data-id="${String(messageId)}"]`)?.closest?.(".support-msg");
  const ok = confirm("Delete this message?");
  if(!ok) return;

  const previousBtnHtml = triggerBtn ? triggerBtn.innerHTML : "";
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = "…";
    triggerBtn.setAttribute("aria-busy", "true");
  }
  if (row) {
    row.style.opacity = "0.55";
    row.style.pointerEvents = "none";
  }

  try{
    setStatus("Deleting…", "info");
    const res = await fetch((await resolveFnBase()) + "/user-delete-support-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: messageId, user_id: USER_ID })
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data?.error || "Delete failed");

    if (row) {
      row.style.transition = "opacity .18s ease, transform .18s ease, max-height .2s ease, margin .2s ease";
      row.style.transform = "translateX(8px)";
      row.style.maxHeight = row.offsetHeight + "px";
      requestAnimationFrame(() => {
        row.style.opacity = "0";
        row.style.maxHeight = "0px";
        row.style.margin = "0";
      });
      setTimeout(() => {
        if (row.parentNode) row.parentNode.removeChild(row);
        messagesList.scrollTop = messagesList.scrollHeight;
      }, 220);
    }

    setStatus("Message deleted.", "success");
    setTimeout(() => {
      if ((statusEl?.textContent || "").trim() === "Message deleted.") setStatus("");
    }, 1400);
    await loadUsers();
  }catch(err){
    console.error(err);
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = previousBtnHtml || "🗑️";
      triggerBtn.removeAttribute("aria-busy");
    }
    if (row) {
      row.style.opacity = "";
      row.style.pointerEvents = "";
      row.style.transform = "";
      row.style.maxHeight = "";
      row.style.margin = "";
    }
    const msg = String(err?.message || "");
    if (/not found/i.test(msg)) {
      setStatus("This message was already removed.", "info");
      await loadMessages();
      await loadUsers();
      return;
    }
    setStatus(msg || `Could not delete. Please contact ${ADMIN_NAME}.`, "error");
  }
}

function bindDeleteButtons(){
  messagesList.querySelectorAll("button.support-del-btn").forEach(btn=>{
    if(btn.dataset.bound==="1") return;
    btn.dataset.bound="1";
    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      deleteOwnMessage(btn.dataset.id, btn);
    });
  });
}

function subscribeRoom() {
  if (sub) {
    try { supabase.removeChannel(sub); } catch {}
    sub = null;
  }

  sub = supabase
    .channel(`support_changes`)
    .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, (payload) => {
      const rowNew = payload?.new || {};
      const rowOld = payload?.old || {};
      const row = Object.keys(rowNew).length ? rowNew : rowOld;
      if (isRowInActiveRoom(row)) {
        loadMessages();
      }
      loadUsers();
    })
    .subscribe();
}

// Background listener to keep unread badges updated even when the Support modal is closed.
function subscribeBackground(){
  if(bgSub) return;
  bgSub = supabase
    .channel("support_unread")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload)=>{
      const row = payload?.new || {};
      // Gentle notification sound for incoming messages (not your own).
      try {
        const fromId = row?.sender_id || row?.user_id || "";
        if(fromId && fromId !== USER_ID) playSoftNotification();
      } catch {}
      if(row && Object.keys(row).length){
        recentCache = [row, ...recentCache].slice(0, 500);
      }

      // If the chat is open and we're currently viewing this room, mark it as read.
      const isChatOpen = chatOverlay?.style.display !== "none";
      if(isChatOpen && isRowInActiveRoom(row)){
        markRoomSeenAt(activeRoom.type, activeRoom.room_id, row.created_at || new Date().toISOString());
        loadMessages();
      }

      // Keep names list fresh when open (so new users appear)
      if(isChatOpen) loadUsers();

      updateBadgesFromRecentCache();
    })
    .subscribe();
}

async function refreshRoom() {
  setStatus("");
  await loadUsers();
  await loadMessages();
  subscribeRoom();
}


// ---------- Sending ----------
async function sendMessage() {
  const name = getUserName();
  const text = (msgInput.value || "").trim();
  if (!text && !selectedFile) return;

  const blocked = await isBlocked();
  if (blocked) {
    setStatus(`You are blocked until ${fmtTime(blocked.expires_at)}. Please contact ${ADMIN_NAME}.`, "error");
    return;
  }

  sendBtn.disabled = true;

  let finalText = text;
  try{
    if(selectedFile){
      setStatus("Uploading attachment…", "info");
      const up = await uploadAttachment(selectedFile);
      const marker = `Attachment: ${up.name}`;
      // Store as plain text (safe + compatible). Renderer will present it as a nice clickable link.
      finalText = (finalText ? (finalText + "\n") : "") + marker + "\n" + up.url;
    }
  }catch(err){
    console.error(err);
    setStatus(String(err?.message || "Could not upload attachment. Please contact Admin."), "error");
    sendBtn.disabled = false;
    return;
  }

  setStatus("Sending…", "info");

  const payload = {
    sender_id: USER_ID,
    // Some DB setups enforce NOT NULL on `user_id` (legacy schema).
    // Sending it ensures inserts succeed and also supports admin blocking.
    user_id: USER_ID,
    sender_name: name || "Anonymous",
    message: finalText,
    room_type: activeRoom.type,
    room_id: activeRoom.room_id,
  };

  const { data: insertedRows, error } = await supabase
    .from("support_messages")
    .insert(payload)
    .select("*");

  sendBtn.disabled = false;

  if (error) {
    console.error(error);
    setStatus(`Could not send your message. Please contact ${ADMIN_NAME}.`, "error");
    return;
  }

  msgInput.value = "";
  setSelectedFile(null);
  if(attachInput) attachInput.value = "";

  // Show immediately inside Support, even when Realtime is delayed/disabled.
  const inserted = Array.isArray(insertedRows) && insertedRows[0] ? insertedRows[0] : null;
  appendSupportMessage(inserted || {
    ...payload,
    id: `local-${Date.now()}`,
    created_at: new Date().toISOString(),
  });
  markRoomSeen(activeRoom.type, activeRoom.room_id);
  setStatus("");

  // Then reload from Supabase so the local temporary row is replaced by the real saved row.
  try {
    await loadMessages();
    await loadUsers();
  } catch (refreshErr) {
    console.warn("support refresh after send failed", refreshErr);
  }
}

// ---------- UI wiring ----------
async function openSupport() {
  try { unlockSound(); } catch {}

  // If the optional `support_users` table exists, use it as the source of truth
  // for whether this user currently has a name (admin can delete names).
  const okProfiles = await detectProfileTable();
  if (okProfiles) {
    const dbName = await fetchProfileName();
    if (dbName) {
      setUserName(dbName);
    } else {
      // Admin may have removed the name (or first time) → force choosing again.
      try { localStorage.removeItem("sr_tool_user_name"); } catch {}
    }
  }

  // If no name, ask first
  const name = getUserName();
  if (!name) {
    nameInput.value = "";
    show(nameOverlay);
    setTimeout(() => nameInput.focus(), 50);
    return;
  }

  // Keep profile updated (best-effort; does not block UI)
  upsertProfileName(name).catch(()=>{});

  show(chatOverlay);
  setRoomPublic();
  refreshRoom();
}

function closeAll() {
  hide(nameOverlay);
  hide(chatOverlay);
  setStatus("");
}

supportBtn?.addEventListener("click", openSupport);

nameConfirmBtn?.addEventListener("click", async () => {
  const name = (nameInput.value || "").trim();
  if (!name) return;
  setUserName(name);
  // Save to DB profile if enabled (admin can delete these rows later)
  try { await upsertProfileName(name); } catch {}
  hide(nameOverlay);
  show(chatOverlay);
  setRoomPublic();
  refreshRoom();
});

nameCloseBtn?.addEventListener("click", closeAll);
chatCloseBtn?.addEventListener("click", closeAll);

chatBackBtn?.addEventListener("click", () => {
  setRoomPublic();
  refreshRoom();
});

// Close on overlay click
[nameOverlay, chatOverlay].forEach(ov => {
  ov?.addEventListener("click", (e) => {
    if (e.target === ov) closeAll();
  });
});

// ESC to close
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (nameOverlay.style.display !== "none" || chatOverlay.style.display !== "none") closeAll();
  }
});

sendBtn?.addEventListener("click", sendMessage);
msgInput?.addEventListener("keydown", (e) => {
  // Textarea UX: Enter sends, Shift+Enter inserts newline
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Emoji + attachments wiring
emojiBtn?.addEventListener("click", (e)=>{
  e.preventDefault();
  e.stopPropagation();
  toggleEmojiPopover();
});

attachBtn?.addEventListener("click", (e)=>{
  e.preventDefault();
  attachInput?.click();
});

attachInput?.addEventListener("change", ()=>{
  const f = attachInput.files && attachInput.files[0];
  if(!f) return;
  setSelectedFile(f);
});

window.addEventListener("storage", (e) => {
  if (!e?.key) return;
  if (e.key === LS_PUBLIC_SEEN || e.key.startsWith("sr_support_seen_dm_")) {
    updateBadgesFromRecentCache();
  }
});

// Initial status cleanup
setStatus("");

// Initialize unread badges immediately (without opening the Support UI)
loadUsers();
subscribeBackground();