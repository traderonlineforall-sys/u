// Layout stabilizer
//
// Some UI elements (UA07 logo, envelope, timer, tags) are positioned by app.js
// after dynamic sizing. On some browsers / cached loads, this can render
// slightly off until a refresh. Triggering a few safe "resize" events after load
// helps the existing layout logic settle without touching the core tool logic.

function kickResize() {
  try {
    window.dispatchEvent(new Event("resize"));
  } catch {}
}

function burst() {
  // Keep this VERY lightweight.
  // Too many synthetic resize events can cause visible "jumping" (flash) for
  // elements that reposition on resize (UA07/AHT/Tags).
  kickResize();
  setTimeout(kickResize, 400);
  setTimeout(kickResize, 1200);
}

// Run after the page is fully loaded
window.addEventListener("load", burst, { once: true });

// BFCache / back-forward
window.addEventListener("pageshow", () => setTimeout(burst, 0));

// When returning to the tab
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) setTimeout(kickResize, 80);
});

// NOTE: We intentionally avoid a MutationObserver here.
// It can create repeated resize nudges and cause layout "flash".
