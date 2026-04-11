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
  'MNDO_UA07_LOGO3',
  'UA07_LUX_LOGO_BETWEEN',
  'mndoQueryTimer',
  'bat2',
  'copyBtn',
  'copyBtn1'
];

const PRESERVE_VALUE_IDS = ['arabicNumber', 'arabiccNumber', 'searchInput'];
const EDIT_LOCK_MS = 420;
const BURST_MS = 850;
const MIN_SETTLE_GAP_MS = 90;

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
    target.closest('#hkSmartFloatingLine')
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
      '#searchInput, #searchResults, #arabicNumber, #arabiccNumber, #hkSmartFloatingLine, #MNDO_UA07_LOGO3, #UA07_LUX_LOGO_BETWEEN, #mndoQueryTimer, #bat2, #copyBtn, #copyBtn1, .search-container, #MNDO_AHT_TAGS_STACK'
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
  if (initialized) {
    refreshObservers();
    requestRepair(900);
    return;
  }

  initialized = true;
  refreshObservers();
  initDocumentEvents();
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
});
window.addEventListener('orientationchange', () => {
  requestRepair(900);
}, { passive: true });
window.addEventListener('resize', () => {
  setTimeout(refreshObservers, 30);
  requestRepair(1200);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    setTimeout(() => { requestRepair(900); }, 50);
    setTimeout(() => { requestRepair(900); }, 180);
  }
});

if (document.fonts && typeof document.fonts.ready?.then === 'function') {
  document.fonts.ready.then(() => {
    setTimeout(() => { requestRepair(800); }, 0);
    setTimeout(() => { requestRepair(800); }, 120);
  }).catch(() => {});
}
