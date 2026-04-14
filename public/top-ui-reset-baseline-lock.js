(function(){
  "use strict";

  var SEARCH_SELECTOR = "#searchInput";
  var SEARCH_CONTAINER_SELECTOR = ".search-container";
  var LOGO_SELECTOR = "#MNDO_UA07_LOGO3";
  var HK_SELECTOR = "#hkSmartFloatingLine";
  var TIMER_SELECTOR = "#mndoQueryTimer";
  var TIMER_WRAP_SELECTOR = "#MNDO_AHT_TAGS_STACK";
  var RESET_SELECTORS = "#reset1, #bss_pkg, #mndoQTResetV10, button[type='reset'], input[type='reset']";
  var STYLE_ID = "mndo-top-ui-reset-anchor-fix-v3";

  var rafId = 0;
  var burstTimer = 0;
  var observer = null;

  function q(sel){ return document.querySelector(sel); }
  function pageX(){ return window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0; }
  function pageY(){ return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0; }
  function round(n){ return Math.round(Number(n) || 0); }

  function ensureStyle(){
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "/* Top UI anchor fix: header only, no SR logic touched */",
      ".search-container{ position:relative !important; top:0 !important; margin-top:0 !important; padding-top:4px !important; }",
      ".search-container .search-input, #searchInput{ margin-top:0 !important; top:auto !important; }",
      "#MNDO_UA07_LOGO3{ position:absolute !important; right:auto !important; bottom:auto !important; margin:0 !important; z-index:9000 !important; transform:translateZ(0) !important; }",
      "#hkSmartFloatingLine{ z-index:9000 !important; }"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function findSearchInput(){
    return q(SEARCH_SELECTOR)
      || q("input.search-input")
      || q(".search-container input")
      || q("input[type='search']")
      || q("input[id*='search' i], input[class*='search' i]");
  }

  function findSearchContainer(){
    var input = findSearchInput();
    if (!input) return q(SEARCH_CONTAINER_SELECTOR);
    return input.closest(SEARCH_CONTAINER_SELECTOR) || input.parentElement || input;
  }

  function findTimerRect(){
    var wrap = q(TIMER_WRAP_SELECTOR);
    if (wrap) {
      var wr = wrap.getBoundingClientRect();
      if (wr.width > 0 && wr.height > 0) return wr;
    }
    var timer = q(TIMER_SELECTOR);
    if (timer) {
      var tr = timer.getBoundingClientRect();
      if (tr.width > 0 && tr.height > 0) return tr;
    }
    return null;
  }

  function normalizeSearch(){
    ensureStyle();

    var container = findSearchContainer();
    var input = findSearchInput();
    if (!container || !input) return false;

    container.style.setProperty("position", "relative", "important");
    container.style.setProperty("top", "0px", "important");
    container.style.setProperty("margin-top", "0px", "important");
    container.style.setProperty("padding-top", "4px", "important");
    container.style.removeProperty("transform");

    input.style.setProperty("margin-top", "0px", "important");
    input.style.removeProperty("top");
    input.style.removeProperty("transform");

    var header = input.closest("header, .top-bar, .header-wrapper, .header, .topHeader");
    if (header) {
      header.style.setProperty("margin-top", "0px", "important");
      header.style.setProperty("padding-top", "4px", "important");
      header.style.removeProperty("top");
      header.style.removeProperty("transform");
    }

    return true;
  }

  function placeLogo(){
    var input = findSearchInput();
    var logo = q(LOGO_SELECTOR);
    if (!input || !logo) return false;

    var sr = input.getBoundingClientRect();
    if (!(sr.width > 0 && sr.height > 0)) return false;

    var ar = findTimerRect();
    var sx = pageX();
    var sy = pageY();
    var logoW = logo.offsetWidth || 176;
    var logoH = logo.offsetHeight || 48;

    var top = round(sy + sr.top + ((sr.height - logoH) / 2) - 1);
    if (top < sy + 6) top = sy + 6;

    var left;
    if (ar && ar.left > sr.right + 12) {
      var gapL = sx + sr.right + 10;
      var gapR = sx + ar.left - 10 - logoW;
      left = round((gapL + gapR) / 2);
      if (left < gapL) left = gapL;
      if (left > gapR) left = gapR;
    } else {
      left = round(sx + sr.right + 12);
    }

    var minL = sx + 6;
    var maxL = sx + Math.max(6, window.innerWidth - logoW - 6);
    if (left < minL) left = minL;
    if (left > maxL) left = maxL;

    logo.style.setProperty("position", "absolute", "important");
    logo.style.setProperty("top", top + "px", "important");
    logo.style.setProperty("left", left + "px", "important");
    logo.style.setProperty("width", logoW + "px", "important");
    logo.style.setProperty("height", logoH + "px", "important");
    logo.style.setProperty("right", "auto", "important");
    logo.style.setProperty("bottom", "auto", "important");
    logo.style.setProperty("margin", "0", "important");
    logo.style.setProperty("transform", "translateZ(0)", "important");
    return true;
  }

  function placeHK(){
    var line = q(HK_SELECTOR);
    var input = findSearchInput();
    if (!line || !input) return false;
    var sr = input.getBoundingClientRect();
    if (!(sr.width > 0 && sr.height > 0)) return false;

    var centerX = round(sr.left + (sr.width / 2));
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 320;
    var viewportCap = Math.max(280, viewportWidth - 24);
    var width = Math.min(Math.max(sr.width, 320), 560, viewportCap);

    line.style.setProperty("left", centerX + "px", "important");
    line.style.setProperty("top", round(sr.bottom + 10) + "px", "important");
    line.style.setProperty("width", round(width) + "px", "important");
    line.style.setProperty("min-width", round(width) + "px", "important");
    line.style.setProperty("max-width", round(width) + "px", "important");
    line.style.setProperty("transform", "translateX(-50%)", "important");
    return true;
  }

  function apply(){
    rafId = 0;
    normalizeSearch();
    placeLogo();
    placeHK();
  }

  function schedule(){
    if (rafId) return;
    rafId = requestAnimationFrame(apply);
  }

  function burst(){
    clearTimeout(burstTimer);
    schedule();
    setTimeout(schedule, 60);
    setTimeout(schedule, 180);
    setTimeout(schedule, 420);
    setTimeout(schedule, 900);
    burstTimer = setTimeout(schedule, 1600);
  }

  function bindObserver(){
    if (observer || typeof MutationObserver === "undefined") return;
    observer = new MutationObserver(function(muts){
      for (var i = 0; i < muts.length; i += 1) {
        var m = muts[i];
        if (m.type === "childList" || (m.type === "attributes" && m.target)) {
          schedule();
          break;
        }
      }
    });
    try {
      observer.observe(document.documentElement || document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["style", "class"]
      });
    } catch (e) {}
  }

  function boot(){
    burst();
    bindObserver();

    window.addEventListener("resize", function(){ burst(); }, { passive:true });
    window.addEventListener("scroll", function(){ schedule(); }, { passive:true });
    window.addEventListener("pageshow", function(){ burst(); });
    window.addEventListener("load", function(){ burst(); }, { once:true });

    document.addEventListener("visibilitychange", function(){
      if (!document.hidden) burst();
    });

    document.addEventListener("click", function(e){
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest(RESET_SELECTORS)) {
        setTimeout(burst, 50);
        setTimeout(burst, 280);
        setTimeout(burst, 850);
      }
    }, true);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function(){ burst(); }).catch(function(){});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  } else {
    boot();
  }
})();
