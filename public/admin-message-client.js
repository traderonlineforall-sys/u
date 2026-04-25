import { playUrgentBannerNotification } from "./notification-sound.js";
import { getStableUserId } from "./stable-user-identity.js";
import { supabase } from "./supabase-client.js";

// Fixed API base for Cloudflare/Next.js.
// This removes the old Vercel/Netlify probing request and keeps the UI untouched.
const SR_API_BASE = "/api";

/*
 * Admin announcement (Envelope) client
 *
 * Requirements implemented:
 * - Admin writes an announcement from Admin Panel.
 * - All users see a badge on the UA07 envelope when there is a new message.
 * - When a user opens the envelope and reads the message, the badge disappears
 *   for that user/device until the admin changes the message again.
 *
 * Implementation notes:
 * - First load uses one safe API read to get the current announcement.
 * - After that, updates arrive through Supabase Realtime instead of polling.
 * - We do NOT depend on internal functions inside app.js (openSecretModal is
 *   scoped inside an IIFE). Instead, we hook the envelope button click and/or
 *   observe the modal opening, then inject/replace the modal content.
 */

const LS_SEEN_AT = "sr_admin_ann_seen_at";
const LS_SEEN_KEY = "sr_admin_ann_seen_key";
const LS_URGENT_DISMISSED_AT = "sr_admin_urgent_dismissed_at";
const LS_URGENT_DISMISSED_KEY = "sr_admin_urgent_dismissed_key";
const LS_URGENT_SHOW_COUNT_PREFIX = "sr_admin_urgent_show_count";
const MAX_URGENT_SHOWS_PER_USER = 2;
const URGENT_PREFIX = "URGENT_TICKER::";
const ANNOUNCEMENT_REALTIME_CHANNEL = "sr_admin_announcements_realtime";
const SR_ANNOUNCEMENT_CHANNEL = (typeof BroadcastChannel !== "undefined") ? new BroadcastChannel("sr_admin_announcement_state") : null;

function announceStateChanged(kind, payload = {}) {
  try {
    SR_ANNOUNCEMENT_CHANNEL?.postMessage({ kind, ...payload });
  } catch {}
}


function simpleHashKey(input = ""){
  let h = 2166136261;
  const s = String(input || "");
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function getUrgentShowStorageKey(annKey){
  const safeAnnKey = String(annKey || "").trim();
  if(!safeAnnKey) return "";
  let uid = "anon";
  try { uid = String(getStableUserId() || "anon").trim() || "anon"; } catch {}
  return `${LS_URGENT_SHOW_COUNT_PREFIX}:${uid}:${simpleHashKey(safeAnnKey)}`;
}

function getUrgentShowCount(annKey){
  try {
    const k = getUrgentShowStorageKey(annKey);
    if(!k) return 0;
    const n = parseInt(localStorage.getItem(k) || "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function bumpUrgentShowCount(annKey){
  try {
    const k = getUrgentShowStorageKey(annKey);
    if(!k) return 0;
    const next = getUrgentShowCount(annKey) + 1;
    localStorage.setItem(k, String(next));
    announceStateChanged("urgent-shown", { key: String(annKey || "") });
    return next;
  } catch {
    return 0;
  }
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSeenTs() {
  try {
    const v = localStorage.getItem(LS_SEEN_AT) || "";
    return v ? Date.parse(v) : 0;
  } catch {
    return 0;
  }
}

function setSeenTs(isoOrDate) {
  try {
    const v = (isoOrDate instanceof Date) ? isoOrDate.toISOString() : String(isoOrDate || "");
    if (!v) return;
    localStorage.setItem(LS_SEEN_AT, v);
  } catch {}
}

function getSeenKey(){
  try { return localStorage.getItem(LS_SEEN_KEY) || ""; } catch { return ""; }
}

function setSeenKey(key){
  try {
    const v = String(key || "").trim();
    if (!v) return;
    localStorage.setItem(LS_SEEN_KEY, v);
  } catch {}
}

function getAnnouncementKey(ann){
  if(!ann) return "";
  const created = String(ann.created_at || "").trim();
  const env = String(ann.envelope_text ?? ann.text ?? "").trim();
  const urgent = String(ann.urgent_text ?? "").trim();
  return created || `${env}__${urgent}`;
}

function clearEnvelopeUnreadIfOpen() {
  const modal = document.getElementById("UA07_SECRET_MODAL");
  if (!modal) return;
  const isOpen = modal.style.display === "block" || modal.classList.contains("show") || modal.getAttribute("aria-hidden") === "false";
  if (!isOpen) return;
  if (_lastAnnouncement) {
    const annKey = getAnnouncementKey(_lastAnnouncement);
    if (_lastAnnouncement.created_at) setSeenTs(_lastAnnouncement.created_at);
    if (annKey) setSeenKey(annKey);
    const b = ensureEnvelopeBadge();
    if (b) b.style.display = "none";
  }
}


function getUrgentDismissedTs(){
  try{ const v = localStorage.getItem(LS_URGENT_DISMISSED_AT)||""; return v ? Date.parse(v) : 0; }catch{ return 0; }
}

function getUrgentDismissedKey(){
  try{ return localStorage.getItem(LS_URGENT_DISMISSED_KEY) || ""; }catch{ return ""; }
}

function dismissUrgent(createdAtIso, key){
  try{
    if(createdAtIso) localStorage.setItem(LS_URGENT_DISMISSED_AT, new Date(createdAtIso).toISOString());
    const v = String(key || "").trim();
    if(v) localStorage.setItem(LS_URGENT_DISMISSED_KEY, v);
    announceStateChanged("urgent-dismissed", { key: v, created_at: createdAtIso || "" });
  }catch{}
}

function markSeen(createdAtIso, key) {
  try {
    if (createdAtIso) localStorage.setItem(LS_SEEN_AT, new Date(createdAtIso).toISOString());
    const v = String(key || "").trim();
    if (v) localStorage.setItem(LS_SEEN_KEY, v);
    announceStateChanged("envelope-seen", { key: v, created_at: createdAtIso || "" });
  } catch {}
}

function parseAnnouncementTextClient(raw){
  const text = String(raw || "");
  let envelope_text = "";
  let urgent_text = "";
  let urgent_enabled = false;

  try{
    const obj = JSON.parse(text);
    if(obj && typeof obj === "object"){
      envelope_text = String(obj.envelope || obj.envelope_text || "");
      urgent_text = String(obj.urgent || obj.urgent_text || "");
      urgent_enabled = !!obj.urgent_enabled;
      return { text, envelope_text, urgent_text, urgent_enabled };
    }
  }catch(_){}

  if(text.startsWith(URGENT_PREFIX)){
    urgent_enabled = true;
    urgent_text = text.slice(URGENT_PREFIX.length).trim();
    return { text, envelope_text, urgent_text, urgent_enabled };
  }

  envelope_text = text;
  return { text, envelope_text, urgent_text, urgent_enabled };
}

function normalizeAnnouncementRow(row){
  if(!row) return null;
  const parsed = parseAnnouncementTextClient(row?.text || "");
  return {
    text: parsed.text,
    envelope_text: parsed.envelope_text,
    urgent_text: parsed.urgent_text,
    urgent_enabled: parsed.urgent_enabled,
    created_at: row?.created_at || null
  };
}

function applyAnnouncement(ann){
  if(!ann) return;
  const prevKey = getAnnouncementKey(_lastAnnouncement);
  const nextKey = getAnnouncementKey(ann);
  _lastAnnouncement = ann;
  updateBadgeUI();
  updateUrgentUI();

  // If the envelope modal is already open, refresh its content without touching layout.
  if(nextKey && nextKey !== prevKey){
    announceStateChanged("announcement-realtime", { key: nextKey, created_at: ann.created_at || "" });
    setTimeout(renderAnnouncementInModal, 30);
    setTimeout(clearEnvelopeUnreadIfOpen, 60);
  }
}

async function fetchLatestAnnouncement() {
  try {
    const res = await fetch(SR_API_BASE + "/admin-announcement", { method: "GET", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Keep silent; we don't want to break the tool UI.
      return null;
    }
    const envelope_text = String(data?.envelope_text ?? data?.text ?? "").trim();
    const urgent_text = String(data?.urgent_text ?? "").trim();
    const urgent_enabled = !!(data?.urgent_enabled);

    const created_at = data?.created_at || null;
    if (!envelope_text && !(urgent_enabled && urgent_text)) {
      return { envelope_text: "", urgent_text: "", urgent_enabled: false, created_at: created_at || null };
    }
    return { envelope_text, urgent_text, urgent_enabled, created_at };
  } catch (e) {
    return null;
  }
}

function ensureUrgentTicker(){
  let wrap = document.getElementById('SR_URGENT_TICKER');
  if(wrap) return wrap;
  wrap = document.createElement('div');
  wrap.id = 'SR_URGENT_TICKER';
  wrap.className = 'sr-urgent-ticker';
  wrap.style.display = 'none';
  wrap.setAttribute('role','alert');
  wrap.setAttribute('aria-live','assertive');
  wrap.setAttribute('aria-atomic','true');
  wrap.innerHTML = `
    <div class="sr-urgent-inner">
      <div class="sr-urgent-label">عاجل</div>
      <div class="sr-urgent-track" aria-hidden="true">
        <div class="sr-urgent-marquee" id="SR_URGENT_MARQUEE"></div>
      </div>
      <button type="button" class="sr-urgent-ack" id="SR_URGENT_ACK">فهمت</button>
    </div>
  `;
  document.body.appendChild(wrap);
  return wrap;
}

function setUrgentText(text){
  const wrap = ensureUrgentTicker();
  const marquee = wrap.querySelector('#SR_URGENT_MARQUEE');
  if(!marquee) return;

  const safe = String(text||'').trim();

  // Build a seamless loop (no gap) by duplicating the segment.
  marquee.innerHTML = '';
  if(!safe){
    marquee.textContent = '';
    marquee.style.removeProperty('--sr-urgent-duration');
    return;
  }

  const seg1 = document.createElement('div');
  seg1.className = 'sr-urgent-segment';
  seg1.textContent = safe;
  const seg2 = seg1.cloneNode(true);
  marquee.appendChild(seg1);
  marquee.appendChild(seg2);

  // Auto speed tuned for readability: longer text → a bit slower.
  // Requested: make it 2x faster than the previous setting.
  const len = safe.length;
  const baseSecs = Math.max(18, Math.min(45, len * 0.35));
  const secs = Math.max(9, Math.min(22.5, baseSecs / 2));
  marquee.style.setProperty('--sr-urgent-duration', secs.toFixed(1) + 's');
}

function showUrgent(createdAtIso, text, annKey){
  const wrap = ensureUrgentTicker();
  const effectiveKey = String(annKey || createdAtIso || text || "").trim();
  const isAlreadyVisibleSame = wrap.style.display === 'block' && wrap.dataset.urgentActiveKey === effectiveKey;

  if(!isAlreadyVisibleSame){
    const shownCount = getUrgentShowCount(effectiveKey);
    if(shownCount >= MAX_URGENT_SHOWS_PER_USER){
      wrap.style.display = 'none';
      dismissUrgent(createdAtIso, effectiveKey);
      return;
    }
    bumpUrgentShowCount(effectiveKey);
    wrap.dataset.urgentActiveKey = effectiveKey;
    try { playUrgentBannerNotification(); } catch {}
  }

  setUrgentText(text);
  wrap.style.display = 'block';

  const ack = wrap.querySelector('#SR_URGENT_ACK');
  if(ack && !ack.__bound){
    ack.__bound = true;
    ack.addEventListener('click', ()=>{
      wrap.style.display = 'none';
      dismissUrgent(createdAtIso, effectiveKey);
    });
  }
}

function hideUrgent(){
  const wrap = document.getElementById('SR_URGENT_TICKER');
  if(wrap) wrap.style.display = 'none';
}

function ensureEnvelopeBadge() {
  const btn = document.getElementById("UA07_SECRET_ENVELOPE");
  if (!btn) return null;

  let badge = btn.querySelector(".ua07-ann-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "ua07-ann-badge";
    // Red dot badge (unread)
    badge.style.position = "absolute";
    badge.style.top = "2px";
    badge.style.right = "2px";
    badge.style.width = "10px";
    badge.style.height = "10px";
    badge.style.borderRadius = "50%";
    badge.style.backgroundColor = "#ff3b3b";
    badge.style.display = "none";
    badge.setAttribute("aria-hidden", "true");
    // Ensure absolute positioning works
    btn.style.position = "relative";
    btn.appendChild(badge);
  }
  return badge;
}

let _lastAnnouncement = null;

function shouldShowBadge(ann) {
  if (!ann) return false;
  const annKey = getAnnouncementKey(ann);
  if (!annKey) return false;
  const seenKey = getSeenKey();
  if (seenKey && seenKey === annKey) return false;

  if (!ann.created_at) return true;
  const annTs = Date.parse(ann.created_at);
  if (!Number.isFinite(annTs)) return true;
  return annTs > getSeenTs();
}

function updateUrgentUI(){
  const ann = _lastAnnouncement;
  if(!ann || !ann.created_at) { hideUrgent(); return; }

  // New format: separate urgent fields.
  let urgentEnabled = !!ann.urgent_enabled;
  let urgentText = String(ann.urgent_text || "").trim();

  // Backward compatibility: if server still returns legacy prefixed text
  if(!urgentEnabled && !urgentText){
    const raw = String(ann.text || "");
    if(raw.startsWith(URGENT_PREFIX)){
      urgentEnabled = true;
      urgentText = raw.slice(URGENT_PREFIX.length).trim();
    }
  }

  if(!urgentEnabled || !urgentText){ hideUrgent(); return; }

  const annKey = getAnnouncementKey(ann);
  const dismissedKey = getUrgentDismissedKey();
  if(annKey && dismissedKey && annKey === dismissedKey) { hideUrgent(); return; }

  const annTs = Date.parse(ann.created_at);
  if(!Number.isFinite(annTs)) {
    if(annKey && dismissedKey && annKey === dismissedKey) { hideUrgent(); return; }
    showUrgent(ann.created_at, urgentText, annKey);
    return;
  }
  if(annTs <= getUrgentDismissedTs()) { hideUrgent(); return; }
  showUrgent(ann.created_at, urgentText, annKey);
}

function updateBadgeUI() {
  const badge = ensureEnvelopeBadge();
  if (!badge) return;
  const show = shouldShowBadge(_lastAnnouncement);
  badge.style.display = show ? "block" : "none";
}

async function refreshAnnouncementAndBadge() {
  const ann = await fetchLatestAnnouncement();
  if (ann) {
    applyAnnouncement(ann);
  } else {
    updateBadgeUI();
    updateUrgentUI();
  }
}

// --- Modal injection ---
let _originalModalSnapshot = null;

function snapshotOriginalModal(modal) {
  if (_originalModalSnapshot) return;
  const titleEl = modal.querySelector(".ua07-secret-title");
  const iconEl = modal.querySelector(".ua07-secret-icon");
  const bodyEl = modal.querySelector(".ua07-secret-body");
  _originalModalSnapshot = {
    title: titleEl ? titleEl.textContent : "",
    iconHtml: iconEl ? iconEl.innerHTML : "",
    bodyHtml: bodyEl ? bodyEl.innerHTML : "",
  };
}

function renderAnnouncementInModal() {
  const modal = document.getElementById("UA07_SECRET_MODAL");
  if (!modal) return;

  snapshotOriginalModal(modal);

  const titleEl = modal.querySelector(".ua07-secret-title");
  const iconEl = modal.querySelector(".ua07-secret-icon");
  const bodyEl = modal.querySelector(".ua07-secret-body");
  if (!titleEl || !bodyEl) return;

  const ann = _lastAnnouncement;
  const hasAnn = !!(ann && (ann.envelope_text ?? ann.text) && String(ann.envelope_text ?? ann.text).trim());

  if (!hasAnn) {
    // Restore original modal when there is no announcement.
    if (_originalModalSnapshot) {
      titleEl.textContent = _originalModalSnapshot.title;
      if (iconEl) iconEl.innerHTML = _originalModalSnapshot.iconHtml;
      bodyEl.innerHTML = _originalModalSnapshot.bodyHtml;
    }
    return;
  }

  // Replace modal content with the admin message (clean envelope view).
  titleEl.textContent = "رسالة إدارية";
  if (iconEl) iconEl.textContent = "📣";

  const when = ann.created_at ? new Date(ann.created_at).toLocaleString("ar-EG") : "";
  bodyEl.innerHTML = `
    <div class="ua07-secret-lead">رسالة من الأدمن</div>
    <div class="ua07-secret-text" style="white-space:pre-wrap;">${escapeHtml(ann.envelope_text ?? ann.text)}</div>
    ${when ? `<div class="ua07-secret-text" style="opacity:0.7;font-size:12px;margin-top:10px;">${escapeHtml(when)}</div>` : ""}
  `;

  // Mark as seen and hide badge.
  const annKey = getAnnouncementKey(ann);
  markSeen(ann.created_at, annKey);
  updateBadgeUI();
}

function hookEnvelopeClick() {
  // We use event capturing so we run even if app.js stops propagation.
  document.addEventListener(
    "click",
    async (e) => {
      const t = e.target;
      if (!t) return;
      const btn = t.closest ? t.closest("#UA07_SECRET_ENVELOPE") : null;
      if (!btn) return;

      // Refresh message before rendering, then render shortly after modal opens.
      await refreshAnnouncementAndBadge();

      // app.js opens the modal in its own click handler. Wait a tick.
      setTimeout(renderAnnouncementInModal, 30);
      // Mark as read when user opens the envelope.
      setTimeout(clearEnvelopeUnreadIfOpen, 60);
      setTimeout(renderAnnouncementInModal, 120);
      setTimeout(clearEnvelopeUnreadIfOpen, 160);
    },
    true
  );
}

function observeModalOpen() {
  // Extra robustness: if the modal gets opened by any other means,
  // detect it and render the announcement.
  const modal = document.getElementById("UA07_SECRET_MODAL");
  if (!modal || modal.__srAnnObserved) return;
  modal.__srAnnObserved = true;

  const obs = new MutationObserver(() => {
    const isOpen = modal.classList.contains("is-open") && modal.getAttribute("aria-hidden") === "false";
    if (isOpen) {
      renderAnnouncementInModal();
        clearEnvelopeUnreadIfOpen();
    }
  });
  obs.observe(modal, { attributes: true, attributeFilter: ["class", "aria-hidden"] });
}

function bindAnnouncementSync() {
  window.addEventListener("storage", (e) => {
    if (!e?.key) return;
    if ([LS_SEEN_AT, LS_SEEN_KEY, LS_URGENT_DISMISSED_AT, LS_URGENT_DISMISSED_KEY].includes(e.key)) {
      updateBadgeUI();
      updateUrgentUI();
    }
  });

  if (SR_ANNOUNCEMENT_CHANNEL && !window.__srAnnChannelBound) {
    window.__srAnnChannelBound = true;
    SR_ANNOUNCEMENT_CHANNEL.addEventListener("message", () => {
      updateBadgeUI();
      updateUrgentUI();
    });
  }
}

function subscribeAnnouncementRealtime(){
  if(window.__srAnnouncementRealtimeBound) return;
  window.__srAnnouncementRealtimeBound = true;

  try{
    const channel = supabase
      .channel(ANNOUNCEMENT_REALTIME_CHANNEL)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        (payload) => {
          const ann = normalizeAnnouncementRow(payload?.new);
          if(ann) applyAnnouncement(ann);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "announcements" },
        (payload) => {
          const ann = normalizeAnnouncementRow(payload?.new);
          if(ann) applyAnnouncement(ann);
        }
      )
      .subscribe((status) => {
        // No polling fallback here by design. If Realtime drops, we only resync when the tab becomes visible.
        if(status === "SUBSCRIBED"){
          try { window.__srAnnouncementRealtimeOk = true; } catch {}
        }
      });

    window.__srAnnouncementRealtimeChannel = channel;
  }catch(e){
    // Keep the tool running even if Realtime is not enabled in Supabase yet.
    try { window.__srAnnouncementRealtimeOk = false; } catch {}
  }
}

function init() {
  bindAnnouncementSync();
  hookEnvelopeClick();

  // First load: one request only to get the current latest message.
  refreshAnnouncementAndBadge().catch(() => {});

  // Live updates: no repeated polling; new admin messages arrive through Supabase Realtime.
  subscribeAnnouncementRealtime();

  // Safety resync only when the user returns to the tab after being away.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshAnnouncementAndBadge().catch(() => {});
  });

  // Keep multiple tabs/windows in sync for the same user.
  window.addEventListener("storage", (e) => {
    const keys = [LS_SEEN_AT, LS_SEEN_KEY, LS_URGENT_DISMISSED_AT, LS_URGENT_DISMISSED_KEY];
    if (!e || !keys.includes(e.key)) return;
    updateBadgeUI();
    updateUrgentUI();
  });

  // The UA07 logo/modal might be injected a bit later.
  let tries = 0;
  const tick = () => {
    tries += 1;
    observeModalOpen();
    if (tries < 60 && !document.getElementById("UA07_SECRET_MODAL")) {
      setTimeout(tick, 200);
    }
  };
  tick();
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(init, 0);
} else {
  document.addEventListener("DOMContentLoaded", init);
}