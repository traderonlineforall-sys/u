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
 * - We fetch the latest announcement via Netlify Function:
 *     GET /.netlify/functions/admin-announcement
 *   (server-side uses service_role key). This avoids relying on public RLS.
 * - We do NOT depend on internal functions inside app.js (openSecretModal is
 *   scoped inside an IIFE). Instead, we hook the envelope button click and/or
 *   observe the modal opening, then inject/replace the modal content.
 */

const LS_SEEN_AT = "sr_admin_ann_seen_at";

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

function markSeen(createdAtIso) {
  try {
    if (!createdAtIso) return;
    localStorage.setItem(LS_SEEN_AT, new Date(createdAtIso).toISOString());
  } catch {}
}

async function fetchLatestAnnouncement() {
  try {
    const res = await fetch("/.netlify/functions/admin-announcement", { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Keep silent; we don't want to break the tool UI.
      return null;
    }
    const text = String(data?.text || "").trim();
    const created_at = data?.created_at || null;
    if (!text) return { text: "", created_at: created_at || null };
    return { text, created_at };
  } catch (e) {
    return null;
  }
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
  if (!ann || !ann.created_at) return false;
  const annTs = Date.parse(ann.created_at);
  if (!Number.isFinite(annTs)) return false;
  return annTs > getSeenTs();
}

function updateBadgeUI() {
  const badge = ensureEnvelopeBadge();
  if (!badge) return;
  const show = shouldShowBadge(_lastAnnouncement);
  badge.style.display = show ? "block" : "none";
}

async function refreshAnnouncementAndBadge() {
  const ann = await fetchLatestAnnouncement();
  if (ann) _lastAnnouncement = ann;
  updateBadgeUI();
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
  const hasAnn = !!(ann && ann.text && String(ann.text).trim());

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

  const when = ann.created_at ? new Date(ann.created_at).toLocaleString() : "";
  bodyEl.innerHTML = `
    <div class="ua07-secret-lead">رسالة من الأدمن</div>
    <div class="ua07-secret-text" style="white-space:pre-wrap;">${escapeHtml(ann.text)}</div>
    ${when ? `<div class="ua07-secret-text" style="opacity:0.7;font-size:12px;margin-top:10px;">${escapeHtml(when)}</div>` : ""}
  `;

  // Mark as seen and hide badge.
  if (ann.created_at) markSeen(ann.created_at);
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
      setTimeout(renderAnnouncementInModal, 120);
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
    }
  });
  obs.observe(modal, { attributes: true, attributeFilter: ["class", "aria-hidden"] });
}

function init() {
  hookEnvelopeClick();

  // First load
  refreshAnnouncementAndBadge().catch(() => {});

  // Poll to keep badge in sync across users without requiring realtime config.
  setInterval(() => {
    refreshAnnouncementAndBadge().catch(() => {});
  }, 25000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshAnnouncementAndBadge().catch(() => {});
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
