// Header / top-tools layout stabilizer
//
// Goal:
// Keep the top row steady (search + Haya Karima line + UA07 logo + AHT/Tags)
// inside the same tab, without needing Reset or switching tabs.
//
// Important UX rule:
// Never interfere while the user is actively typing or deleting in search / landline inputs.
// Layout repair is deferred until typing stops briefly or focus leaves the field.

const WATCH_IDS = [
  'searchInput',
  'searchResults',
  'arabicNumber',
  'arabiccNumber',
  'hkSmartFloatingLine',
  'hkRawSourceInput',
  'hkRawSourceStatus',
  'MNDO_UA07_LOGO3',
  'UA07_LUX_LOGO_BETWEEN',
  'UA07_SECRET_ENVELOPE_WRAP',
  'UA07_SECRET_ENVELOPE',
  'UA07_ONLINE_COUNT',
  'EID_TOGGLE_BTN',
  'UA07_UPDATE_ICON',
  'mndoQueryTimer',
  'bat2',
  'copyBtn',
  'copyBtn1'
];

const PRESERVE_VALUE_IDS = ['arabicNumber', 'arabiccNumber', 'searchInput'];
const EDIT_LOCK_MS = 420;
const BURST_MS = 850;
const MIN_SETTLE_GAP_MS = 90;
const BASELINE_REPAIR_INTERVAL_MS = 1400;
const BASELINE_TOLERANCE_PX = 3;
const BASELINE_CAPTURE_DELAY_MS = 240;
const CLUSTER_CAPTURE_DELAY_MS = 280;
const CLUSTER_REPAIR_INTERVAL_MS = 950;
const CLUSTER_TOLERANCE_PX = 2;
const CLUSTER_REL_TOLERANCE_PX = 3;


let rafId = 0;
let settleTimer = 0;
let settleTimerLate = 0;
let idleReleaseTimer = 0;
let burstRaf = 0;
let burstUntil = 0;
let observer = null;
let resizeObserver = null;
let wired = new WeakSet();
let lastRun = 0;
let lastSignature = '';
let initialized = false;
let suppressProgrammaticMarks = false;
let editLockUntil = 0;
let pendingRepair = false;
let baselineTimer = 0;
let baselineCaptureTimer = 0;
let baselineMap = new Map();
let clusterBaseline = null;
let clusterTimer = 0;
let clusterCaptureTimer = 0;
let clusterRepairQueued = false;


function isMeaningfulValue(value) {
  return String(value || '').trim() !== '';
}

function getEditStamp(el) {
  return el && typeof el.__mndoUserEditStamp === 'number' ? el.__mndoUserEditStamp : 0;
}

function markAsUserEdited(el) {
  if (!el || suppressProgrammaticMarks) return;
  el.__mndoUserEditStamp = Date.now();
}

function isTextEntryElement(el) {
  return !!(el instanceof Element && (
    el.matches('input, textarea') ||
    el.isContentEditable
  ));
}

function isProtectedEditingTarget(el) {
  if (!(el instanceof Element)) return false;
  if (PRESERVE_VALUE_IDS.includes(el.id)) return true;
  if (el.closest('.search-container')) return true;
  return false;
}

function isEditingLocked() {
  const ae = document.activeElement;
  if (isTextEntryElement(ae) && isProtectedEditingTarget(ae)) {
    return true;
  }
  return Date.now() < editLockUntil;
}

function noteEditingActivity(target) {
  if (!(target instanceof Element)) return;
  if (!isProtectedEditingTarget(target)) return;

  editLockUntil = Date.now() + EDIT_LOCK_MS;
  pendingRepair = true;

  clearTimeout(idleReleaseTimer);
  idleReleaseTimer = setTimeout(() => {
    if (!isEditingLocked() && pendingRepair) {
      pendingRepair = false;
      scheduleSettle();
      startBurst(650);
    }
  }, EDIT_LOCK_MS + 30);
}

function snapshotPreservedValues() {
  return PRESERVE_VALUE_IDS.map((id) => {
    const el = document.getElementById(id);
    const isTextLike = el && ('value' in el);
    return {
      id,
      value: isTextLike ? String(el.value || '') : '',
      selectionStart: el && typeof el.selectionStart === 'number' ? el.selectionStart : null,
      selectionEnd: el && typeof el.selectionEnd === 'number' ? el.selectionEnd : null,
      editStamp: getEditStamp(el),
    };
  });
}

function restorePreservedValues(snapshot) {
  if (!Array.isArray(snapshot) || !snapshot.length) return;

  for (const item of snapshot) {
    if (!item) continue;
    const el = document.getElementById(item.id);
    if (!el || !('value' in el)) continue;

    const currentValue = String(el.value || '');
    const wantedValue = String(item.value || '');
    const isActive = document.activeElement === el;
    const currentEditStamp = getEditStamp(el);
    const userChangedAfterSnapshot = currentEditStamp > Number(item.editStamp || 0);

    if (!wantedValue) continue;
    if (currentValue === wantedValue) continue;
    if (userChangedAfterSnapshot) continue;
    if (isActive) continue;

    if (!isMeaningfulValue(currentValue)) {
      try {
        suppressProgrammaticMarks = true;
        el.value = wantedValue;
      } catch {}
      finally {
        suppressProgrammaticMarks = false;
      }
    }
  }
}

function kickResize() {
  if (isEditingLocked()) {
    pendingRepair = true;
    return;
  }

  const snapshot = snapshotPreservedValues();

  try {
    window.dispatchEvent(new Event('resize'));
  } catch {}

  setTimeout(() => restorePreservedValues(snapshot), 0);
  setTimeout(() => restorePreservedValues(snapshot), 90);
  setTimeout(() => restorePreservedValues(snapshot), 220);
}

function runSettleBurst() {
  if (isEditingLocked()) {
    pendingRepair = true;
    return;
  }

  const now = Date.now();
  if (now - lastRun < MIN_SETTLE_GAP_MS) return;
  lastRun = now;

  kickResize();
  scheduleBaselineCapture();
  scheduleClusterBaselineCapture();
  clearTimeout(settleTimer);
  clearTimeout(settleTimerLate);
  settleTimer = setTimeout(kickResize, 90);
  settleTimerLate = setTimeout(kickResize, 260);
}

function scheduleSettle() {
  if (isEditingLocked()) {
    pendingRepair = true;
    return;
  }
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    runSettleBurst();
  });
}

function requestRepair(duration = BURST_MS) {
  if (isEditingLocked()) {
    pendingRepair = true;
    return;
  }
  scheduleSettle();
  startBurst(duration);
}

function getWatchedElements() {
  const out = [];
  for (const id of WATCH_IDS) {
    const el = document.getElementById(id);
    if (el) out.push(el);
  }

  const searchContainer = document.querySelector('.search-container');
  if (searchContainer) out.push(searchContainer);

  const header = document.querySelector('header');
  if (header) out.push(header);

  return out;
}

function buildSignature() {
  const elements = getWatchedElements();
  if (!elements.length) return '';

  return elements.map((el) => {
    const r = el.getBoundingClientRect();
    return [
      el.id || el.className || el.tagName,
      Math.round(r.left),
      Math.round(r.top),
      Math.round(r.width),
      Math.round(r.height)
    ].join(':');
  }).join('|');
}

function stopBurst() {
  burstUntil = 0;
  if (burstRaf) {
    cancelAnimationFrame(burstRaf);
    burstRaf = 0;
  }
}

function burstTick() {
  burstRaf = 0;

  if (isEditingLocked()) {
    pendingRepair = true;
    stopBurst();
    return;
  }

  const now = performance.now();
  const signature = buildSignature();

  if (signature && lastSignature && signature !== lastSignature) {
    scheduleSettle();
  }
  if (signature) lastSignature = signature;

  if (now < burstUntil) {
    burstRaf = requestAnimationFrame(burstTick);
  } else {
    stopBurst();
  }
}

function startBurst(duration = BURST_MS) {
  if (isEditingLocked()) {
    pendingRepair = true;
    return;
  }
  const until = performance.now() + duration;
  if (until > burstUntil) burstUntil = until;
  if (!burstRaf) burstRaf = requestAnimationFrame(burstTick);
}



function injectTopClusterStabilityStyle() {
  if (document.getElementById('mndo-top-cluster-stability-style')) return;
  const style = document.createElement('style');
  style.id = 'mndo-top-cluster-stability-style';
  style.textContent = `
    #UA07_SECRET_ENVELOPE_WRAP {
      display: inline-flex !important;
      flex-wrap: nowrap !important;
      white-space: nowrap !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
    }
    #UA07_SECRET_ENVELOPE_WRAP > * {
      flex: 0 0 auto !important;
    }
    #UA07_ONLINE_COUNT,
    #EID_TOGGLE_BTN,
    #UA07_SECRET_ENVELOPE,
    #UA07_UPDATE_ICON {
      flex-shrink: 0 !important;
    }
    #MNDO_UA07_LOGO3,
    #hkSmartFloatingLine {
      backface-visibility: hidden;
      transform-style: preserve-3d;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function getRect(el) {
  if (!(el instanceof Element) || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (!r || !isFinite(r.left) || !isFinite(r.top) || !r.width || !r.height) return null;
  return {
    top: Math.round(r.top),
    left: Math.round(r.left),
    right: Math.round(r.right),
    bottom: Math.round(r.bottom),
    width: Math.round(r.width),
    height: Math.round(r.height),
    centerX: Math.round(r.left + (r.width / 2)),
    centerY: Math.round(r.top + (r.height / 2)),
  };
}

function collectClusterState() {
  const search = document.getElementById('searchInput') || document.querySelector('.search-container input');
  const logo = document.getElementById('MNDO_UA07_LOGO3') || document.getElementById('UA07_LUX_LOGO_BETWEEN');
  const hk = document.getElementById('hkSmartFloatingLine');
  const wrap = document.getElementById('UA07_SECRET_ENVELOPE_WRAP');
  const env = document.getElementById('UA07_SECRET_ENVELOPE');
  const pill = document.getElementById('UA07_ONLINE_COUNT');
  const toggle = document.getElementById('EID_TOGGLE_BTN');
  const update = document.getElementById('UA07_UPDATE_ICON');
  const aht = document.getElementById('mndoQueryTimer');

  const sr = getRect(search);
  const lr = getRect(logo);
  if (!sr || !lr) return null;

  const hr = getRect(hk);
  const wr = getRect(wrap);
  const er = getRect(env);
  const pr = getRect(pill);
  const tr = getRect(toggle);
  const ur = getRect(update);
  const ar = getRect(aht);

  return {
    hasHk: !!hr,
    hasWrap: !!wr,
    hasEnv: !!er,
    hasPill: !!pr,
    hasToggle: !!tr,
    hasUpdate: !!ur,
    hasAht: !!ar,
    logoTopToSearch: lr.top - sr.top,
    logoLeftToSearch: lr.left - sr.left,
    logoCenterToSearchCenter: lr.centerX - sr.centerX,
    hkTopToSearchBottom: hr ? (hr.top - sr.bottom) : null,
    hkCenterToSearchCenter: hr ? (hr.centerX - sr.centerX) : null,
    hkWidth: hr ? hr.width : null,
    wrapTopToLogoTop: wr ? (wr.top - lr.top) : null,
    wrapCenterToLogoCenter: wr ? (wr.centerX - lr.centerX) : null,
    wrapWidth: wr ? wr.width : null,
    envCenterToWrapCenter: (wr && er) ? (er.centerX - wr.centerX) : null,
    pillCenterToWrapCenter: (wr && pr) ? (pr.centerX - wr.centerX) : null,
    toggleCenterToWrapCenter: (wr && tr) ? (tr.centerX - wr.centerX) : null,
    updateCenterToWrapCenter: (wr && ur) ? (ur.centerX - wr.centerX) : null,
    ahtTopToSearchTop: ar ? (ar.top - sr.top) : null,
  };
}

function sameNumber(a, b, tol = CLUSTER_TOLERANCE_PX) {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(Number(a) - Number(b)) <= tol;
}

function captureClusterBaseline() {
  if (isEditingLocked()) return;
  const state = collectClusterState();
  if (!state) return;
  clusterBaseline = state;
}

function scheduleClusterBaselineCapture(delay = CLUSTER_CAPTURE_DELAY_MS) {
  clearTimeout(clusterCaptureTimer);
  clusterCaptureTimer = setTimeout(() => {
    if (!clusterRepairQueued && !document.hidden) {
      captureClusterBaseline();
    }
  }, delay);
}

function hasClusterDrift() {
  if (!clusterBaseline) return false;
  const cur = collectClusterState();
  if (!cur) return false;
  const checks = [
    ['logoTopToSearch', CLUSTER_TOLERANCE_PX],
    ['logoLeftToSearch', CLUSTER_TOLERANCE_PX],
    ['logoCenterToSearchCenter', CLUSTER_TOLERANCE_PX],
    ['hkTopToSearchBottom', CLUSTER_REL_TOLERANCE_PX],
    ['hkCenterToSearchCenter', CLUSTER_REL_TOLERANCE_PX],
    ['wrapTopToLogoTop', CLUSTER_REL_TOLERANCE_PX],
    ['wrapCenterToLogoCenter', CLUSTER_REL_TOLERANCE_PX],
    ['envCenterToWrapCenter', CLUSTER_REL_TOLERANCE_PX],
    ['pillCenterToWrapCenter', CLUSTER_REL_TOLERANCE_PX],
    ['toggleCenterToWrapCenter', CLUSTER_REL_TOLERANCE_PX],
    ['updateCenterToWrapCenter', CLUSTER_REL_TOLERANCE_PX],
    ['ahtTopToSearchTop', CLUSTER_REL_TOLERANCE_PX],
  ];

  for (const [key, tol] of checks) {
    if (!sameNumber(cur[key], clusterBaseline[key], tol)) return true;
  }

  if (cur.hasHk !== clusterBaseline.hasHk) return true;
  if (cur.hasWrap !== clusterBaseline.hasWrap) return true;
  if (cur.hasEnv !== clusterBaseline.hasEnv) return true;
  if (cur.hasPill !== clusterBaseline.hasPill) return true;
  if (cur.hasToggle !== clusterBaseline.hasToggle) return true;
  if (cur.hasUpdate !== clusterBaseline.hasUpdate) return true;
  if (cur.hasAht !== clusterBaseline.hasAht) return true;

  return false;
}

function queueClusterRepair() {
  if (clusterRepairQueued || isEditingLocked()) {
    if (isEditingLocked()) pendingRepair = true;
    return;
  }
  clusterRepairQueued = true;
  requestRepair(950);
  setTimeout(() => {
    clusterRepairQueued = false;
    if (!hasClusterDrift()) {
      captureClusterBaseline();
      return;
    }
    requestRepair(950);
    setTimeout(() => {
      clusterRepairQueued = false;
      if (!hasClusterDrift()) captureClusterBaseline();
    }, 260);
  }, 220);
}

function ensureClusterRepairLoop() {
  if (clusterTimer) return;
  clusterTimer = window.setInterval(() => {
    if (document.hidden || isEditingLocked()) return;
    if (!clusterBaseline) {
      captureClusterBaseline();
      return;
    }
    if (hasClusterDrift()) {
      queueClusterRepair();
    }
  }, CLUSTER_REPAIR_INTERVAL_MS);
}

function getBaselineElements() {
  return getWatchedElements().filter((el) => el && el.isConnected);
}

function shouldIgnoreBaselineForElement(el) {
  if (!(el instanceof Element)) return true;
  if (el.id === 'searchResults') return true;
  return false;
}

function captureBaseline() {
  if (isEditingLocked()) return;
  const next = new Map();
  for (const el of getBaselineElements()) {
    if (shouldIgnoreBaselineForElement(el)) continue;
    const r = el.getBoundingClientRect();
    next.set(el, {
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
  }
  if (next.size) baselineMap = next;
}

function scheduleBaselineCapture(delay = BASELINE_CAPTURE_DELAY_MS) {
  clearTimeout(baselineCaptureTimer);
  baselineCaptureTimer = setTimeout(() => {
    captureBaseline();
  }, delay);
}

function hasBaselineDrift() {
  if (!baselineMap || !baselineMap.size) return false;

  for (const [el, base] of baselineMap.entries()) {
    if (!el || !el.isConnected) continue;
    if (shouldIgnoreBaselineForElement(el)) continue;
    const r = el.getBoundingClientRect();
    const top = Math.round(r.top);
    const left = Math.round(r.left);
    const width = Math.round(r.width);
    const height = Math.round(r.height);

    if (
      Math.abs(top - base.top) > BASELINE_TOLERANCE_PX ||
      Math.abs(left - base.left) > BASELINE_TOLERANCE_PX ||
      Math.abs(width - base.width) > BASELINE_TOLERANCE_PX ||
      Math.abs(height - base.height) > BASELINE_TOLERANCE_PX
    ) {
      return true;
    }
  }

  return false;
}

function ensureBaselineRepairLoop() {
  if (baselineTimer) return;
  baselineTimer = window.setInterval(() => {
    if (document.hidden || isEditingLocked()) return;
    if (hasBaselineDrift()) {
      requestRepair(900);
      scheduleBaselineCapture(320);
    }
  }, BASELINE_REPAIR_INTERVAL_MS);
}

function shouldTrackEventTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.id && WATCH_IDS.includes(target.id)) return true;

  const cls = typeof target.className === 'string' ? target.className : '';
  if (
    cls.includes('search') ||
    cls.includes('hk-') ||
    cls.includes('mndo') ||
    target.closest('.search-container') ||
    target.closest('#MNDO_AHT_TAGS_STACK') ||
    target.closest('#hkSmartFloatingLine') ||
    target.closest('#UA07_SECRET_ENVELOPE_WRAP') ||
    target.closest('#MNDO_UA07_LOGO3')
  ) {
    return true;
  }

  return false;
}

function isRelevantMutationNode(node) {
  if (!(node instanceof Element)) return false;
  if (shouldTrackEventTarget(node)) return true;

  try {
    if (node.querySelector && node.querySelector(
      '#searchInput, #searchResults, #arabicNumber, #arabiccNumber, #hkSmartFloatingLine, #hkRawSourceInput, #hkRawSourceStatus, #MNDO_UA07_LOGO3, #UA07_LUX_LOGO_BETWEEN, #UA07_SECRET_ENVELOPE_WRAP, #UA07_SECRET_ENVELOPE, #UA07_ONLINE_COUNT, #EID_TOGGLE_BTN, #UA07_UPDATE_ICON, #mndoQueryTimer, #bat2, #copyBtn, #copyBtn1, .search-container, #MNDO_AHT_TAGS_STACK'
    )) {
      return true;
    }
  } catch {}

  return false;
}

function wireElementEvents(el) {
  if (!el || wired.has(el)) return;
  wired.add(el);

  const events = ['change', 'blur', 'mouseup', 'click', 'transitionend', 'animationend'];

  for (const evt of events) {
    try {
      el.addEventListener(evt, (event) => {
        const target = event && event.target instanceof Element ? event.target : el;
        if (isProtectedEditingTarget(target) && (evt === 'change' || evt === 'blur')) {
          noteEditingActivity(target);
          setTimeout(() => {
            if (!isEditingLocked()) {
              pendingRepair = false;
              requestRepair(650);
            }
          }, 25);
          return;
        }
        requestRepair();
      }, { passive: true });
    } catch {}
  }
}

function refreshObservers() {
  const elements = getWatchedElements();
  elements.forEach(wireElementEvents);

  if (!resizeObserver && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      requestRepair(700);
      scheduleClusterBaselineCapture(260);
    });
  }

  if (resizeObserver) {
    try { resizeObserver.disconnect(); } catch {}
    elements.forEach((el) => {
      try { resizeObserver.observe(el); } catch {}
    });
    try { resizeObserver.observe(document.body); } catch {}
  }

  if (!observer) {
    observer = new MutationObserver((mutations) => {
      let shouldSettle = false;
      let shouldRefresh = false;

      for (const m of mutations) {
        if (m.type === 'childList') {
          const targetRelevant = isRelevantMutationNode(m.target);
          const addedRelevant = Array.from(m.addedNodes || []).some(isRelevantMutationNode);
          const removedRelevant = Array.from(m.removedNodes || []).some(isRelevantMutationNode);

          if (targetRelevant || addedRelevant || removedRelevant) {
            shouldRefresh = true;
            shouldSettle = true;
            break;
          }

          continue;
        }
        if (m.type === 'attributes') {
          const t = m.target;
          if (!(t instanceof Element)) continue;
          if (shouldTrackEventTarget(t)) {
            shouldSettle = true;
          }
        }
      }

      if (shouldRefresh) refreshObservers();
      if (shouldSettle) requestRepair();
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  lastSignature = buildSignature();
  scheduleBaselineCapture(180);
  scheduleClusterBaselineCapture(220);
}

function initDocumentEvents() {
  document.addEventListener('beforeinput', (event) => {
    const target = event.target;
    if (target instanceof Element && event.isTrusted) {
      if (PRESERVE_VALUE_IDS.includes(target.id)) markAsUserEdited(target);
      if (isProtectedEditingTarget(target)) noteEditingActivity(target);
    }
  }, { passive: true, capture: true });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof Element && event.isTrusted) {
      if (PRESERVE_VALUE_IDS.includes(target.id)) markAsUserEdited(target);
      if (isProtectedEditingTarget(target)) {
        noteEditingActivity(target);
        return;
      }
    }
    if (shouldTrackEventTarget(target)) {
      requestRepair();
    }
  }, { passive: true, capture: true });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (isProtectedEditingTarget(target)) {
      noteEditingActivity(target);
      return;
    }
    if (shouldTrackEventTarget(target)) {
      requestRepair(900);
    }
  }, { passive: true, capture: true });

  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (isProtectedEditingTarget(target)) {
      noteEditingActivity(target);
      stopBurst();
      return;
    }
    if (shouldTrackEventTarget(target)) {
      startBurst(700);
    }
  }, { passive: true, capture: true });

  document.addEventListener('focusout', (event) => {
    const target = event.target;
    if (isProtectedEditingTarget(target)) {
      editLockUntil = Date.now() + 80;
      pendingRepair = true;
      setTimeout(() => {
        if (!isEditingLocked()) {
          pendingRepair = false;
          requestRepair(650);
        }
      }, 100);
    }
  }, { passive: true, capture: true });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof Element && event.isTrusted) {
      if (PRESERVE_VALUE_IDS.includes(target.id)) markAsUserEdited(target);
      if (isProtectedEditingTarget(target)) noteEditingActivity(target);
    }
  }, { passive: true, capture: true });

  document.addEventListener('paste', (event) => {
    const target = event.target;
    if (target instanceof Element && event.isTrusted) {
      if (PRESERVE_VALUE_IDS.includes(target.id)) markAsUserEdited(target);
      if (isProtectedEditingTarget(target)) noteEditingActivity(target);
    }
  }, { passive: true, capture: true });

  let scrollRepairRaf = 0;
  window.addEventListener('scroll', () => {
    if (scrollRepairRaf || isEditingLocked()) return;
    scrollRepairRaf = requestAnimationFrame(() => {
      scrollRepairRaf = 0;
      scheduleSettle();
    });
  }, { passive: true });
}

function init() {
  injectTopClusterStabilityStyle();
  if (initialized) {
    refreshObservers();
    ensureBaselineRepairLoop();
    ensureClusterRepairLoop();
    scheduleBaselineCapture(220);
    scheduleClusterBaselineCapture(260);
    requestRepair(900);
    return;
  }

  initialized = true;
  refreshObservers();
  initDocumentEvents();
  ensureBaselineRepairLoop();
  ensureClusterRepairLoop();
  scheduleBaselineCapture(220);
  scheduleClusterBaselineCapture(260);
  requestRepair(900);
  setTimeout(() => { requestRepair(700); }, 180);
  setTimeout(() => { requestRepair(700); }, 700);
  setTimeout(() => { requestRepair(550); }, 1200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

window.addEventListener('load', init, { once: true });
window.addEventListener('pageshow', () => {
  setTimeout(() => { requestRepair(900); }, 0);
  setTimeout(() => { scheduleBaselineCapture(120); }, 180);
  setTimeout(() => { scheduleClusterBaselineCapture(160); }, 220);
});
window.addEventListener('orientationchange', () => {
  requestRepair(900);
  scheduleBaselineCapture(260);
  scheduleClusterBaselineCapture(320);
}, { passive: true });
window.addEventListener('resize', () => {
  setTimeout(refreshObservers, 30);
  requestRepair(1200);
  scheduleBaselineCapture(260);
  scheduleClusterBaselineCapture(320);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    setTimeout(() => { requestRepair(900); }, 50);
    setTimeout(() => { requestRepair(900); }, 180);
    setTimeout(() => { scheduleBaselineCapture(120); }, 260);
    setTimeout(() => { scheduleClusterBaselineCapture(160); }, 300);
  }
});

if (document.fonts && typeof document.fonts.ready?.then === 'function') {
  document.fonts.ready.then(() => {
    setTimeout(() => { requestRepair(800); }, 0);
    setTimeout(() => { requestRepair(800); }, 120);
    setTimeout(() => { scheduleClusterBaselineCapture(160); }, 180);
  }).catch(() => {});
}
