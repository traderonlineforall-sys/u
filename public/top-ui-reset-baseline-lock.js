(function(){
  "use strict";

  var SEARCH_SELECTOR = "#searchInput";
  var SEARCH_CONTAINER_SELECTOR = ".search-container";
  var LOGO_SELECTOR = "#MNDO_UA07_LOGO3";
  var HK_SELECTOR = "#hkSmartFloatingLine";
  var TIMER_SELECTOR = "#mndoQueryTimer";
  var TIMER_WRAP_SELECTOR = "#MNDO_AHT_TAGS_STACK";
  var RESET_SELECTORS = "#reset1, #bss_pkg, #mndoQTResetV10, button[type='reset'], input[type='reset']";
  var STYLE_ID = "mndo-top-ui-stabilizer-style-v2";

  var rafId = 0;
  var burstTimer = 0;
  var docObserver = null;
  var logoObserver = null;
  var searchObserver = null;

  function injectStyle(){
    var old = document.getElementById(STYLE_ID);
    if (old) return old;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "/* Final top UI stabilizer: header only, no SR logic touched */",
      ".search-container{position:relative !important; top:0 !important; margin-top:0 !important; padding-top:4px !important; z-index:2147483646 !important;}",
      ".search-container .search-input, #searchInput{margin-top:0 !important; box-sizing:border-box !important;}",
      LOGO_SELECTOR + "{position:absolute !important; z-index:9000 !important; right:auto !important; bottom:auto !important; margin:0 !important; transform:translateZ(0) !important;}",
      HK_SELECTOR + "{z-index:9000 !important;}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
    return style;
  }

  function q(sel){ return document.querySelector(sel); }

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

  function pageX(){ return window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0; }
  function pageY(){ return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0; }
  function round(n){ return Math.round(Number(n) || 0); }

  function normalizeSearch(){
    injectStyle();

    var container = findSearchContainer();
    var input = findSearchInput();
    if (!container || !input) return false;

    container.style.setProperty("position", "relative", "important");
    container.style.setProperty("top", "0px", "important");
    container.style.setProperty("margin-top", "0px", "important");
    container.style.setProperty("padding-top", "4px", "important");
    container.style.setProperty("z-index", "2147483646", "important");

    // Keep the original horizontal look and avoid the old drifting top-nudge logic.
    if (!container.style.transform || /translateX\(/i.test(container.style.transform) === false) {
      container.style.setProperty("transform", "translateX(5%)", "important");
    }

    input.style.setProperty("margin-top", "0px", "important");
    input.style.setProperty("box-sizing", "border-box", "important");

    // Clear accidental wrapper nudges introduced by older patches.
    var header = input.closest("header, .top-bar, .header-wrapper, .header, .topHeader");
    if (header) {
      header.style.setProperty("margin-top", "0px", "important");
      header.style.setProperty("padding-top", "4px", "important");
      header.style.removeProperty("transform");
      header.style.removeProperty("top");
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

    logo.style.setProperty("position", "absolute", "important");
    logo.style.setProperty("right", "auto", "important");
    logo.style.setProperty("bottom", "auto", "important");
    logo.style.setProperty("margin", "0", "important");
    logo.style.setProperty("transform", "translateZ(0)", "important");

    var top = round(sy + sr.top + ((sr.height - (logo.offsetHeight || 48)) / 2) - 1);
    if (top < sy + 6) top = sy + 6;

    var left;
    if (ar && ar.left > sr.right + 12) {
      var gapL = sx + sr.right + 10;
      var gapR = sx + ar.left - 10 - (logo.offsetWidth || 176);
      left = round((gapL + gapR) / 2);
      if (left < gapL) left = gapL;
      if (left > gapR) left = gapR;
    } else {
      left = round(sx + sr.left - (logo.offsetWidth || 176) - 12);
    }

    var minL = sx + 6;
    var maxL = sx + Math.max(6, window.innerWidth - (logo.offsetWidth || 176) - 6);
    if (left < minL) left = minL;
    if (left > maxL) left = maxL;

    logo.style.setProperty("top", top + "px", "important");
    logo.style.setProperty("left", left + "px", "important");
    return true;
  }

  function placeHk(){
    var input = findSearchInput();
    var hk = q(HK_SELECTOR);
    if (!input || !hk) return false;

    var rect = input.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;

    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 320;
    var viewportCap = Math.max(280, viewportWidth - 24);
    var width = Math.min(Math.max(rect.width, 320), 560, viewportCap);

    hk.style.setProperty("position", "fixed", "important");
    hk.style.setProperty("left", round(rect.left + (rect.width / 2)) + "px", "important");
    hk.style.setProperty("top", round(rect.bottom + 10) + "px", "important");
    hk.style.setProperty("width", round(width) + "px", "important");
    hk.style.setProperty("transform", "translateX(-50%)", "important");
    return true;
  }

  function stabilizeNow(){
    rafId = 0;
    normalizeSearch();
    placeLogo();
    placeHk();
  }

  function schedule(){
    if (rafId) return;
    rafId = requestAnimationFrame(stabilizeNow);
  }

  function burst(delay){
    clearTimeout(burstTimer);
    burstTimer = setTimeout(function(){
      schedule();
      setTimeout(schedule, 90);
      setTimeout(schedule, 260);
      setTimeout(schedule, 700);
    }, typeof delay === "number" ? delay : 0);
  }

  function observeSearch(){
    var container = findSearchContainer();
    if (!container || typeof MutationObserver === "undefined") return;
    if (searchObserver && searchObserver.__boundEl === container) return;
    if (searchObserver) {
      try { searchObserver.disconnect(); } catch(e){}
      searchObserver = null;
    }

    searchObserver = new MutationObserver(function(){ burst(0); });
    searchObserver.__boundEl = container;
    try {
      searchObserver.observe(container, { attributes: true, attributeFilter: ["style", "class"] });
    } catch(e){}
  }

  function observeLogo(){
    var logo = q(LOGO_SELECTOR);
    if (!logo || typeof MutationObserver === "undefined") return;
    if (logoObserver && logoObserver.__boundEl === logo) return;
    if (logoObserver) {
      try { logoObserver.disconnect(); } catch(e){}
      logoObserver = null;
    }

    var busy = false;
    logoObserver = new MutationObserver(function(){
      if (busy) return;
      busy = true;
      burst(0);
      setTimeout(function(){ busy = false; }, 40);
    });
    logoObserver.__boundEl = logo;
    try {
      logoObserver.observe(logo, { attributes: true, attributeFilter: ["style", "class"] });
    } catch(e){}
  }

  function observeDocument(){
    if (docObserver || typeof MutationObserver === "undefined") return;
    docObserver = new MutationObserver(function(){
      observeSearch();
      observeLogo();
      if (findSearchInput() && q(LOGO_SELECTOR)) burst(0);
    });
    try {
      docObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } catch(e){}
  }

  function bind(){
    window.addEventListener("load", function(){ burst(1200); }, { once: true });
    window.addEventListener("pageshow", function(){ burst(0); });
    window.addEventListener("resize", function(){ burst(40); }, { passive: true });
    window.addEventListener("scroll", function(){ schedule(); }, { passive: true });

    document.addEventListener("visibilitychange", function(){
      if (!document.hidden) burst(60);
    });

    document.addEventListener("input", function(e){
      var t = e.target;
      if (!t || !t.matches) return;
      if (t.matches(SEARCH_SELECTOR + ", #arabiccNumber, #arabicNumber")) {
        burst(0);
      }
    }, true);

    document.addEventListener("click", function(e){
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest(RESET_SELECTORS)) {
        burst(80);
      }
    }, true);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function(){ burst(60); }).catch(function(){});
    }

    observeDocument();
    observeSearch();
    observeLogo();
  }

  bind();

  if (document.readyState === "complete") {
    burst(900);
  } else if (document.readyState === "interactive") {
    burst(1200);
  } else {
    document.addEventListener("DOMContentLoaded", function(){ burst(1200); }, { once: true });
  }
})();
