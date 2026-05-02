// Layout stabilizer
//
// Purpose:
// - Preserve reset-like layout settling without clearing important inputs.
// - Protect live Arabic number fields from accidental overwrite during sync bursts.
//
// Note:
// - Logo/header stabilization was removed because UA07 logo/envelope are now structural HTML.

(function(){
  var VALUE_IDS = ["arabicNumber", "arabiccNumber"];
  var USER_EDIT_GRACE_MS = 2600;

  var syncInFlight = false;
  var lastUserEditAt = Object.create(null);

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

  function safeLayoutSync(options) {
    options = options || {};
    if (syncInFlight) return;

    syncInFlight = true;

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
    }, 1200);
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

  document.addEventListener("visibilitychange", function(){
    if (!document.hidden) {
      setTimeout(function(){
        safeLayoutSync({ automatic: true });
      }, 80);
    }
  });

  bindLiveEditProtection();
  bindManualResetBaselineRefresh();
})();
