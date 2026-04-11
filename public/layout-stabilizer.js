// Header / top-tools layout stabilizer
//
// Goal:
// Keep the top row steady (search + Haya Karima line + UA07 logo + AHT/Tags)
// without requiring the user to manually press Reset.
//
// Strategy:
// - Reuse the existing placement logic already wired in app.js by dispatching
//   a lightweight synthetic resize event.
// - Trigger that settle only when relevant top-header elements change.
// - Debounce aggressively so we avoid visible jumping or heavy observers.

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

const PRESERVE_VALUE_IDS = ['arabicNumber', 'arabiccNumber'];

let rafId = 0;
let settleTimer = 0;
let settleTimerLate = 0;
let observer = null;
let resizeObserver = null;
let wired = new WeakSet();
let lastRun = 0;

function isMeaningfulValue(value) {
  return String(value || '').trim() !== '';
}

function snapshotPreservedValues() {
  return PRESERVE_VALUE_IDS.map((id) => {
    const el = document.getElementById(id);
    return {
      id,
      value: el ? String(el.value || '') : '',
      selectionStart: el && typeof el.selectionStart === 'number' ? el.selectionStart : null,
      selectionEnd: el && typeof el.selectionEnd === 'number' ? el.selectionEnd : null,
    };
  });
}

function restorePreservedValues(snapshot) {
  if (!Array.isArray(snapshot) || !snapshot.length) return;

  for (const item of snapshot) {
    if (!item || !isMeaningfulValue(item.value)) continue;

    const el = document.getElementById(item.id);
    if (!el) continue;

    const currentValue = String(el.value || '');
    const isActive = document.activeElement === el;

    if (!isMeaningfulValue(currentValue) && !isActive) {
      try {
        el.value = item.value;
        if (typeof item.selectionStart === 'number' && typeof item.selectionEnd === 'number' && typeof el.setSelectionRange === 'function') {
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
  // Guard against very tight loops.
  if (now - lastRun < 70) return;
  lastRun = now;

  kickResize();
  // Catch late style/font/layout shifts.
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

  return out;
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
      el.addEventListener(evt, scheduleSettle, { passive: true });
    } catch {}
  }
}

function refreshObservers() {
  const elements = getWatchedElements();
  elements.forEach(wireElementEvents);

  if (!resizeObserver && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => scheduleSettle());
  }

  if (resizeObserver) {
    try { resizeObserver.disconnect(); } catch {}
    elements.forEach(el => {
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
          if (!t || !(t instanceof Element)) continue;
          const id = t.id || '';
          const cls = typeof t.className === 'string' ? t.className : '';
          if (
            WATCH_IDS.includes(id) ||
            cls.includes('search') ||
            cls.includes('hk-') ||
            id.includes('UA07') ||
            id.includes('mndo')
          ) {
            shouldSettle = true;
          }
        }
      }

      if (shouldRefresh) refreshObservers();
      if (shouldSettle) scheduleSettle();
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }
}

function init() {
  refreshObservers();
  scheduleSettle();
  setTimeout(scheduleSettle, 180);
  setTimeout(scheduleSettle, 700);
  setTimeout(scheduleSettle, 1400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

window.addEventListener('load', init, { once: true });
window.addEventListener('pageshow', () => setTimeout(scheduleSettle, 0));
window.addEventListener('orientationchange', scheduleSettle, { passive: true });
window.addEventListener('resize', () => setTimeout(refreshObservers, 30), { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    setTimeout(scheduleSettle, 50);
    setTimeout(scheduleSettle, 180);
  }
});

if (document.fonts && typeof document.fonts.ready?.then === 'function') {
  document.fonts.ready.then(() => {
    setTimeout(scheduleSettle, 0);
    setTimeout(scheduleSettle, 120);
  }).catch(() => {});
}
