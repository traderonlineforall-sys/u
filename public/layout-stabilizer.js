// Header / top-tools layout stabilizer
//
// Goal:
// Keep the top row steady (search + Haya Karima line + UA07 logo + AHT/Tags)
// inside the same tab, without needing Reset or switching tabs.
//
// Strategy:
// - Reuse the existing placement logic in app.js by dispatching a synthetic resize.
// - Preserve typed values before each settle.
// - Watch only the relevant top-header elements.
// - Run a short requestAnimationFrame burst after real interactions so if the
//   header drifts a little, it gets corrected immediately with very low cost.

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
const BURST_MS = 1200;
const MIN_SETTLE_GAP_MS = 70;

let rafId = 0;
let settleTimer = 0;
let settleTimerLate = 0;
let burstRaf = 0;
let burstUntil = 0;
let observer = null;
let resizeObserver = null;
let wired = new WeakSet();
let lastRun = 0;
let lastSignature = '';
let initialized = false;

function isMeaningfulValue(value) {
  return String(value || '').trim() !== '';
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

    if (!wantedValue) continue;
    if (currentValue === wantedValue) continue;

    if (!isMeaningfulValue(currentValue) || !isActive) {
      try {
        el.value = wantedValue;
        if (
          typeof item.selectionStart === 'number' &&
          typeof item.selectionEnd === 'number' &&
          typeof el.setSelectionRange === 'function' &&
          document.activeElement === el
        ) {
          el.setSelectionRange(item.selectionStart, item.selectionEnd);
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    }
  }
}

function kickResize() {
  const snapshot = snapshotPreservedValues();

  try {
    window.dispatchEvent(new Event('resize'));
  } catch {}

  setTimeout(() => restorePreservedValues(snapshot), 0);
  setTimeout(() => restorePreservedValues(snapshot), 90);
  setTimeout(() => restorePreservedValues(snapshot), 220);
}

function runSettleBurst() {
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
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    runSettleBurst();
  });
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

function wireElementEvents(el) {
  if (!el || wired.has(el)) return;
  wired.add(el);

  const events = [
    'input', 'change', 'focus', 'blur', 'keyup', 'mouseup', 'click',
    'transitionend', 'animationend'
  ];

  for (const evt of events) {
    try {
      el.addEventListener(evt, () => {
        scheduleSettle();
        startBurst();
      }, { passive: true });
    } catch {}
  }
}

function refreshObservers() {
  const elements = getWatchedElements();
  elements.forEach(wireElementEvents);

  if (!resizeObserver && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      scheduleSettle();
      startBurst(700);
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
          shouldRefresh = true;
          shouldSettle = true;
          break;
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
      if (shouldSettle) {
        scheduleSettle();
        startBurst();
      }
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
  document.addEventListener('input', (event) => {
    if (shouldTrackEventTarget(event.target)) {
      scheduleSettle();
      startBurst();
    }
  }, { passive: true, capture: true });

  document.addEventListener('click', (event) => {
    if (shouldTrackEventTarget(event.target)) {
      scheduleSettle();
      startBurst(900);
    }
  }, { passive: true, capture: true });

  document.addEventListener('focusin', (event) => {
    if (shouldTrackEventTarget(event.target)) {
      startBurst(900);
    }
  }, { passive: true, capture: true });

  window.addEventListener('scroll', () => {
    startBurst(500);
  }, { passive: true });
}

function init() {
  if (initialized) {
    refreshObservers();
    scheduleSettle();
    startBurst(900);
    return;
  }

  initialized = true;
  refreshObservers();
  initDocumentEvents();
  scheduleSettle();
  startBurst(1500);
  setTimeout(() => { scheduleSettle(); startBurst(800); }, 180);
  setTimeout(() => { scheduleSettle(); startBurst(800); }, 700);
  setTimeout(() => { scheduleSettle(); startBurst(800); }, 1400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

window.addEventListener('load', init, { once: true });
window.addEventListener('pageshow', () => {
  setTimeout(() => { scheduleSettle(); startBurst(1200); }, 0);
});
window.addEventListener('orientationchange', () => {
  scheduleSettle();
  startBurst(1200);
}, { passive: true });
window.addEventListener('resize', () => {
  setTimeout(refreshObservers, 30);
  startBurst(1200);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    setTimeout(() => { scheduleSettle(); startBurst(1200); }, 50);
    setTimeout(() => { scheduleSettle(); startBurst(900); }, 180);
  }
});

if (document.fonts && typeof document.fonts.ready?.then === 'function') {
  document.fonts.ready.then(() => {
    setTimeout(() => { scheduleSettle(); startBurst(800); }, 0);
    setTimeout(() => { scheduleSettle(); startBurst(800); }, 120);
  }).catch(() => {});
}
