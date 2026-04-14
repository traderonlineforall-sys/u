// Layout stabilizer
//
// Some UI elements (UA07 logo, envelope, timer, tags) are positioned by app.js
// after dynamic sizing. On some browsers / cached loads, this can render
// slightly off until a refresh. This file performs a SAFE layout-only sync on
// load / refresh / tab-return without clearing the landline or other key inputs.

(function(){
  function snapshotValues() {
    var ids = ["arabicNumber", "arabiccNumber", "searchInput"];
    var out = {};
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) out[ids[i]] = el.value;
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

  function safeLayoutSync() {
    var snap = snapshotValues();

    // A tiny burst mimics the layout-settling effect users were getting after
    // pressing reset / refreshing, but keeps form values intact.
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
    }, 1200);
  }

  if (document.readyState === "complete") {
    setTimeout(safeLayoutSync, 0);
  } else {
    window.addEventListener("load", function(){ setTimeout(safeLayoutSync, 0); }, { once: true });
  }

  window.addEventListener("pageshow", function(){ setTimeout(safeLayoutSync, 0); });

  document.addEventListener("visibilitychange", function(){
    if (!document.hidden) {
      setTimeout(function(){
        var snap = snapshotValues();
        kickResize();
        setTimeout(function(){ restoreValues(snap); kickResize(); }, 120);
      }, 80);
    }
  });
})();
