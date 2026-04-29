// Layout stabilizer
//
// Purpose:
// - Preserve the original "reset-like" layout settling effect without clearing
//   important inputs.
// - Keep the UA07 logo and HK smart helper aligned automatically if they drift.
// - Avoid heavy work by throttling checks and never overlapping sync bursts.
// - Prefer direct pinning back to the reset-default baseline before any reset-like sync.

(function(){
  var VALUE_IDS = ["arabicNumber", "arabiccNumber", "searchInput"];
  var DRIFT_THRESHOLD_PX = 10;
  var MONITOR_INTERVAL_MS = 1000;
  var BASELINE_CAPTURE_DELAY_MS = 1350;
  var USER_EDIT_GRACE_MS = 2600;

  var syncInFlight = false;
  var baselineTimer = 0;
  var monitorTimer = 0;
  var rafToken = 0;
  var lastAutoFixAt = 0;
  var lastSyncAt = 0;
  var trackedObservers = { hk: null };
  var trackedElements = { hk: null };
  var lastUserEditAt = Object.create(null);

  var baselines = {
    hk: null
  };

  function markRecentUserEdit(id) {
    if (!id) return;
    lastUserEditAt[id] = Date.now();
  }

  function wasRecentlyEdited(id) {
    var ts = lastUserEditAt[id] || 0;
    return !!ts && (Date.now() - ts) < USER_EDIT_GRACE_MS;
  }

  function isProtectedLiveField(id) {
    return id === "arabicNumber" || id === "arabiccNumber";
  }

  function snapshotValues() {
    var out = {};
    for (var i = 0; i < VALUE_IDS.length; i++) {
      var id = VALUE_IDS[i];
      var el = document.getElementById(id);
      if (el) out[id] = el.value;
    }
    return out;
  }

  function restoreValues(snapshot, options) {
    if (!snapshot) return;
    options = options || {};
    Object.keys(snapshot).forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;
      var saved = snapshot[id];
      if (typeof saved !== "string") return;

      if (options.automatic && isProtectedLiveField(id)) {
        if (document.activeElement === el || wasRecentlyEdited(id)) {
          return;
        }
      }

      if (el.value !== saved) {
        el.value = saved;
        try {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (_) {}
      }
    });
  }

  function kickResize() {
    try { window.dispatchEvent(new Event("resize")); } catch (_) {}
  }

  function kickScroll() {
    try { window.dispatchEvent(new Event("scroll")); } catch (_) {}
  }

  function isVisible(el) {
    if (!el) return false;
    try {
      var cs = window.getComputedStyle(el);
      if (!cs || cs.display === "none" || cs.visibility === "hidden") return false;
      var r = el.getBoundingClientRect();
      return !!r && r.width > 0 && r.height > 0;
    } catch (_) {
      return false;
    }
  }

  function findLogo() {
    return null;
  }

  function findHk() {
    return document.getElementById("hkSmartFloatingLine") || null;
  }

  function getStyleSnapshot(el) {
    if (!el || !el.style) return null;
    return {
      position: el.style.position || "",
      top: el.style.top || "",
      left: el.style.left || "",
      right: el.style.right || "",
      bottom: el.style.bottom || "",
      width: el.style.width || "",
      transform: el.style.transform || ""
    };
  }

  function measureElement(el) {
    if (!isVisible(el)) return null;
    try {
      var rect = el.getBoundingClientRect();
      var cs = window.getComputedStyle(el);
      var mode = (cs.position === "fixed" || cs.position === "sticky") ? "viewport" : "document";
      var top = mode === "viewport" ? rect.top : rect.top + window.scrollY;
      var left = mode === "viewport" ? rect.left : rect.left + window.scrollX;
      return {
        mode: mode,
        top: Math.round(top),
        left: Math.round(left),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    } catch (_) {
      return null;
    }
  }

  function captureState(el) {
    var measure = measureElement(el);
    if (!measure) return null;
    return {
      measure: measure,
      style: getStyleSnapshot(el)
    };
  }

  function hasMeaningfulDrift(base, current) {
    if (!base || !current) return false;
    if (base.mode !== current.mode) return true;
    if (Math.abs(base.top - current.top) > DRIFT_THRESHOLD_PX) return true;
    if (Math.abs(base.left - current.left) > DRIFT_THRESHOLD_PX) return true;
    return false;
  }

  function optimizeTrackedElement(el) {
    if (!el || !el.style) return;
    try {
      el.style.willChange = "top, left, transform";
      if (!el.style.backfaceVisibility) el.style.backfaceVisibility = "hidden";
      if (!el.style.transformOrigin) el.style.transformOrigin = "center top";
    } catch (_) {}
  }

  function applyBaselineStyle(el, baseline) {
    if (!el || !baseline || !baseline.style || !el.style) return false;
    var s = baseline.style;
    try {
      if (s.position) el.style.position = s.position;
      if (s.top) el.style.top = s.top;
      if (s.left) el.style.left = s.left;
      if (s.right) el.style.right = s.right;
      if (s.bottom) el.style.bottom = s.bottom;
      if (s.width) el.style.width = s.width;
      if (s.transform) el.style.transform = s.transform;
      optimizeTrackedElement(el);
      return true;
    } catch (_) {
      return false;
    }
  }

  function attachTrackedObserver(key, el) {
    if (!el || !window.MutationObserver) return;
    if (trackedObservers[key] && trackedElements[key] === el) return;
    if (trackedObservers[key]) {
      try { trackedObservers[key].disconnect(); } catch (_) {}
      trackedObservers[key] = null;
    }
    trackedElements[key] = el;
    try {
      var observer = new MutationObserver(function(){
        scheduleDriftCheck();
      });
      observer.observe(el, { attributes: true, attributeFilter: ["style", "class"] });
      trackedObservers[key] = observer;
    } catch (_) {}
  }

  function ensureTrackedObservers() {
    attachTrackedObserver("hk", findHk());
  }

  function refreshBaselines() {
    var hk = findHk();
    optimizeTrackedElement(hk);
    ensureTrackedObservers();
    var hkState = captureState(hk);
    if (hkState) baselines.hk = hkState;
  }

  function scheduleBaselineCapture() {
    clearTimeout(baselineTimer);
    baselineTimer = setTimeout(refreshBaselines, BASELINE_CAPTURE_DELAY_MS);
  }

  function safeLayoutSync(options) {
    options = options || {};
    if (syncInFlight) {
      scheduleBaselineCapture();
      return;
    }

    syncInFlight = true;
    lastSyncAt = Date.now();

    var snap = snapshotValues();

    kickResize();
    setTimeout(function(){
      restoreValues(snap, options);
      kickResize();
      kickScroll();
    }, 180);

    setTimeout(function(){
      restoreValues(snap, options);
      kickResize();
    }, 650);

    setTimeout(function(){
      restoreValues(snap, options);
      kickResize();
      syncInFlight = false;
      scheduleBaselineCapture();
    }, 1200);
  }

  function currentDriftState() {
    var hkCurrent = measureElement(findHk());

    return {
      hkCurrent: hkCurrent,
      logoDrifted: false,
      hkDrifted: !!(baselines.hk && hkCurrent && hasMeaningfulDrift(baselines.hk.measure, hkCurrent))
    };
  }

  function tryDirectPin() {
    var pinned = false;
    var hk = findHk();
    var state = currentDriftState();

    if (state.hkDrifted && hk && baselines.hk) {
      pinned = applyBaselineStyle(hk, baselines.hk) || pinned;
    }

    if (pinned) {
      kickResize();
      kickScroll();
    }

    return pinned;
  }

  function runAutoRealignIfNeeded() {
    if (document.hidden) return;

    var now = Date.now();
    if (now - lastAutoFixAt < 1500) return;
    if (now - lastSyncAt < 700) return;

    var state = currentDriftState();
    if (!state.logoDrifted && !state.hkDrifted) return;

    lastAutoFixAt = now;

    if (tryDirectPin()) {
      setTimeout(function(){
        var postPin = currentDriftState();
        if (postPin.logoDrifted || postPin.hkDrifted) {
          safeLayoutSync({ automatic: true });
        } else {
          scheduleBaselineCapture();
        }
      }, 120);
      return;
    }

    safeLayoutSync({ automatic: true });
  }

  function scheduleDriftCheck() {
    if (rafToken) return;
    rafToken = window.requestAnimationFrame(function(){
      rafToken = 0;
      runAutoRealignIfNeeded();
    });
  }

  function armAutoMonitor() {
    if (monitorTimer) clearInterval(monitorTimer);
    monitorTimer = setInterval(function(){
      ensureTrackedObservers();
      if (!document.hidden) scheduleDriftCheck();
    }, MONITOR_INTERVAL_MS);
  }


  function bindLiveEditProtection() {
    ["input", "change", "paste", "keyup", "focusin"].forEach(function(eventName){
      document.addEventListener(eventName, function(event){
        var t = event && event.target;
        if (!t || !t.id) return;
        if (!isProtectedLiveField(t.id)) return;
        markRecentUserEdit(t.id);
      }, true);
    });
  }

  function bindManualResetBaselineRefresh() {
    document.addEventListener("click", function(event){
      var t = event && event.target;
      if (!t || !t.closest) return;
      var btn = t.closest("#headerResetBtn");
      if (!btn) return;
      setTimeout(function(){
        safeLayoutSync({ automatic: false, manualReset: true });
      }, 80);
    }, true);
  }

  if (document.readyState === "complete") {
    setTimeout(function(){
      safeLayoutSync({ automatic: true });
    }, 0);
  } else {
    window.addEventListener("load", function(){
      setTimeout(function(){
        safeLayoutSync({ automatic: true });
      }, 0);
    }, { once: true });
  }

  window.addEventListener("pageshow", function(){
    setTimeout(function(){
      safeLayoutSync({ automatic: true });
    }, 0);
  });

  window.addEventListener("resize", scheduleDriftCheck, { passive: true });
  window.addEventListener("scroll", scheduleDriftCheck, { passive: true });

  document.addEventListener("visibilitychange", function(){
    if (!document.hidden) {
      setTimeout(function(){
        safeLayoutSync({ automatic: true });
      }, 80);
    }
  });

  bindLiveEditProtection();
  bindManualResetBaselineRefresh();
  armAutoMonitor();
})();
