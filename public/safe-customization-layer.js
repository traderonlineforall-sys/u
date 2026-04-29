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
    link.href = "./safe-customization-layer.css";
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

  function rectSnapshot(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") return null;
    var r = node.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height
    };
  }

  function parentStackingContexts(node) {
    var out = [];
    var cur = node && node.parentElement;
    while (cur && cur !== document) {
      var cs = window.getComputedStyle(cur);
      var position = cs.position;
      var zIndex = cs.zIndex;
      var willChange = String(cs.willChange || "");
      var triggers = {
        transform: cs.transform !== "none",
        filter: cs.filter !== "none",
        opacity: parseFloat(cs.opacity || "1") < 1,
        contain: cs.contain !== "none",
        isolation: cs.isolation === "isolate",
        positionedWithZ: position !== "static" && zIndex !== "auto",
        willChange: /transform|filter|opacity/.test(willChange)
      };
      if (Object.keys(triggers).some(function (k) { return triggers[k]; })) {
        out.push({
          node: cur.tagName.toLowerCase() + (cur.id ? ("#" + cur.id) : "") + (cur.className ? ("." + String(cur.className).trim().replace(/\s+/g, ".")) : ""),
          triggers: triggers,
          computed: {
            position: position,
            zIndex: zIndex,
            transform: cs.transform,
            filter: cs.filter,
            opacity: cs.opacity,
            contain: cs.contain,
            isolation: cs.isolation,
            willChange: willChange
          }
        });
      }
      if (cur === BODY || cur === ROOT) break;
      cur = cur.parentElement;
    }
    return out;
  }

  function logAhlyUrgentDiagnostics(reason) {
    var isAhly = ROOT.classList.contains("scl-theme-ahly") || ROOT.classList.contains("ahly-premium-theme-live");
    if (!isAhly) return;

    var ticker = document.getElementById("SR_URGENT_TICKER");
    if (!ticker) return;

    var tcs = window.getComputedStyle(ticker);
    var search = document.querySelector(".search-container");
    var scs = search ? window.getComputedStyle(search) : null;

    var payload = {
      reason: reason || "scan",
      html: {
        sclThemeAhly: ROOT.classList.contains("scl-theme-ahly"),
        ahlyPremiumThemeLive: ROOT.classList.contains("ahly-premium-theme-live"),
        srUrgentVisible: ROOT.classList.contains("sr-urgent-visible")
      },
      body: {
        sclThemeAhly: BODY.classList.contains("scl-theme-ahly")
      },
      ticker: {
        exists: !!ticker,
        id: ticker.id,
        className: ticker.className,
        inlineDisplay: ticker.style ? ticker.style.display : "",
        computedDisplay: tcs.display,
        computedPosition: tcs.position,
        computedTop: tcs.top,
        computedLeft: tcs.left,
        computedTransform: tcs.transform,
        computedZIndex: tcs.zIndex,
        computedWidth: tcs.width,
        computedMaxWidth: tcs.maxWidth,
        rect: rectSnapshot(ticker)
      },
      searchContainer: {
        exists: !!search,
        computedPosition: scs ? scs.position : null,
        computedZIndex: scs ? scs.zIndex : null,
        computedTransform: scs ? scs.transform : null,
        computedFilter: scs ? scs.filter : null,
        computedOpacity: scs ? scs.opacity : null,
        rect: rectSnapshot(search)
      },
      parentStackingContexts: parentStackingContexts(ticker),
      ruleAppliedCheck: {
        positionFixed: tcs.position === "fixed",
        top64: tcs.top === "64px",
        zIndex2147483647: tcs.zIndex === "2147483647"
      }
    };

    console.log("[SCL:AHLY_URGENT_DIAG]", payload);
    return payload;
  }

  function diagText(payload) {
    return JSON.stringify(payload, null, 2);
  }

  function ensureAhlyDebugPanel() {
    if (!ROOT.classList.contains("scl-theme-ahly")) return null;
    if (document.getElementById("SCL_AHLY_DEBUG_TOGGLE")) return document.getElementById("SCL_AHLY_DEBUG_PANEL");

    var toggle = document.createElement("button");
    toggle.id = "SCL_AHLY_DEBUG_TOGGLE";
    toggle.type = "button";
    toggle.textContent = "Ahly Debug";

    var panel = document.createElement("div");
    panel.id = "SCL_AHLY_DEBUG_PANEL";
    panel.innerHTML = '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;background:#111;color:#f5f5f5;border:1px solid #333;border-radius:10px 10px 0 0;padding:8px 10px;font:600 12px/1.2 system-ui,sans-serif;"><span>Ahly Urgent Diagnostics</span><button id="SCL_AHLY_DEBUG_COPY" type="button">Copy Diagnostics</button></div><pre id="SCL_AHLY_DEBUG_TEXT" style="margin:0;background:#0b0b0d;color:#cfe9ff;border:1px solid #333;border-top:0;border-radius:0 0 10px 10px;padding:10px;white-space:pre-wrap;word-break:break-word;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;"></pre>';

    function updatePanel(reason) {
      var data = logAhlyUrgentDiagnostics(reason) || {
        reason: reason || "manual",
        html: { className: ROOT.className },
        body: { className: BODY.className },
        ticker: { exists: false }
      };
      data.html = data.html || {};
      data.body = data.body || {};
      data.html.className = ROOT.className;
      data.body.className = BODY.className;
      var text = diagText(data);
      var pre = panel.querySelector("#SCL_AHLY_DEBUG_TEXT");
      if (pre) pre.textContent = text;
      panel.dataset.diagText = text;
    }

    toggle.addEventListener("click", function () {
      var open = panel.style.display === "block";
      panel.style.display = open ? "none" : "block";
      if (!open) updatePanel("button-click");
    });

    panel.addEventListener("click", function (ev) {
      var target = ev.target;
      if (!target || target.id !== "SCL_AHLY_DEBUG_COPY") return;
      var text = panel.dataset.diagText || "";
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return;
      }
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    });

    document.body.appendChild(toggle);
    document.body.appendChild(panel);
    return panel;
  }

  function setupAhlyUrgentDiagnostics() {
    var state = detectTheme();
    if (!state.ahlyEnabled) return;
    ensureAhlyDebugPanel();

    whenElement("#SR_URGENT_TICKER", function () {
      logAhlyUrgentDiagnostics("ticker-found");
      if (typeof MutationObserver === "undefined") return;

      var obs = new MutationObserver(function () {
        applyAllStateClasses();
        logAhlyUrgentDiagnostics("mutation");
      });

      obs.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"]
      });
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
    setupAhlyUrgentDiagnostics();
  });
})();
