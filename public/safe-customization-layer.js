(function () {
  "use strict";

  if (window.__safeCustomizationLayerLoaded) return;
  window.__safeCustomizationLayerLoaded = true;

  var ROOT = document.documentElement;
  var BODY = document.body;

  /**
   * Safe Customization Layer
   *
   * Purpose:
   * - Provide a stable, additive hook point for future customizations.
   * - Keep legacy SR logic, app.js behavior, and menu markup untouched.
   *
   * Protected files (do not edit unless explicitly requested):
   * - public/app.js
   * - public/index.html
   * - SR/menu data sources and menu HTML
   *
   * Safe files for future changes:
   * - public/safe-customization-layer.js
   * - public/safe-customization-layer.css
   * - future optional customization modules loaded from this layer
   */

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
      return;
    }
    fn();
  }

  function ensureCssLoaded() {
    if (document.getElementById("safeCustomizationLayerCss")) return;

    var link = document.createElement("link");
    link.id = "safeCustomizationLayerCss";
    link.rel = "stylesheet";
    link.href = "./safe-customization-layer.css?v=header-align-v6";
    document.head.appendChild(link);
  }

  function setStateClass(target, className, on) {
    if (!target) return;
    target.classList.toggle(className, !!on);
  }

  function detectTheme() {
    var eidEnabled = !!document.getElementById("eidThemeLink");
    var ramadanEnabled = !!document.querySelector('link[href*="ramadan-theme.css"]');
    var ahlyEnabled = !!document.querySelector('link[href*="ahly-premium-theme.css"]');

    var theme = "default";
    if (ahlyEnabled) theme = "ahly";
    else if (ramadanEnabled) theme = "ramadan";
    else if (eidEnabled) theme = "eid";

    return {
      id: theme,
      eidEnabled: eidEnabled,
      ramadanEnabled: ramadanEnabled,
      ahlyEnabled: ahlyEnabled
    };
  }

  function applyThemeClasses() {
    var state = detectTheme();
    var themeClass = "scl-theme-" + state.id;

    ["scl-theme-default", "scl-theme-eid", "scl-theme-ramadan", "scl-theme-ahly"].forEach(function (cls) {
      setStateClass(ROOT, cls, cls === themeClass);
      setStateClass(BODY, cls, cls === themeClass);
    });

    setStateClass(ROOT, "scl-has-eid-theme", state.eidEnabled);
    setStateClass(BODY, "scl-has-eid-theme", state.eidEnabled);
  }

  function applyUiStateClasses() {
    var tagsLink = document.getElementById("bat2");
    var searchInput = document.getElementById("searchInput");
    var hasTabs = !!document.getElementById("tabs");

    setStateClass(ROOT, "scl-has-tags-link", !!tagsLink);
    setStateClass(BODY, "scl-has-tags-link", !!tagsLink);

    setStateClass(ROOT, "scl-has-search", !!searchInput);
    setStateClass(BODY, "scl-has-search", !!searchInput);

    setStateClass(ROOT, "scl-has-tabs", hasTabs);
    setStateClass(BODY, "scl-has-tabs", hasTabs);
  }

  function createScopedStyle(id, cssText) {
    if (!id || document.getElementById(id)) return null;
    var style = document.createElement("style");
    style.id = id;
    style.type = "text/css";
    style.appendChild(document.createTextNode(String(cssText || "")));
    document.head.appendChild(style);
    return style;
  }

  function whenElement(selector, cb, timeoutMs) {
    if (!selector || typeof cb !== "function") return;
    var found = document.querySelector(selector);
    if (found) {
      cb(found);
      return;
    }

    var maxMs = typeof timeoutMs === "number" ? timeoutMs : 5000;
    var started = Date.now();
    var timer = window.setInterval(function () {
      var node = document.querySelector(selector);
      if (node) {
        clearInterval(timer);
        cb(node);
      } else if (Date.now() - started > maxMs) {
        clearInterval(timer);
      }
    }, 120);
  }

  function applyAllStateClasses() {
    applyThemeClasses();
    applyUiStateClasses();
  }

  function ensureUrgentTickerOverlayRoot() {
    var root = document.getElementById("sclUrgentTickerOverlayRoot");
    if (root) return root;

    root = document.createElement("div");
    root.id = "sclUrgentTickerOverlayRoot";
    root.setAttribute("aria-live", "off");
    (document.body || BODY || document.documentElement).appendChild(root);
    return root;
  }

  function moveUrgentTickerToOverlay() {
    var ticker = document.getElementById("SR_URGENT_TICKER");
    if (!ticker) return false;
    if (ticker.__sclMovedToBodyOverlay) return true;

    var overlayRoot = ensureUrgentTickerOverlayRoot();
    overlayRoot.appendChild(ticker);
    ticker.__sclMovedToBodyOverlay = true;
    return true;
  }

  function initUrgentTickerOverlayMove() {
    if (moveUrgentTickerToOverlay()) return;

    var observer = new MutationObserver(function () {
      if (!moveUrgentTickerToOverlay()) return;
      observer.disconnect();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.setTimeout(function () {
      observer.disconnect();
    }, 15000);
  }

  window.SafeCustomizationLayer = Object.freeze({
    version: "1.0.0",
    applyAllStateClasses: applyAllStateClasses,
    applyThemeClasses: applyThemeClasses,
    applyUiStateClasses: applyUiStateClasses,
    createScopedStyle: createScopedStyle,
    whenElement: whenElement,
    setStateClass: setStateClass
  });

  ready(function () {
    ensureCssLoaded();
    applyAllStateClasses();
    initUrgentTickerOverlayMove();
  });
})();
