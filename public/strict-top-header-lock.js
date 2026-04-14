(function () {
  "use strict";

  var LOGO_IDS = ["MNDO_UA07_LOGO3", "MNDO_UA07_LOGO", "UA07_LUX_LOGO_BETWEEN"];
  var SEARCH_ID = "searchInput";
  var AHT_ID = "mndoQueryTimer";
  var HK_ID = "hkSmartFloatingLine";
  var raf = 0;
  var booted = false;

  function pageX() {
    return window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  }

  function pageY() {
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function findLogo() {
    for (var i = 0; i < LOGO_IDS.length; i += 1) {
      var el = document.getElementById(LOGO_IDS[i]);
      if (el) return el;
    }
    return null;
  }

  function findSearch() {
    return document.getElementById(SEARCH_ID)
      || document.querySelector("input.search-input")
      || document.querySelector(".search-container input")
      || document.querySelector("input[type='search']")
      || document.querySelector("input[id*='search' i], input[class*='search' i]");
  }

  function findAht() {
    return document.getElementById(AHT_ID)
      || document.querySelector("#MNDO_AHT_TAGS_STACK #" + AHT_ID);
  }

  function prepareLogo(logo) {
    if (!logo) return;
    logo.style.position = "absolute";
    logo.style.zIndex = "9000";
    logo.style.pointerEvents = "auto";
    logo.style.willChange = "auto";
    var svg = logo.querySelector("svg");
    if (svg) svg.style.pointerEvents = "auto";
  }

  function lockLogo() {
    var logo = findLogo();
    var search = findSearch();
    if (!logo || !search) return false;

    prepareLogo(logo);

    var aht = findAht();
    var sx = pageX();
    var sy = pageY();
    var sr = search.getBoundingClientRect();
    var ar = aht ? aht.getBoundingClientRect() : null;

    if (!sr || !sr.width || !sr.height) return false;

    var top = Math.round(sy + sr.top + ((sr.height - logo.offsetHeight) / 2)) - 1;
    if (top < (sy + 6)) top = sy + 6;

    var left;
    if (ar && ar.width > 0 && ar.left > sr.right + 12) {
      var gapL = sx + sr.right + 10;
      var gapR = sx + ar.left - 10 - logo.offsetWidth;
      left = Math.round((gapL + gapR) / 2);
      if (left < gapL) left = gapL;
      if (left > gapR) left = gapR;
    } else {
      left = Math.round(sx + sr.left - logo.offsetWidth - 12);
    }

    var minL = sx + 6;
    var maxL = sx + Math.max(6, (window.innerWidth - logo.offsetWidth - 6));
    left = clamp(left, minL, maxL);

    logo.style.top = top + "px";
    logo.style.left = left + "px";
    return true;
  }

  function lockHk() {
    var line = document.getElementById(HK_ID);
    var search = findSearch();
    if (!line || !search) return false;

    var rect = search.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return false;

    var centerX = rect.left + (rect.width / 2);
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 320;
    var viewportCap = Math.max(280, viewportWidth - 24);

    line.style.position = "absolute";
    line.style.zIndex = "9000";
    line.style.left = (pageX() + centerX) + "px";
    line.style.top = (pageY() + rect.bottom + 10) + "px";
    line.style.width = Math.min(Math.max(rect.width, 320), 560, viewportCap) + "px";
    return true;
  }

  function lockAll() {
    raf = 0;
    lockLogo();
    lockHk();
  }

  function schedule(delays) {
    var arr = Array.isArray(delays) ? delays : [0];
    arr.forEach(function (ms) {
      setTimeout(function () {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(lockAll);
      }, ms);
    });
  }

  function boot() {
    if (booted) return;
    booted = true;

    schedule([0, 100, 260, 520, 1000]);

    var tries = 0;
    var poll = setInterval(function () {
      tries += 1;
      lockAll();
      if ((findLogo() && findSearch() && document.getElementById(HK_ID)) || tries > 80) {
        clearInterval(poll);
      }
    }, 150);

    window.addEventListener("resize", function () {
      schedule([40, 140, 320]);
    }, { passive: true });

    window.addEventListener("pageshow", function () {
      schedule([0, 120, 320]);
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule([80, 240, 520]);
    });

    document.addEventListener("reset", function () {
      schedule([30, 120, 280, 520]);
    }, true);

    document.addEventListener("click", function (event) {
      var target = event && event.target;
      if (!target) return;
      if (target.closest && (target.closest("#tabs .tablinks") || target.closest("#headerResetBtn"))) {
        schedule([40, 140, 300, 620]);
      }
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.addEventListener("load", function () {
    schedule([0, 120, 300, 680]);
  }, { once: true });
})();
