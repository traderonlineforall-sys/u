
import { supabase } from "./supabase-client.js";
import { ADMIN_NAME } from "./supabase-config.js";
import { getStableUserId, getStoredUserName, setStoredUserName, clearStoredUserName, requireNicknameLogin } from "./stable-user-identity.js";
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
    let res = await supabase
      .from("support_users")
      .select("display_name,nickname_reset_required")
      .eq("user_id", USER_ID)
      .limit(1);

    if (res.error && /nickname_reset_required|column .*does not exist|schema cache/i.test(String(res.error.message || ""))) {
      res = await supabase
        .from("support_users")
        .select("display_name")
        .eq("user_id", USER_ID)
        .limit(1);
    }

    if (res.error) return null;
    const row = res.data && res.data[0] ? res.data[0] : null;
    if(!row || row.nickname_reset_required) return null;
    return row.display_name || null;
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
    const res = await fetch("/api/support-profile", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, display_name: safe }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(data?.error || "support profile update failed");
  } catch (e) {
    // If the table is not properly configured, don't break the chat.
    console.warn("support_users upsert failed", e);
  }
}


async function ensureNicknameReady() {
  const localName = getUserName();
  const okProfiles = await detectProfileTable();
  if (okProfiles) {
    const dbName = await fetchProfileName();
    if (dbName) {
      setUserName(dbName);
      return true;
    }
    clearStoredUserName();
    return false;
  }
  return !!localName;
}

function redirectToNicknameLogin() {
  try { requireNicknameLogin(); }
  catch { location.href = "/login?nickname=1"; }
}

// ---------- Helpers ----------
function escapeHtml(s = "") {
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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


function isMissingColumnError(error){
  const msg = String(error?.message || "") + " " + String(error?.details || "");
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || /Could not find|does not exist|column .* does not exist|schema cache/i.test(msg);
}

function normalizeSupportRow(row){
  const r = row && typeof row === "object" ? { ...row } : {};
  const userId = String(r.user_id || r.sender_id || "");
  const senderId = String(r.sender_id || r.user_id || userId || "");
  return {
    ...r,
    user_id: userId || senderId,
    sender_id: senderId || userId,
    sender_name: String(r.sender_name || r.name || r.display_name || "User"),
    message: String(r.message || r.text || ""),
    room_type: String(r.room_type || "public"),
    room_id: String(r.room_id || "public"),
    created_at: r.created_at || new Date().toISOString(),
  };
}

async function fetchSupportMessagesApi(params){
  const qs = new URLSearchParams(params || {});
  const res = await fetch((await resolveFnBase()) + "/support-messages?" + qs.toString(), {
    method: "GET",
    credentials: "same-origin",
    headers: { "accept": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok || !data?.ok) throw new Error(data?.error || "Could not load support messages.");
  return {
    rows: Array.isArray(data.rows) ? data.rows.map(normalizeSupportRow) : [],
    interactions: data?.interactions && typeof data.interactions === "object" ? data.interactions : {},
    interactionsAvailable: data?.interactions_available === true,
  };
}

const SUPPORT_REACTIONS = [
  ["like", "👍", "Like"],
  ["love", "❤️", "Love"],
  ["laugh", "😂", "Laugh"],
  ["angry", "😡", "Angry"],
  ["sad", "😢", "Sad"],
  ["dislike", "👎", "Dislike"],
];
let supportInteractions = Object.create(null);
let supportInteractionsAvailable = false;
let visibleMessageRows = [];
const reportedReadIds = new Set();
const pendingReadIds = new Set();
let readReceiptTimer = null;
let readVisibilityFrame = 0;

function emptySupportInteraction(){
  return {
    reactions: {
      counts:{ like:0, love:0, laugh:0, angry:0, sad:0, dislike:0 },
      users:{ like:[], love:[], laugh:[], angry:[], sad:[], dislike:[] },
      mine:"",
    },
    readers:[],
    read_count:0,
  };
}

function interactionForMessage(id){
  return supportInteractions[String(id || "")] || emptySupportInteraction();
}

function supportInteractionSignature(id){
  if(!supportInteractionsAvailable || !id) return "";
  try { return JSON.stringify(interactionForMessage(id)); }
  catch { return ""; }
}

function mergeSupportInteractions(next){
  if(!next || typeof next !== "object") return;
  for(const [id, value] of Object.entries(next)){
    supportInteractions[String(id)] = value;
  }
}

async function postSupportInteraction(body){
  const res = await fetch("/api/support-message-interactions", {
    method:"POST",
    credentials:"same-origin",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data?.error || "Support interaction failed.");
  if(data?.available === false){
    supportInteractionsAvailable = false;
    return data;
  }
  supportInteractionsAvailable = true;
  mergeSupportInteractions(data?.interactions);
  return data;
}

let interactionsLoadInFlight = false;
let lastInteractionsLoadAt = 0;

async function refreshSupportInteractions(rows, force = false){
  const ids = (rows || [])
    .map((row) => Number(row?.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .slice(0, 300);
  if(!ids.length || interactionsLoadInFlight) return;
  const now = Date.now();
  if(!force && now - lastInteractionsLoadAt < 3500) return;
  lastInteractionsLoadAt = now;
  interactionsLoadInFlight = true;
  try{
    const before = JSON.stringify(supportInteractions);
    const result = await postSupportInteraction({ action:"list", message_ids:ids });
    if(result?.available === false){
      supportInteractions = Object.create(null);
    }else{
      supportInteractions = Object.assign(Object.create(null), result?.interactions || {});
      queueSupportReadReceipts(rows);
    }
    if(before !== JSON.stringify(supportInteractions)){
      refreshRenderedSupportInteractions();
    }
  }catch(error){
    console.warn("support interactions refresh failed", error);
  }finally{
    interactionsLoadInFlight = false;
  }
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

function renderSupportReactionSummary(messageId){
  const current = interactionForMessage(messageId)?.reactions || {};
  const counts = current.counts || {};
  const users = current.users || {};
  const mine = String(current.mine || "");
  return SUPPORT_REACTIONS
    .filter(([key]) => Number(counts[key] || 0) > 0)
    .map(([key, icon, label]) => {
      const names = Array.isArray(users[key]) ? users[key].slice(0, 20) : [];
      const title = names.length ? names.join(", ") : label;
      return `<button type="button" class="support-reaction-badge ${mine === key ? "mine" : ""}" data-message-id="${escapeHtml(messageId)}" data-reaction="${escapeHtml(key)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(label)}: ${Number(counts[key] || 0)}"><span aria-hidden="true">${icon}</span><span>${Number(counts[key] || 0)}</span></button>`;
    })
    .join("");
}

function renderSupportReaders(messageId){
  const readers = Array.isArray(interactionForMessage(messageId)?.readers)
    ? interactionForMessage(messageId).readers
    : [];
  if(!readers.length){
    return `<div class="support-readers-empty">No readers yet.</div>`;
  }
  return readers.map((reader) => {
    const when = reader?.read_at ? fmtTime(reader.read_at) : "";
    return `<div class="support-reader" title="${escapeHtml(when)}"><span>${escapeHtml(reader?.name || "User")}</span></div>`;
  }).join("");
}

function renderSupportMessageInteractions(row){
  const id = row?.id == null ? "" : String(row.id);
  if(!supportInteractionsAvailable || !id || id.startsWith("local-")) return "";
  const current = interactionForMessage(id);
  const count = Number(current?.read_count || current?.readers?.length || 0);
  return `
    <div class="support-msg-interactions">
      <div class="support-reaction-summary">${renderSupportReactionSummary(id)}</div>
      <div class="support-msg-tools">
        <button type="button" class="support-msg-action support-react-open" data-message-id="${escapeHtml(id)}" title="React" aria-label="React to message">☺</button>
        <button type="button" class="support-msg-action support-readers-open" data-message-id="${escapeHtml(id)}" title="Show readers" aria-label="Show readers">
          <span aria-hidden="true">◉</span><span>${count}</span>
        </button>
        <div class="support-readers-popover" hidden>
          <div class="support-readers-title">Read by ${count}</div>
          ${renderSupportReaders(id)}
        </div>
      </div>
    </div>
  `;
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

  if(type === "public") {
    setSeen(LS_PUBLIC_SEEN, nextIso);

    // إزالة الرسائل العامة المقروءة من الكاش
    recentCache = recentCache.filter(msg => {
      const room = msg.room_id || msg.roomId || "public";
      return room !== "public";
    });
  }

  if(type === "dm") {
    setSeen(lsDmSeenKey(roomId), nextIso);

    // إزالة رسائل الـ DM الخاصة بالغرفة المقروءة
    recentCache = recentCache.filter(msg => {
      const room = msg.room_id || msg.roomId;
      return room !== roomId;
    });
  }

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

// ===== STEP 6.2 STABLE SUPPORT UI HELPERS START =====
let lastSupportListSignature = "";
let loadUsersTimer = null;
let seenFlushTimer = null;

function supportMessageDomId(row) {
  const r = normalizeSupportRow(row || {});
  return r.id == null ? "" : String(r.id);
}

function supportMessageFallbackKey(row) {
  const r = normalizeSupportRow(row || {});
  return [
    String(r.sender_id || r.user_id || ""),
    String(r.created_at || ""),
    String(r.message || "").slice(0, 160),
  ].join("|");
}

function supportRowSignature(row) {
  const r = normalizeSupportRow(row || {});
  return [
    supportMessageDomId(r) || supportMessageFallbackKey(r),
    String(r.sender_name || ""),
    String(r.message || ""),
    String(r.room_type || ""),
    String(r.room_id || ""),
    String(r.created_at || ""),
    supportInteractionSignature(r.id),
  ].join("¦");
}

function supportListSignature(rows) {
  return (rows || []).map(supportRowSignature).join("\n");
}

function isSupportChatOpen() {
  return !!chatOverlay && chatOverlay.style.display !== "none";
}

function isNearSupportBottom(px = 140) {
  if (!messagesList) return true;
  const distance = messagesList.scrollHeight - messagesList.clientHeight - messagesList.scrollTop;
  return distance <= px;
}

function smartSupportScroll(force = false) {
  if (!messagesList) return;
  if (!force && !isNearSupportBottom()) return;
  const go = () => {
    try { messagesList.scrollTop = messagesList.scrollHeight; } catch {}
  };
  go();
  requestAnimationFrame(go);
}

function keepSupportScrollStable(mutator, opts = {}) {
  if (!messagesList) {
    mutator?.();
    return;
  }
  const forceBottom = !!opts.forceBottom;
  const wasNearBottom = forceBottom || isNearSupportBottom();
  const bottomOffset = messagesList.scrollHeight - messagesList.scrollTop;
  mutator?.();
  if (wasNearBottom) {
    smartSupportScroll(true);
  } else {
    requestAnimationFrame(() => {
      try { messagesList.scrollTop = Math.max(0, messagesList.scrollHeight - bottomOffset); } catch {}
    });
  }
}

function renderStableMessageList(rows, opts = {}) {
  const visibleRows = Array.isArray(rows) ? rows : [];
  visibleMessageRows = visibleRows;
  const signature = supportListSignature(visibleRows);
  if (signature === lastSupportListSignature) {
    bindDeleteButtons();
    if (opts.forceBottom) smartSupportScroll(true);
    return false;
  }
  keepSupportScrollStable(() => {
    messagesList.innerHTML = visibleRows.map(renderSupportMessageRow).join("");
    lastSupportListSignature = signature;
  }, { forceBottom: !!opts.forceBottom });
  bindDeleteButtons();
  return true;
}

function queueLoadUsers(delay = 180) {
  if (loadUsersTimer) clearTimeout(loadUsersTimer);
  loadUsersTimer = setTimeout(() => {
    loadUsersTimer = null;
    loadUsers().catch((err) => console.warn("support users refresh failed", err));
  }, delay);
}

function markActiveRoomSeenFromCache() {
  if (!Array.isArray(recentCache) || !recentCache.length) {
    updateBadgesFromRecentCache();
    return;
  }
  let latestIso = "";
  for (const raw of recentCache) {
    const r = normalizeSupportRow(raw);
    if (!isRowInActiveRoom(r)) continue;
    latestIso = maxIso(latestIso, r.created_at || "");
  }
  if (latestIso) markRoomSeenAt(activeRoom.type, activeRoom.room_id, latestIso);
  else updateBadgesFromRecentCache();
}

function flushSeenForOpenRoom() {
  if (!isSupportChatOpen()) return;
  markActiveRoomSeenFromCache();
}

function scheduleSeenFlush() {
  if (seenFlushTimer) clearTimeout(seenFlushTimer);
  flushSeenForOpenRoom();
  seenFlushTimer = setTimeout(() => {
    seenFlushTimer = null;
    flushSeenForOpenRoom();
  }, 260);
}

function dropRecentMessageById(id) {
  if (id == null) return;
  const sid = String(id);
  const before = recentCache.length;
  recentCache = recentCache.filter((r) => supportMessageDomId(r) !== sid);
  if (recentCache.length !== before) updateBadgesFromRecentCache();
}

function forceSupportMessagesBottom() {
  smartSupportScroll(true);
}
// ===== STEP 6.2 STABLE SUPPORT UI HELPERS END =====

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

  for(const raw of (recentRows||[])){
    const r = normalizeSupportRow(raw);
    const ts = Date.parse(r.created_at || "") || 0;
    const roomId = String(r.room_id || "public");
    const fromId = String(r.sender_id || r.user_id || "");

    if(isPublicRoomRow(r)){
      if(fromId && fromId !== USER_ID && ts > publicSeenTs) publicCount += 1;
      continue;
    }

    if(isExplicitDmRow(r) && roomId.includes(USER_ID)){
      if(!fromId || fromId === USER_ID) continue;
      const key = lsDmSeenKey(roomId);
      const seen = getSeen(key);
      const seenTs = seen ? Date.parse(seen) : 0;
      if(ts > seenTs){
        dmByOther.set(fromId, (dmByOther.get(fromId) || 0) + 1);
      }
    }
  }

  let dmTotal = 0;
  for(const v of dmByOther.values()) dmTotal += v;
  return { publicCount, dmByOther, dmTotal, total: publicCount + dmTotal };
}

function updateBadgesFromRecentCache() {
  const { total, dmByOther, dmTotal } = computeUnread(recentCache);

  // لو مفيش أى رسائل غير مقروءة امسح كل الإشعارات نهائياً
  if (total <= 0) {
    setFabBadge(supportBadge, 0);

    if (supportBtn) {
      supportBtn.classList.remove("has-private");
    }

    usersList?.querySelectorAll(".support-user").forEach(btn => {
      const badge = btn.querySelector(".support-user-unread");
      if (!badge) return;

      badge.textContent = "";
      badge.classList.remove("is-on");
    });

    return;
  }

  setFabBadge(supportBadge, total);

  // تشغيل إضاءة زر الدعم فقط لو فيه DM غير مقروء
  if (supportBtn) {
    if ((dmTotal || 0) > 0)
      supportBtn.classList.add("has-private");
    else
      supportBtn.classList.remove("has-private");
  }

  // تحديث إشعارات كل مستخدم
  usersList?.querySelectorAll(".support-user").forEach(btn => {
    const uid = btn.getAttribute("data-user-id");
    const badge = btn.querySelector(".support-user-unread");

    if (!badge) return;

    if (!uid || uid === USER_ID) {
      badge.textContent = "";
      badge.classList.remove("is-on");
      return;
    }

    const c = dmByOther.get(uid) || 0;

    if (c > 0) {
      badge.textContent = String(c);
      badge.classList.add("is-on");
    } else {
      badge.textContent = "";
      badge.classList.remove("is-on");
    }
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
  markRoomSeen("public", "public");
  scheduleSeenFlush();
}

function setRoomDm(other) {
  activeRoom = { type: "dm", room_id: roomKeyForDm(other.user_id), other };
  chatTitle.textContent = `Chat with ${other.sender_name || "User"}`;
  chatSubtitle.textContent = "Private chat";
  chatBackBtn.style.display = "inline-flex";
  markRoomSeen("dm", activeRoom.room_id);
  scheduleSeenFlush();
}

// ---------- Data loading ----------
async function loadUsers() {
  // Always keep a small cache of recent rows for unread counters.
  // This is separate from the user list source.
  let recentRows = [];
  try {
    const recentPayload = await fetchSupportMessagesApi({ mode: "recent", limit: "500" });
    recentRows = recentPayload.rows;
    recentCache = recentRows;
  } catch (apiErr) {
    console.warn("authenticated support recent load failed", apiErr);
    recentCache = [];
  }

  // Preferred source: `support_users` profiles (allows admin to delete names)
  const profileOk = await detectProfileTable();
  if (profileOk) {
    try {
      let res = await supabase
        .from("support_users")
        .select("user_id, display_name, nickname_reset_required")
        .order("display_name", { ascending: true })
        .limit(500);

      if (res.error && /nickname_reset_required|column .*does not exist|schema cache/i.test(String(res.error.message || ""))) {
        res = await supabase
          .from("support_users")
          .select("user_id, display_name")
          .order("display_name", { ascending: true })
          .limit(500);
      }

      if (!res.error && Array.isArray(res.data)) {
        const map = new Map();
        for (const r of res.data) {
          if (!r || !r.user_id || r.nickname_reset_required) continue;
          const dn = String(r.display_name || "").trim();
          if(!dn) continue;
          map.set(String(r.user_id), dn);
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

function isExplicitDmRow(m) {
  const r = normalizeSupportRow(m);
  const roomType = String(r.room_type || "public").trim().toLowerCase();
  const roomId = String(r.room_id || "public").trim();
  // Old/public rows may not have room columns at all. Treat every non-explicit-DM
  // row as public so users see the same saved messages that the admin panel sees.
  return roomType === "dm" || (!!roomId && roomId !== "public" && roomId.includes("__"));
}

function isPublicRoomRow(m) {
  return !isExplicitDmRow(m);
}

function isRowInActiveRoom(m) {
  if (!m) return false;
  const r = normalizeSupportRow(m);
  if (activeRoom.type === "public") return isPublicRoomRow(r);
  return String(r.room_type || "") === activeRoom.type && String(r.room_id || "") === String(activeRoom.room_id || "");
}

function renderSupportMessageRow(m) {
  const row = normalizeSupportRow(m);
  const senderId = String(row.sender_id || row.user_id || "");
  const mine = senderId === USER_ID;
  const bundle = colorBundleForUserId(senderId || row.sender_name || "");
  const safeId = row.id == null ? "" : escapeHtml(String(row.id));
  return `
      <div class="support-msg ${mine ? "mine" : ""}" data-support-msg-id="${safeId}" data-sender-id="${escapeHtml(senderId)}" tabindex="0" style="--u:${escapeHtml(bundle.accent)};--ubg:${escapeHtml(bundle.bg)};--uborder:${escapeHtml(bundle.border)}">
        <div class="support-msg-meta">
          <span class="support-msg-dot" aria-hidden="true"></span>
          <span class="support-msg-name">${escapeHtml(row.sender_name || "User")}</span>
          <span class="support-msg-time">${escapeHtml(fmtTime(row.created_at))}</span>
          ${mine && safeId && !String(safeId).startsWith("local-") ? `<button class="support-del-btn" data-id="${safeId}" title="Delete">🗑️</button>` : ""}
        </div>
        ${renderMessageHtml(row)}
        ${renderSupportMessageInteractions(row)}
      </div>
    `;
}

function findSupportMessageElById(id) {
  const sid = String(id || "");
  if (!sid || !messagesList) return null;
  return Array.from(messagesList.querySelectorAll(".support-msg")).find((el) => el?.dataset?.supportMsgId === sid) || null;
}

function removeSupportMessageById(id, opts = {}) {
  const el = findSupportMessageElById(id);
  if (!el || !el.parentNode) {
    dropRecentMessageById(id);
    return;
  }
  keepSupportScrollStable(() => {
    el.parentNode.removeChild(el);
    lastSupportListSignature = "";
    dropRecentMessageById(id);
  }, { forceBottom: !!opts.forceBottom });
}

function replaceSupportMessageById(id, row, opts = {}) {
  const el = findSupportMessageElById(id);
  if (!el || !row) return false;
  const r = normalizeSupportRow(row);
  const forceBottom = !!opts.forceBottom || String(r.sender_id || r.user_id || "") === USER_ID;
  keepSupportScrollStable(() => {
    el.outerHTML = renderSupportMessageRow(r);
    lastSupportListSignature = "";
    dropRecentMessageById(id);
    recentCache = [r, ...recentCache.filter((x) => supportRowSignature(x) !== supportRowSignature(r))].slice(0, 500);
  }, { forceBottom });
  bindDeleteButtons();
  if (isSupportChatOpen() && isRowInActiveRoom(r)) markRoomSeenAt(activeRoom.type, activeRoom.room_id, r.created_at || new Date().toISOString());
  else updateBadgesFromRecentCache();
  return true;
}

function appendSupportMessage(m, opts = {}) {
  if (!messagesList || !m) return;
  const row = normalizeSupportRow(m);
  const id = supportMessageDomId(row);
  if (id && findSupportMessageElById(id)) {
    replaceSupportMessageById(id, row, opts);
    return;
  }
  const forceBottom = !!opts.forceBottom || String(row.sender_id || row.user_id || "") === USER_ID;
  keepSupportScrollStable(() => {
    messagesList.querySelectorAll(".srux-empty-state").forEach((e) => e.remove());
    messagesList.insertAdjacentHTML("beforeend", renderSupportMessageRow(row));
    lastSupportListSignature = "";
    recentCache = [row, ...recentCache.filter((x) => supportRowSignature(x) !== supportRowSignature(row))].slice(0, 500);
  }, { forceBottom });
  bindDeleteButtons();
  if (isSupportChatOpen() && isRowInActiveRoom(row)) markRoomSeenAt(activeRoom.type, activeRoom.room_id, row.created_at || new Date().toISOString());
  else updateBadgesFromRecentCache();
}

function queueSupportReadReceipts(rows){
  if(!supportInteractionsAvailable) return;
  const listRect = messagesList?.getBoundingClientRect?.();
  const messageElements = new Map(
    Array.from(messagesList?.querySelectorAll?.(".support-msg[data-support-msg-id]") || [])
      .map((el) => [String(el.dataset.supportMsgId || ""), el])
  );
  for(const raw of rows || []){
    const row = normalizeSupportRow(raw);
    const id = Number(row.id);
    const senderId = String(row.sender_id || row.user_id || "");
    if(!Number.isSafeInteger(id) || id <= 0 || senderId === USER_ID || reportedReadIds.has(id)) continue;
    const messageEl = messageElements.get(String(id));
    const messageRect = messageEl?.getBoundingClientRect?.();
    if(listRect && messageRect){
      const visibleHeight = Math.min(listRect.bottom, messageRect.bottom) - Math.max(listRect.top, messageRect.top);
      const threshold = Math.min(24, Math.max(8, messageRect.height * .35));
      if(visibleHeight < threshold) continue;
    }
    reportedReadIds.add(id);
    pendingReadIds.add(id);
  }
  if(!pendingReadIds.size || readReceiptTimer) return;
  readReceiptTimer = setTimeout(flushSupportReadReceipts, 180);
}

function scheduleVisibleSupportReadScan(){
  if(readVisibilityFrame || !supportInteractionsAvailable) return;
  readVisibilityFrame = requestAnimationFrame(() => {
    readVisibilityFrame = 0;
    queueSupportReadReceipts(visibleMessageRows);
  });
}

async function flushSupportReadReceipts(){
  if(readReceiptTimer){
    clearTimeout(readReceiptTimer);
    readReceiptTimer = null;
  }
  const ids = Array.from(pendingReadIds).slice(0, 300);
  ids.forEach((id) => pendingReadIds.delete(id));
  if(!ids.length || !supportInteractionsAvailable) return;
  try{
    await postSupportInteraction({ action:"read", message_ids:ids });
  }catch(error){
    ids.forEach((id) => reportedReadIds.delete(id));
    console.warn("support read receipt failed", error);
  }
  if(pendingReadIds.size && !readReceiptTimer){
    readReceiptTimer = setTimeout(flushSupportReadReceipts, 300);
  }
}

let messagesLoadInFlight = false;
let messagesReloadQueued = false;

async function loadMessages(opts = {}) {
  if(messagesLoadInFlight){
    messagesReloadQueued = true;
    return;
  }
  messagesLoadInFlight = true;
  const forceBottom = !!opts.forceBottom;
  const requestedRoom = {
    type:String(activeRoom.type || "public"),
    room_id:String(activeRoom.room_id || "public"),
  };
  try {
    const payload = await fetchSupportMessagesApi({
      room_type: requestedRoom.type,
      room_id: requestedRoom.room_id,
      limit: "300",
    });
    if(
      requestedRoom.type !== String(activeRoom.type || "public") ||
      requestedRoom.room_id !== String(activeRoom.room_id || "public")
    ) return;

    const rows = payload.rows;
    let visibleRows = rows.filter((m) => activeRoom.type === "public" ? isPublicRoomRow(m) : isRowInActiveRoom(m));
    if (activeRoom.type === "public" && !visibleRows.length && rows.length) {
      visibleRows = rows.filter((m) => !isExplicitDmRow(m));
    }

    renderStableMessageList(visibleRows, { forceBottom });
    markActiveRoomSeenFromRows(visibleRows);
    refreshSupportInteractions(visibleRows, forceBottom).catch(()=>{});
    scheduleSeenFlush();
  } catch (apiErr) {
    console.error(apiErr);
    setStatus(`Could not load messages. Please contact ${ADMIN_NAME}.`, "error");
  } finally {
    messagesLoadInFlight = false;
    if(messagesReloadQueued){
      messagesReloadQueued = false;
      setTimeout(() => loadMessages({ forceBottom:false }).catch(()=>{}), 0);
    }
  }
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
    row.classList.add("is-deleting");
    row.style.pointerEvents = "none";
  }

  try{
    setStatus("Deleting…", "info");
    const res = await fetch((await resolveFnBase()) + "/user-delete-support-message", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: messageId, user_id: USER_ID })
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data?.error || "Delete failed");

    if (row) {
      keepSupportScrollStable(() => {
        if (row.parentNode) row.parentNode.removeChild(row);
        lastSupportListSignature = "";
        dropRecentMessageById(messageId);
      }, { forceBottom: isNearSupportBottom() });
    } else {
      dropRecentMessageById(messageId);
    }

    setStatus("Message deleted.", "success");
    setTimeout(() => {
      if ((statusEl?.textContent || "").trim() === "Message deleted.") setStatus("");
    }, 900);
    scheduleSeenFlush();
    queueLoadUsers(200);
  }catch(err){
    console.error(err);
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = previousBtnHtml || "🗑️";
      triggerBtn.removeAttribute("aria-busy");
    }
    if (row) {
      row.classList.remove("is-deleting");
      row.style.pointerEvents = "";
    }
    const msg = String(err?.message || "");
    if (/not found/i.test(msg)) {
      setStatus("This message was already removed.", "info");
      removeSupportMessageById(messageId, { forceBottom: isNearSupportBottom() });
      scheduleSeenFlush();
      queueLoadUsers(200);
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

const busySupportReactions = new Set();

function closeSupportReactionMenu(){
  const menu = document.getElementById("supportReactionMenu");
  if(menu) menu.hidden = true;
}

function closeSupportReaderPopovers(except = null){
  messagesList?.querySelectorAll(".support-readers-popover").forEach((popover) => {
    if(popover !== except) popover.hidden = true;
  });
}

function ensureSupportReactionMenu(){
  let menu = document.getElementById("supportReactionMenu");
  if(menu) return menu;
  menu = document.createElement("div");
  menu.id = "supportReactionMenu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  document.body.appendChild(menu);
  return menu;
}

function openSupportReactionMenu(button, messageId){
  if(!button || !messageId || !supportInteractionsAvailable) return;
  closeSupportReaderPopovers();
  const menu = ensureSupportReactionMenu();
  const mine = String(interactionForMessage(messageId)?.reactions?.mine || "");
  menu.dataset.messageId = String(messageId);
  menu.innerHTML = SUPPORT_REACTIONS.map(([key, icon, label]) =>
    `<button type="button" class="${mine === key ? "active" : ""}" data-reaction="${escapeHtml(key)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon}</button>`
  ).join("");
  menu.hidden = false;
  const rect = button.getBoundingClientRect();
  const width = Math.min(270, window.innerWidth - 16);
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left - 100))}px`;
  menu.style.top = `${Math.max(8, rect.top - 52)}px`;
}

function optimisticallyToggleSupportReaction(messageId, reaction){
  const id = String(messageId);
  const current = interactionForMessage(id);
  const next = JSON.parse(JSON.stringify(current));
  const reactions = next.reactions || emptySupportInteraction().reactions;
  const previousMine = String(reactions.mine || "");
  if(previousMine && Number(reactions.counts?.[previousMine] || 0) > 0){
    reactions.counts[previousMine] -= 1;
  }
  reactions.mine = previousMine === reaction ? "" : reaction;
  if(reactions.mine){
    reactions.counts[reactions.mine] = Number(reactions.counts?.[reactions.mine] || 0) + 1;
  }
  next.reactions = reactions;
  supportInteractions[id] = next;
}

function refreshRenderedSupportInteractions(){
  lastSupportListSignature = "";
  renderStableMessageList(visibleMessageRows, { forceBottom:false });
}

async function toggleSupportReaction(messageId, reaction){
  const id = String(messageId || "");
  const key = String(reaction || "");
  if(!id || !key || busySupportReactions.has(id) || !supportInteractionsAvailable) return;
  busySupportReactions.add(id);
  const previous = supportInteractions[id] ? JSON.parse(JSON.stringify(supportInteractions[id])) : emptySupportInteraction();
  optimisticallyToggleSupportReaction(id, key);
  refreshRenderedSupportInteractions();
  closeSupportReactionMenu();
  try{
    const result = await postSupportInteraction({ action:"toggle", message_id:Number(id), reaction:key });
    if(result?.available === false){
      supportInteractions = Object.create(null);
    }
  }catch(error){
    supportInteractions[id] = previous;
    setStatus("Could not save the reaction.", "error");
  }finally{
    busySupportReactions.delete(id);
    refreshRenderedSupportInteractions();
  }
}

messagesList?.addEventListener("click", (event) => {
  const reactionBadge = event.target?.closest?.("button.support-reaction-badge");
  if(reactionBadge){
    event.preventDefault();
    event.stopPropagation();
    toggleSupportReaction(reactionBadge.dataset.messageId, reactionBadge.dataset.reaction);
    return;
  }

  const reactionOpen = event.target?.closest?.("button.support-react-open");
  if(reactionOpen){
    event.preventDefault();
    event.stopPropagation();
    openSupportReactionMenu(reactionOpen, reactionOpen.dataset.messageId);
    return;
  }

  const readersOpen = event.target?.closest?.("button.support-readers-open");
  if(readersOpen){
    event.preventDefault();
    event.stopPropagation();
    closeSupportReactionMenu();
    const popover = readersOpen.parentElement?.querySelector?.(".support-readers-popover");
    if(!popover) return;
    const willOpen = popover.hidden;
    closeSupportReaderPopovers(popover);
    popover.hidden = !willOpen;
  }
});

document.addEventListener("click", (event) => {
  const menuChoice = event.target?.closest?.("#supportReactionMenu button[data-reaction]");
  if(menuChoice){
    event.preventDefault();
    event.stopPropagation();
    const menu = menuChoice.closest("#supportReactionMenu");
    toggleSupportReaction(menu?.dataset?.messageId, menuChoice.dataset.reaction);
    return;
  }
  if(!event.target?.closest?.("#supportReactionMenu,.support-msg-tools")){
    closeSupportReactionMenu();
    closeSupportReaderPopovers();
  }
}, true);

window.addEventListener("scroll", closeSupportReactionMenu, true);
window.addEventListener("resize", closeSupportReactionMenu);

function subscribeRoom() {
  if (sub) {
    try { clearInterval(sub); } catch {}
    sub = null;
  }

  // Private support rows are no longer exposed through anonymous Supabase
  // Realtime. Poll the authenticated API instead so every response is filtered
  // by the signed session identity.
  sub = setInterval(() => {
    if(!isSupportChatOpen()) return;
    loadMessages({ forceBottom:false }).catch(()=>{});
  }, 2200);
}

// Background listener to keep unread badges updated even when the Support modal is closed.
function subscribeBackground(){
  if(bgSub) return;
  bgSub = setInterval(() => {
    loadUsers().catch(()=>{});
  }, 6000);
}

async function refreshRoom() {
  setStatus("");
  await Promise.allSettled([
    loadUsers(),
    loadMessages({ forceBottom:true }),
  ]);
  scheduleSeenFlush();
  subscribeRoom();
}


// ---------- Sending ----------
async function sendMessage() {
  const name = getUserName();
  if (!name) {
    redirectToNicknameLogin();
    return;
  }
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

  const localId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const localRow = normalizeSupportRow({
    ...payload,
    id: localId,
    created_at: new Date().toISOString(),
  });

  // Show the message inside the user's Support window immediately. This fixes
  // delayed/disabled realtime and old tables where the latest rows were not being loaded.
  appendSupportMessage(localRow, { forceBottom: true });
  markRoomSeen(activeRoom.type, activeRoom.room_id);
  scheduleSeenFlush();

  let insertedRows = [];
  let error = null;
  try {
    const res = await fetch("/api/support-message", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.nickname_required) {
      removeSupportMessageById(localId);
      redirectToNicknameLogin();
      return;
    }
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Message insert failed.");
    insertedRows = Array.isArray(data?.data) ? data.data : [];
  } catch (err) {
    error = err;
  }

  sendBtn.disabled = false;

  if (error) {
    removeSupportMessageById(localId);
    console.error(error);
    setStatus(`Could not send your message. Please contact ${ADMIN_NAME}.`, "error");
    return;
  }

  msgInput.value = "";
  msgInput.dispatchEvent(new Event("input", { bubbles:true }));
  setSelectedFile(null);
  if(attachInput) attachInput.value = "";

  const inserted = Array.isArray(insertedRows) && insertedRows[0] ? normalizeSupportRow(insertedRows[0]) : null;
  if (inserted) replaceSupportMessageById(localId, inserted, { forceBottom: true });
  setStatus("");
  scheduleSeenFlush();
  queueLoadUsers(160);
  try { msgInput?.focus(); } catch {}
}

// ---------- UI wiring ----------
async function openSupport() {
  try { unlockSound(); } catch {}

  const ready = await ensureNicknameReady();
  if (!ready) {
    redirectToNicknameLogin();
    return;
  }

  const name = getUserName();
  if (!name) {
    redirectToNicknameLogin();
    return;
  }

  upsertProfileName(name).catch(()=>{});

  show(chatOverlay);
  if(messagesList && !messagesList.querySelector(".support-msg")){
    messagesList.innerHTML = '<div class="support-loading-state">Loading messages…</div>';
    lastSupportListSignature = "__loading__";
  }
  if(usersList && !usersList.querySelector(".support-user")){
    usersList.innerHTML = '<div class="support-loading-state">Loading people…</div>';
  }
  setRoomPublic();
  await refreshRoom();
  scheduleSeenFlush();
}

function closeAll() {
  hide(nameOverlay);
  hide(chatOverlay);
  setStatus("");
}

try {
  window.__srSupportChatReady = true;
  window.__srOpenSupportChat = openSupport;
} catch {}

supportBtn?.addEventListener("click", openSupport);

nameConfirmBtn?.addEventListener("click", async () => {
  // Step 4 centralizes nickname collection on the login screen.
  redirectToNicknameLogin();
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

// ===== STEP 6.2 SUPPORT SEEN FLUSH EVENTS START =====
messagesList?.addEventListener("scroll", () => {
  if (isNearSupportBottom(80)) scheduleSeenFlush();
  scheduleVisibleSupportReadScan();
}, { passive: true });

chatOverlay?.addEventListener("pointerdown", () => {
  if (isSupportChatOpen()) scheduleSeenFlush();
}, { passive: true });

window.addEventListener("focus", () => {
  if (isSupportChatOpen()) scheduleSeenFlush();
});
// ===== STEP 6.2 SUPPORT SEEN FLUSH EVENTS END =====

// Initial status cleanup
setStatus("");

// Initialize unread badges immediately (without opening the Support UI)
loadUsers();
subscribeBackground();
