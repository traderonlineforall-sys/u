// Layout stabilizer
//
// Purpose:
// - Preserve the original "reset-like" layout settling effect without clearing
//   important inputs.
// - Keep the UA07 logo and HK smart helper aligned automatically if they drift.
// - Avoid heavy work by throttling checks and never overlapping sync bursts.

(function(){
  var VALUE_IDS = ["arabicNumber", "arabiccNumber", "searchInput"];
  var DRIFT_THRESHOLD_PX = 14;
  var MONITOR_INTERVAL_MS = 1400;
  var BASELINE_CAPTURE_DELAY_MS = 1350;

  var syncInFlight = false;
  var baselineTimer = 0;
  var monitorTimer = 0;
  var rafToken = 0;
  var lastAutoFixAt = 0;
  var lastSyncAt = 0;

  var baselines = {
    logo: null,
    hk: null
  };

  function snapshotValues() {
    var out = {};
    for (var i = 0; i < VALUE_IDS.length; i++) {
      var id = VALUE_IDS[i];
      var el = document.getElementById(id);
      if (el) out[id] = el.value;
    }
    return out;
  }

  function restoreValues(snapshot) {
    if (!snapshot) return;
    Object.keys(snapshot).forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;
      var saved = snapshot[id];
      if (typeof saved !== "string") return;
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
    return document.getElementById("MNDO_UA07_LOGO3") ||
           document.getElementById("UA07_LUX_LOGO_BETWEEN") ||
           document.getElementById("MNDO_UA07_LOGO") ||
           null;
  }

  function findHk() {
    return document.getElementById("hkSmartFloatingLine") || null;
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

  function hasMeaningfulDrift(base, current) {
    if (!base || !current) return false;
    if (base.mode !== current.mode) return true;
    if (Math.abs(base.top - current.top) > DRIFT_THRESHOLD_PX) return true;
    if (Math.abs(base.left - current.left) > DRIFT_THRESHOLD_PX) return true;
    return false;
  }

  function refreshBaselines() {
    var logo = findLogo();
    var hk = findHk();
    var logoMeasure = measureElement(logo);
    var hkMeasure = measureElement(hk);
    if (logoMeasure) baselines.logo = logoMeasure;
    if (hkMeasure) baselines.hk = hkMeasure;
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
      restoreValues(snap);
      kickResize();
      kickScroll();
    }, 180);

    setTimeout(function(){
      restoreValues(snap);
      kickResize();
    }, 650);

    setTimeout(function(){
      restoreValues(snap);
      kickResize();
      syncInFlight = false;
      scheduleBaselineCapture();
    }, 1200);
  }

  function runAutoRealignIfNeeded() {
    if (document.hidden) return;

    var now = Date.now();
    if (now - lastAutoFixAt < 1800) return;
    if (now - lastSyncAt < 900) return;

    var logoCurrent = measureElement(findLogo());
    var hkCurrent = measureElement(findHk());

    var logoDrifted = !!(baselines.logo && logoCurrent && hasMeaningfulDrift(baselines.logo, logoCurrent));
    var hkDrifted = !!(baselines.hk && hkCurrent && hasMeaningfulDrift(baselines.hk, hkCurrent));

    if (!logoDrifted && !hkDrifted) return;

    lastAutoFixAt = now;
    safeLayoutSync({ preserveNumbers: true, automatic: true });
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
      if (!document.hidden) scheduleDriftCheck();
    }, MONITOR_INTERVAL_MS);
  }

  function bindManualResetBaselineRefresh() {
    document.addEventListener("click", function(event){
      var t = event && event.target;
      if (!t || !t.closest) return;
      var btn = t.closest("#headerResetBtn");
      if (!btn) return;
      setTimeout(function(){
        safeLayoutSync({ preserveNumbers: false, automatic: false });
      }, 80);
    }, true);
  }

  if (document.readyState === "complete") {
    setTimeout(function(){
      safeLayoutSync({ preserveNumbers: true, automatic: false });
    }, 0);
  } else {
    window.addEventListener("load", function(){
      setTimeout(function(){
        safeLayoutSync({ preserveNumbers: true, automatic: false });
      }, 0);
    }, { once: true });
  }

  window.addEventListener("pageshow", function(){
    setTimeout(function(){
      safeLayoutSync({ preserveNumbers: true, automatic: false });
    }, 0);
  });

  window.addEventListener("resize", scheduleDriftCheck, { passive: true });
  window.addEventListener("scroll", scheduleDriftCheck, { passive: true });

  document.addEventListener("visibilitychange", function(){
    if (!document.hidden) {
      setTimeout(function(){
        safeLayoutSync({ preserveNumbers: true, automatic: false });
      }, 80);
    }
  });

  bindManualResetBaselineRefresh();
  armAutoMonitor();
})();
