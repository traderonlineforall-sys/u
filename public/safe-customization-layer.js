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

    var style = document.createElement("style");
    style.id = "safeCustomizationLayerCss";
    style.textContent = "/*\n * Safe Customization Layer stylesheet\n *\n * Safe to edit in future for additive overrides only.\n * Keep selectors scoped with .scl-* guard classes.\n *\n * Protected unless explicitly requested:\n * - public/app.js\n * - public/index.html\n * - SR/menu data and menu HTML structure\n *\n * Ahly-theme-only fix pattern (safe):\n * html.scl-theme-ahly body.scl-theme-ahly .target { ... }\n */\n\n@layer safe-customization-layer {\n  /* Placeholder hooks only: no visual changes in this task. */\n\n  html.scl-theme-default body.scl-theme-default {\n    /* Future default-theme-safe overrides go here. */\n  }\n\n  html.scl-theme-eid body.scl-theme-eid {\n    /* Future Eid-theme-safe overrides go here. */\n  }\n\n  html.scl-theme-ramadan body.scl-theme-ramadan {\n    /* Future Ramadan-theme-safe overrides go here. */\n  }\n\n  html.scl-theme-ahly body.scl-theme-ahly {\n    /* Future Ahly-theme-only UI fixes go here (scoped, additive). */\n  }\n\n  html.scl-has-search body.scl-has-search {\n    /* Future search-present safe injections go here. */\n  }\n\n  html.scl-has-search body.scl-has-search .mndo-search-logo-row {\n    display: flex;\n    flex-wrap: nowrap;\n    align-items: flex-start;\n    overflow: visible;\n  }\n\n  html.scl-has-search body.scl-has-search .mndo-search-hk-anchor {\n    position: relative;\n    flex: 0 0 400px;\n    width: 400px;\n    max-width: 400px;\n    min-width: 400px;\n    height: 34px;\n    max-height: 34px;\n    overflow: visible;\n    align-self: flex-start;\n  }\n\n  html.scl-has-search body.scl-has-search .mndo-search-hk-anchor .search-container {\n    position: relative;\n    z-index: 2;\n    margin: 0 !important;\n    width: 100%;\n    height: 34px;\n    max-height: 34px;\n  }\n\n  html.scl-has-search body.scl-has-search .mndo-search-hk-anchor #hkSmartFloatingLine {\n    position: absolute !important;\n    left: 5% !important;\n    top: 31px !important;\n    margin: 0 !important;\n    z-index: 3 !important;\n    transform: none !important;\n    width: 100% !important;\n    max-width: 100% !important;\n  }\n\n  html.scl-has-search body.scl-has-search .mndo-search-hk-anchor #hkSmartFloatingLine:not(.is-visible),\n  html.scl-has-search body.scl-has-search .mndo-search-hk-anchor #hkSmartFloatingLine[aria-hidden=\"true\"] {\n    display: none !important;\n  }\n\n  html.scl-has-search body.scl-has-search .mndo-search-hk-anchor #hkSmartFloatingLine.is-visible,\n  html.scl-has-search body.scl-has-search .mndo-search-hk-anchor #hkSmartFloatingLine[aria-hidden=\"false\"] {\n    display: flex !important;\n  }\n\n  html.scl-has-tags-link body.scl-has-tags-link {\n    /* Future tags-link-present safe injections go here. */\n  }\n\n  html.scl-has-tabs body.scl-has-tabs {\n    /* Future tabs-present safe injections go here. */\n  }\n\n  body #sclUrgentTickerOverlayRoot {\n    position: static;\n  }\n\n  body #SR_URGENT_TICKER {\n    position: fixed !important;\n    top: 72px !important;\n    left: 50% !important;\n    transform: translateX(-50%) !important;\n    width: min(560px, calc(100vw - 24px)) !important;\n    max-width: min(560px, calc(100vw - 24px)) !important;\n    z-index: 2147483647 !important;\n    box-sizing: border-box !important;\n    pointer-events: auto !important;\n  }\n\n  body #SR_URGENT_TICKER .sr-urgent-inner {\n    background: rgba(20, 24, 33, 0.92) !important;\n    -webkit-backdrop-filter: blur(6px) !important;\n    backdrop-filter: blur(6px) !important;\n    border-radius: 14px !important;\n    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28) !important;\n    border: 1px solid rgba(255, 255, 255, 0.14) !important;\n    gap: 8px !important;\n  }\n\n  body #SR_URGENT_TICKER .sr-urgent-label {\n    display: none !important;\n  }\n\n  body #SR_URGENT_TICKER .sr-urgent-track {\n    min-width: 0 !important;\n  }\n\n  body #SR_URGENT_TICKER .sr-urgent-ack {\n    padding-left: 10px !important;\n    padding-right: 10px !important;\n    font-size: 12px !important;\n    white-space: nowrap !important;\n  }\n\n  @media (max-width: 700px) {\n    body #SR_URGENT_TICKER {\n      top: 82px !important;\n      width: min(92vw, 560px) !important;\n      max-width: min(92vw, 560px) !important;\n    }\n  }\n\n}\n";
    document.head.appendChild(style);
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
