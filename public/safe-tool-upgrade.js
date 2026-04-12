(function () {
  "use strict";

  if (window.__srSafeToolUpgradeLoaded) return;
  window.__srSafeToolUpgradeLoaded = true;

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function normalizeDigits(value) {
    return String(value || "")
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); });
  }

  function normalizeLocalizedNumberToken(token) {
    var value = String(token || "").replace(/\s+/g, "").replace(/[’']/g, "");
    if (!value) return value;

    var hasDot = value.indexOf(".") !== -1;
    var hasComma = value.indexOf(",") !== -1;

    if (hasDot && hasComma) {
      if (value.lastIndexOf(".") > value.lastIndexOf(",")) {
        value = value.replace(/,/g, "");
      } else {
        value = value.replace(/\./g, "").replace(/,/g, ".");
      }
      return value;
    }

    if (hasComma) {
      var commaCount = (value.match(/,/g) || []).length;
      if (commaCount > 1) {
        value = value.replace(/,/g, "");
      } else {
        var parts = value.split(",");
        var left = parts[0] || "";
        var right = parts[1] || "";
        var likelyThousands = /^\d{3}$/.test(right) && /^\d+$/.test(left) && left.length > 1 && left !== "0";
        value = likelyThousands ? value.replace(/,/g, "") : value.replace(/,/g, ".");
      }
      return value;
    }

    if (hasDot) {
      var dotCount = (value.match(/\./g) || []).length;
      if (dotCount > 1) {
        var groups = value.split(".");
        var looksThousands = groups.slice(1).every(function (group) { return /^\d{3}$/.test(group); });
        if (looksThousands) value = value.replace(/\./g, "");
      }
    }

    return value;
  }

  function sanitizeExpression(raw) {
    return normalizeDigits(raw)
      .replace(/[xX×]/g, "*")
      .replace(/[÷]/g, "/")
      .replace(/[−–—]/g, "-")
      .replace(/[٪]/g, "%")
      .replace(/[٫]/g, ".")
      .replace(/[،]/g, ",")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenizeExpression(raw) {
    var expr = sanitizeExpression(raw);
    if (!expr) return [];

    var tokens = [];
    var i = 0;

    function isUnaryContext() {
      if (!tokens.length) return true;
      var prev = tokens[tokens.length - 1];
      return prev === "+" || prev === "-" || prev === "*" || prev === "/" || prev === "(";
    }

    while (i < expr.length) {
      var ch = expr[i];

      if (ch === " ") {
        i += 1;
        continue;
      }

      if (ch === "+" || ch === "-") {
        var unary = isUnaryContext();
        var next = expr[i + 1] || "";
        if (unary && next === "(") {
          tokens.push("0");
          tokens.push(ch);
          i += 1;
          continue;
        }
        if (unary && /[0-9.,]/.test(next)) {
          var signedStart = i;
          i += 1;
          while (i < expr.length && /[0-9.,]/.test(expr[i])) i += 1;
          tokens.push(normalizeLocalizedNumberToken(expr.slice(signedStart, i)));
          continue;
        }
        tokens.push(ch);
        i += 1;
        continue;
      }

      if (/[0-9.,]/.test(ch)) {
        var start = i;
        i += 1;
        while (i < expr.length && /[0-9.,]/.test(expr[i])) i += 1;
        tokens.push(normalizeLocalizedNumberToken(expr.slice(start, i)));
        continue;
      }

      if (ch === "*" || ch === "/" || ch === "(" || ch === ")" || ch === "%") {
        tokens.push(ch);
        i += 1;
        continue;
      }

      throw new Error("صيغة غير مدعومة");
    }

    return tokens;
  }

  function toRpn(tokens) {
    var output = [];
    var stack = [];
    var precedence = { "+": 1, "-": 1, "*": 2, "/": 2 };

    tokens.forEach(function (token) {
      if (/^[+-]?\d+(?:\.\d+)?$/.test(token) || /^[+-]?\.\d+$/.test(token)) {
        output.push(token);
        return;
      }

      if (token === "%") {
        output.push(token);
        return;
      }

      if (token === "(") {
        stack.push(token);
        return;
      }

      if (token === ")") {
        while (stack.length && stack[stack.length - 1] !== "(") {
          output.push(stack.pop());
        }
        if (!stack.length) throw new Error("الأقواس غير مكتملة");
        stack.pop();
        return;
      }

      while (stack.length) {
        var top = stack[stack.length - 1];
        if (top === "(") break;
        if ((precedence[top] || 0) >= (precedence[token] || 0)) {
          output.push(stack.pop());
        } else {
          break;
        }
      }
      stack.push(token);
    });

    while (stack.length) {
      var op = stack.pop();
      if (op === "(") throw new Error("الأقواس غير مكتملة");
      output.push(op);
    }

    return output;
  }

  function evaluateRpn(rpn) {
    var stack = [];

    rpn.forEach(function (token) {
      if (/^[+-]?\d+(?:\.\d+)?$/.test(token) || /^[+-]?\.\d+$/.test(token)) {
        stack.push({ value: Number(token), isPercent: false });
        return;
      }

      if (token === "%") {
        if (!stack.length) throw new Error("لا يوجد رقم للنسبة");
        var percentItem = stack.pop();
        stack.push({ value: percentItem.value / 100, isPercent: true });
        return;
      }

      if (stack.length < 2) throw new Error("الصيغة غير مكتملة");
      var b = stack.pop();
      var a = stack.pop();
      var result;
      var rightValue = b.isPercent ? b.value : b.value;

      if (token === "+") {
        result = a.value + (b.isPercent ? (a.value * rightValue) : rightValue);
      } else if (token === "-") {
        result = a.value - (b.isPercent ? (a.value * rightValue) : rightValue);
      } else if (token === "*") {
        result = a.value * rightValue;
      } else if (token === "/") {
        if (rightValue === 0) throw new Error("القسمة على صفر غير مسموحة");
        result = a.value / rightValue;
      } else {
        throw new Error("عملية غير معروفة");
      }

      stack.push({ value: result, isPercent: false });
    });

    if (stack.length !== 1) throw new Error("الصيغة غير صحيحة");
    var finalValue = stack[0].value;
    if (!Number.isFinite(finalValue)) throw new Error("نتيجة غير صالحة");
    return finalValue;
  }

  function evaluateExpression(expression) {
    var tokens = tokenizeExpression(expression);
    if (!tokens.length) return null;
    return evaluateRpn(toRpn(tokens));
  }

  function formatResult(value) {
    if (value == null) return "";
    var num = Number(value);
    if (!Number.isFinite(num)) throw new Error("نتيجة غير صالحة");
    if (Object.is(num, -0)) num = 0;

    var abs = Math.abs(num);
    if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) {
      return num.toExponential(10).replace(/\.?(0+)(e[+-]?\d+)$/, "$2");
    }
    return num.toFixed(10).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  function parseCityFromButton(button) {
    if (!button) return "";
    var inline = button.getAttribute("onclick") || "";
    var match = inline.match(/openCity\(event,\s*'([^']+)'\)/);
    if (match) return match[1];
    return (button.textContent || "").trim();
  }

  function getTabButtons() {
    return Array.prototype.slice.call(document.querySelectorAll("#tabs .tablinks"));
  }

  function getActiveTabInfo() {
    var buttons = getTabButtons();
    var activeBtn = document.querySelector("#tabs .tablinks.active");
    if (!activeBtn) {
      activeBtn = buttons.find(function (btn) {
        var city = parseCityFromButton(btn);
        var panel = city ? document.getElementById(city) : null;
        return panel && panel.style.display === "block";
      }) || null;
    }
    var cityName = activeBtn ? parseCityFromButton(activeBtn) : (window.__srLastOpenCity || "");
    return { button: activeBtn, city: cityName };
  }

  function dispatchInputEvents(input) {
    if (!input) return;
    ["input", "change", "keyup", "blur"].forEach(function (eventName) {
      try {
        var event = eventName === "keyup"
          ? new KeyboardEvent("keyup", { bubbles: true, key: "Backspace" })
          : new Event(eventName, { bubbles: true });
        input.dispatchEvent(event);
      } catch (err) {
        try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch (noop) {}
      }
    });
  }

  function clearHeaderNumbers() {
    ["arabicNumber", "arabiccNumber"].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.value = "";
      dispatchInputEvents(input);
      try { input.setSelectionRange(0, 0); } catch (err) {}
      try { input.blur(); } catch (err) {}
    });
  }

  function nudgeLayout() {
    function fireResize() {
      try { window.dispatchEvent(new Event("resize")); } catch (err) {}
    }

    fireResize();
    setTimeout(fireResize, 80);
    setTimeout(fireResize, 240);
    setTimeout(fireResize, 640);
    setTimeout(fireResize, 1200);

    try { document.dispatchEvent(new Event("visibilitychange")); } catch (err) {}
    try { window.dispatchEvent(new Event("pageshow")); } catch (err) {}
  }

  var toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById("safeToolToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "safeToolToast";
      toast.className = "safe-tool-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 1800);
  }

  function callOpenCity(button, city) {
    if (!button || !city || typeof window.openCity !== "function") return false;
    window.openCity({ currentTarget: button }, city);
    return true;
  }

  function handleHeaderReset(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    var active = getActiveTabInfo();
    clearHeaderNumbers();

    var buttons = getTabButtons();
    var fallback = buttons.find(function (btn) {
      return parseCityFromButton(btn) !== active.city;
    }) || null;

    if (active.button && active.city && fallback) {
      callOpenCity(fallback, parseCityFromButton(fallback));
      setTimeout(function () {
        callOpenCity(active.button, active.city);
        nudgeLayout();
        showToast("تم مسح الرقم وإعادة ضبط الواجهة");
      }, 60);
    } else {
      nudgeLayout();
      showToast("تم مسح الرقم وإعادة ضبط الواجهة");
    }
  }

  function insertFixedVoiceLabel() {
    var anchor = document.querySelector('a[href*="srTypeId=159003069"]');
    if (!anchor) {
      var candidates = Array.prototype.slice.call(document.querySelectorAll('#Fixed\\ Voice a, #Fixed\\ Voice .dropdown-content a, #Fixed\\ Voice a[href]'));
      anchor = candidates.find(function (node) {
        return /fixed\s*voice\s*-\s*general\s*information/i.test((node.textContent || "").replace(/\s+/g, " ").trim());
      }) || null;
    }
    if (anchor) anchor.textContent = "Other";
  }

  var calcState = {
    overlay: null,
    launcher: null,
    display: null,
    preview: null,
    lastGoodValue: ""
  };

  function updateCalcPreview() {
    if (!calcState.display || !calcState.preview) return;
    var value = calcState.display.value || "";
    if (!value.trim()) {
      calcState.preview.textContent = "جاهز للحساب";
      calcState.preview.dataset.state = "idle";
      calcState.lastGoodValue = "";
      return;
    }

    try {
      var evaluated = evaluateExpression(value);
      if (evaluated == null) {
        calcState.preview.textContent = "جاهز للحساب";
        calcState.preview.dataset.state = "idle";
        calcState.lastGoodValue = "";
        return;
      }
      calcState.lastGoodValue = formatResult(evaluated);
      calcState.preview.textContent = "= " + calcState.lastGoodValue;
      calcState.preview.dataset.state = "ok";
    } catch (err) {
      calcState.preview.textContent = err && err.message ? err.message : "صيغة غير صحيحة";
      calcState.preview.dataset.state = "error";
      calcState.lastGoodValue = "";
    }
  }

  function setCalcOpen(isOpen) {
    if (!calcState.overlay || !calcState.launcher) return;
    calcState.overlay.hidden = !isOpen;
    calcState.overlay.classList.toggle("is-open", isOpen);
    calcState.overlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
    calcState.launcher.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (isOpen && calcState.display) {
      setTimeout(function () {
        try {
          calcState.display.focus();
          calcState.display.setSelectionRange(calcState.display.value.length, calcState.display.value.length);
        } catch (err) {}
      }, 20);
    }
  }

  function insertAtCursor(input, text) {
    if (!input) return;
    var start = input.selectionStart == null ? input.value.length : input.selectionStart;
    var end = input.selectionEnd == null ? input.value.length : input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    var nextPos = start + text.length;
    try { input.setSelectionRange(nextPos, nextPos); } catch (err) {}
    input.focus();
    updateCalcPreview();
  }

  function commitCalcResult() {
    if (!calcState.display) return;
    updateCalcPreview();
    if (!calcState.lastGoodValue) return;
    calcState.display.value = calcState.lastGoodValue;
    try {
      calcState.display.focus();
      calcState.display.setSelectionRange(calcState.display.value.length, calcState.display.value.length);
    } catch (err) {}
    updateCalcPreview();
  }

  function copyText(text) {
    var value = String(text || "");
    if (!value) return Promise.reject(new Error("empty"));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      try {
        var ok = document.execCommand("copy");
        document.body.removeChild(area);
        ok ? resolve() : reject(new Error("copy"));
      } catch (err) {
        document.body.removeChild(area);
        reject(err);
      }
    });
  }

  function readClipboardText() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return navigator.clipboard.readText();
    }
    return Promise.reject(new Error("clipboard"));
  }

  function bindCalculatorActions(root) {
    root.addEventListener("click", function (event) {
      var button = event.target.closest("[data-calc-value], [data-calc-action]");
      if (!button || !calcState.display) return;
      event.preventDefault();

      var action = button.getAttribute("data-calc-action");
      var value = button.getAttribute("data-calc-value");

      if (action === "close") {
        setCalcOpen(false);
        return;
      }
      if (action === "clear") {
        calcState.display.value = "";
        updateCalcPreview();
        calcState.display.focus();
        return;
      }
      if (action === "backspace") {
        var start = calcState.display.selectionStart == null ? calcState.display.value.length : calcState.display.selectionStart;
        var end = calcState.display.selectionEnd == null ? calcState.display.value.length : calcState.display.selectionEnd;
        if (start !== end) {
          calcState.display.value = calcState.display.value.slice(0, start) + calcState.display.value.slice(end);
          try { calcState.display.setSelectionRange(start, start); } catch (err) {}
        } else if (start > 0) {
          calcState.display.value = calcState.display.value.slice(0, start - 1) + calcState.display.value.slice(end);
          try { calcState.display.setSelectionRange(start - 1, start - 1); } catch (err) {}
        }
        updateCalcPreview();
        calcState.display.focus();
        return;
      }
      if (action === "equals") {
        commitCalcResult();
        return;
      }
      if (action === "copyResult") {
        var toCopy = calcState.lastGoodValue || calcState.display.value.trim();
        copyText(toCopy).then(function () {
          showToast("تم نسخ النتيجة");
        }).catch(function () {
          showToast("تعذر النسخ من الزر - استخدم Ctrl+C");
        });
        return;
      }
      if (action === "paste") {
        readClipboardText().then(function (clipText) {
          insertAtCursor(calcState.display, clipText || "");
          showToast("تم لصق القيمة");
        }).catch(function () {
          showToast("استخدم Ctrl+V للصق");
          calcState.display.focus();
        });
        return;
      }

      if (value) {
        insertAtCursor(calcState.display, value);
      }
    });

    calcState.display.addEventListener("input", updateCalcPreview);
    calcState.display.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitCalcResult();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCalcOpen(false);
      }
    });

    calcState.overlay.addEventListener("click", function (event) {
      if (event.target === calcState.overlay) {
        setCalcOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && calcState.overlay && calcState.overlay.classList.contains("is-open")) {
        setCalcOpen(false);
      }
    });
  }

  function installCalculator() {
    var tab = document.getElementById("Calculate");
    if (!tab || document.getElementById("smartCalcToggle")) return;

    var toolbar = document.createElement("div");
    toolbar.className = "calc-smart-toolbar";
    toolbar.setAttribute("data-smart-calc-toolbar", "true");
    toolbar.innerHTML = [
      '<button id="smartCalcToggle" class="calc-launch-btn" type="button"',
      ' aria-label="Open calculator" aria-haspopup="dialog" aria-controls="smartCalcOverlay" aria-expanded="false"',
      ' title="آلة حاسبة">',
      '<i class="fa fa-calculator" aria-hidden="true"></i>',
      '</button>'
    ].join("");
    tab.prepend(toolbar);

    var overlay = document.createElement("div");
    overlay.id = "smartCalcOverlay";
    overlay.className = "smart-calc-overlay";
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = [
      '<div class="smart-calc-panel" role="dialog" aria-modal="true" aria-labelledby="smartCalcTitle">',
      '  <div class="smart-calc-header">',
      '    <div class="smart-calc-title"><i class="fa fa-calculator" aria-hidden="true"></i><span id="smartCalcTitle">Smart Calculator</span></div>',
      '    <button class="smart-calc-close" type="button" data-calc-action="close" aria-label="Close">×</button>',
      '  </div>',
      '  <p class="smart-calc-hint">يدعم الجمع والطرح والضرب والقسمة والنسبة المئوية. تقدر تكتب أو تلصق أرقام صحيحة أو عشرية مباشرة.</p>',
      '  <input id="smartCalcDisplay" class="smart-calc-display" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="مثال: 200 + 10%">',
      '  <div id="smartCalcPreview" class="smart-calc-preview" data-state="idle">جاهز للحساب</div>',
      '  <div class="smart-calc-actions">',
      '    <button class="smart-calc-action-btn" type="button" data-calc-action="copyResult">Copy</button>',
      '    <button class="smart-calc-action-btn" type="button" data-calc-action="paste">Paste</button>',
      '    <button class="smart-calc-action-btn" type="button" data-calc-action="clear">Clear</button>',
      '  </div>',
      '  <div class="smart-calc-grid">',
      '    <button class="smart-calc-btn is-special" type="button" data-calc-action="clear">AC</button>',
      '    <button class="smart-calc-btn is-special" type="button" data-calc-value="(">(</button>',
      '    <button class="smart-calc-btn is-special" type="button" data-calc-value=")">)</button>',
      '    <button class="smart-calc-btn is-special" type="button" data-calc-action="backspace">⌫</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="7">7</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="8">8</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="9">9</button>',
      '    <button class="smart-calc-btn is-operator" type="button" data-calc-value="/">÷</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="4">4</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="5">5</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="6">6</button>',
      '    <button class="smart-calc-btn is-operator" type="button" data-calc-value="*">×</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="1">1</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="2">2</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="3">3</button>',
      '    <button class="smart-calc-btn is-operator" type="button" data-calc-value="-">−</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="0">0</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value="00">00</button>',
      '    <button class="smart-calc-btn" type="button" data-calc-value=".">.</button>',
      '    <button class="smart-calc-btn is-operator" type="button" data-calc-value="+">+</button>',
      '    <button class="smart-calc-btn is-special" type="button" data-calc-value="%">%</button>',
      '    <button class="smart-calc-btn is-equals" type="button" data-calc-action="equals">=</button>',
      '  </div>',
      '</div>'
    ].join("");
    document.body.appendChild(overlay);

    calcState.overlay = overlay;
    calcState.launcher = toolbar.querySelector("#smartCalcToggle");
    calcState.display = overlay.querySelector("#smartCalcDisplay");
    calcState.preview = overlay.querySelector("#smartCalcPreview");

    calcState.launcher.addEventListener("click", function () {
      setCalcOpen(true);
      updateCalcPreview();
    });

    bindCalculatorActions(overlay);
  }

  function wrapOpenCity() {
    if (typeof window.openCity !== "function" || window.openCity.__safeUpgradeWrapped) return;
    var original = window.openCity;
    var wrapped = function (evt, cityName) {
      window.__srLastOpenCity = cityName;
      if (cityName !== "Calculate") setCalcOpen(false);
      return original.apply(this, arguments);
    };
    wrapped.__safeUpgradeWrapped = true;
    window.openCity = wrapped;
  }

  function installHeaderResetButton() {
    var tabs = document.getElementById("tabs");
    if (!tabs || document.getElementById("headerResetBtn")) return;

    var btn = document.createElement("button");
    btn.id = "headerResetBtn";
    btn.type = "button";
    btn.className = "tab-utility-btn is-reset";
    btn.setAttribute("aria-label", "Reset tool header");
    btn.setAttribute("title", "Reset الرقم الأرضي وإعادة تثبيت اللوجو");
    btn.innerHTML = '<i class="fa fa-rotate-left" aria-hidden="true"></i>';
    btn.addEventListener("click", handleHeaderReset);
    tabs.appendChild(btn);
  }

  /*
   * =============================================================
   * UI/UX Enhancements (non-breaking)
   *
   * The following helper functions implement lightweight behaviour fixes
   * requested by the user.  They operate on the DOM after it is ready
   * and do not modify any SR data or alter application logic.  Each
   * function is self-contained and guarded against missing elements.
   */

  // Stabilise the top header area using a lightweight observer-based
  // coordinator instead of mimicking the reset button.  The header
  // elements (logo / envelope / online count / HK line / timer stack)
  // are positioned by app.js and the helper scripts on `resize`, but
  // typing in the landline field can change layout without producing a
  // real resize event.  This coordinator watches the small set of anchor
  // elements that matter, detects actual drift, and only then nudges the
  // existing layout code once the interaction has settled.
  function installTopStabilizer() {
    var watchedIds = [
      "searchInput",
      "arabicNumber",
      "arabiccNumber",
      "tabs",
      "MNDO_UA07_LOGO3",
      "UA07_SECRET_ENVELOPE_WRAP",
      "UA07_ONLINE_COUNT",
      "MNDO_AHT_TAGS_STACK",
      "mndoQueryTimer",
      "bat2",
      "hkSmartFloatingLine"
    ];

    var attached = Object.create(null);
    var resizeObserver = null;
    var mutationObserver = null;
    var retryTimer = 0;
    var retryCount = 0;
    var inputIdleTimer = 0;
    var queuedTimer = 0;
    var queuedRaf = 0;
    var pendingReason = "";
    var pendingForce = false;
    var lastPulseAt = 0;
    var lastAnchorKey = "";
    var lastInputValue = "";
    var settleLockedUntil = 0;

    function getRect(el) {
      if (!el || typeof el.getBoundingClientRect !== "function") return null;
      var r = el.getBoundingClientRect();
      if (!r) return null;
      return {
        left: Number(r.left || 0),
        top: Number(r.top || 0),
        right: Number(r.right || 0),
        bottom: Number(r.bottom || 0),
        width: Number(r.width || 0),
        height: Number(r.height || 0)
      };
    }

    function hasBox(rect) {
      return !!(rect && (rect.width > 0 || rect.height > 0));
    }

    function metric(el) {
      var rect = getRect(el);
      if (!hasBox(rect)) return null;
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        centerX: Math.round(rect.left + (rect.width / 2)),
        centerY: Math.round(rect.top + (rect.height / 2))
      };
    }

    function getElements() {
      return {
        search: document.getElementById("searchInput"),
        landline: document.getElementById("arabicNumber"),
        fbb: document.getElementById("arabiccNumber"),
        tabs: document.getElementById("tabs"),
        logo: document.getElementById("MNDO_UA07_LOGO3") || document.getElementById("MNDO_UA07_LOGO") || document.getElementById("UA07_LUX_LOGO_BETWEEN"),
        envelope: document.getElementById("UA07_SECRET_ENVELOPE_WRAP"),
        online: document.getElementById("UA07_ONLINE_COUNT"),
        hkLine: document.getElementById("hkSmartFloatingLine"),
        timerStack: document.getElementById("MNDO_AHT_TAGS_STACK"),
        timer: document.getElementById("mndoQueryTimer"),
        tags: document.getElementById("bat2")
      };
    }

    function buildAnchorKey(els) {
      var parts = [];
      ["search", "landline", "fbb", "tabs"].forEach(function (name) {
        var m = metric(els[name]);
        if (!m) return;
        parts.push(name + ":" + [m.left, m.top, m.width, m.height].join(","));
      });
      return parts.join("|");
    }

    function calcDrift(els) {
      var drift = 0;
      var search = metric(els.search);
      var logo = metric(els.logo);
      var envelope = metric(els.envelope);
      var hkLine = metric(els.hkLine);
      var timer = metric(els.timerStack || els.timer);

      if (search && logo) {
        drift = Math.max(drift, Math.abs(search.centerY - logo.centerY));
      }

      if (logo && envelope) {
        drift = Math.max(drift, Math.abs(logo.centerX - envelope.centerX));
        drift = Math.max(drift, Math.abs((logo.top + 50) - envelope.top));
      }

      if (search && hkLine && !(els.hkLine && els.hkLine.getAttribute && els.hkLine.getAttribute("aria-hidden") === "true")) {
        drift = Math.max(drift, Math.abs((search.bottom + 10) - hkLine.top));
        drift = Math.max(drift, Math.abs(search.centerX - hkLine.centerX));
      }

      if (search && timer) {
        drift = Math.max(drift, Math.max(0, search.top - timer.top - 22));
        drift = Math.max(drift, Math.max(0, timer.top - (search.bottom + 26)));
      }

      return drift;
    }

    function needsPulse(els) {
      return calcDrift(els) > 8;
    }

    function firePulse() {
      var now = Date.now();
      if (now - lastPulseAt < 120) return false;
      lastPulseAt = now;
      settleLockedUntil = now + 120;
      try { window.dispatchEvent(new Event("resize")); } catch (err) {}
      return true;
    }

    function settle(reason, force) {
      queuedRaf = 0;

      var els = getElements();
      var anchorKey = buildAnchorKey(els);
      var anchorChanged = !!anchorKey && anchorKey !== lastAnchorKey;
      var drifted = needsPulse(els);

      if (!force && !anchorChanged && !drifted) return;

      if (anchorKey) lastAnchorKey = anchorKey;

      if (!firePulse()) return;

      setTimeout(function () {
        var after = getElements();
        if (Date.now() < settleLockedUntil && !needsPulse(after)) return;
        if (needsPulse(after)) firePulse();
      }, 150);
    }

    function schedule(reason, delay, force) {
      pendingReason = reason || pendingReason || "top-stabilizer";
      pendingForce = pendingForce || !!force;

      if (queuedTimer) clearTimeout(queuedTimer);
      queuedTimer = setTimeout(function () {
        queuedTimer = 0;
        if (queuedRaf) return;
        queuedRaf = window.requestAnimationFrame(function () {
          var forceNow = pendingForce;
          var reasonNow = pendingReason;
          pendingForce = false;
          pendingReason = "";
          settle(reasonNow, forceNow);
        });
      }, typeof delay === "number" ? delay : 0);
    }

    function bindInput(el) {
      if (!el || el.__mndoTopStabilizerBound) return;
      el.__mndoTopStabilizerBound = "1";

      el.addEventListener("input", function () {
        var value = String(el.value || "");
        if (el.id === "arabicNumber" || el.id === "arabiccNumber") {
          if (value === lastInputValue) return;
          lastInputValue = value;
        }
        if (inputIdleTimer) clearTimeout(inputIdleTimer);
        inputIdleTimer = setTimeout(function () {
          schedule("input-idle:" + el.id, 0, false);
        }, 170);
      });

      ["change", "blur", "paste"].forEach(function (evtName) {
        el.addEventListener(evtName, function () {
          schedule(evtName + ":" + el.id, evtName === "blur" ? 40 : 70, false);
        });
      });
    }

    function bindElementObservers(el, id) {
      if (!el || attached[id]) return;
      attached[id] = true;

      if (resizeObserver) {
        try { resizeObserver.observe(el); } catch (err) {}
      }

      if (mutationObserver && (id === "MNDO_UA07_LOGO3" || id === "UA07_SECRET_ENVELOPE_WRAP" || id === "hkSmartFloatingLine" || id === "MNDO_AHT_TAGS_STACK")) {
        try { mutationObserver.observe(el, { attributes: true, attributeFilter: ["style", "class", "aria-hidden"] }); } catch (err) {}
      }

      if (id === "searchInput" || id === "arabicNumber" || id === "arabiccNumber") {
        bindInput(el);
      }
    }

    function bindAvailableElements() {
      watchedIds.forEach(function (id) {
        bindElementObservers(document.getElementById(id), id);
      });

      retryCount += 1;
      var missingCore = !document.getElementById("searchInput") || !document.getElementById("MNDO_UA07_LOGO3");
      var missingObserved = watchedIds.some(function (id) { return !attached[id]; });
      if ((missingCore || missingObserved) && retryCount < 50) {
        retryTimer = setTimeout(bindAvailableElements, 250);
      }
    }

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(function () {
        schedule("resize-observer", 36, false);
      });
    }

    mutationObserver = new MutationObserver(function () {
      schedule("attribute-mut", 30, false);
    });

    bindAvailableElements();

    // Expose a safe manual hook for any future patch without touching app.js.
    window.__mndoSettleTopChrome = function () {
      schedule("manual", 0, true);
    };

    window.addEventListener("load", function () { schedule("load", 60, true); }, { once: true });
    window.addEventListener("pageshow", function () { schedule("pageshow", 40, true); });
    window.addEventListener("resize", function () {
      // Keep internal state in sync with real resizes without bouncing endlessly.
      lastAnchorKey = buildAnchorKey(getElements()) || lastAnchorKey;
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule("visible", 80, true);
    });

    // Initial settle after the dynamic header pieces are injected.
    schedule("boot", 120, true);
    setTimeout(function () { schedule("boot-2", 0, true); }, 420);
  }

  // Ensure any form reset clears the landline fields.  The native reset
  // behaviour sometimes omits these inputs; listen for the global
  // `reset` event and explicitly empty the values.  Do not prevent
  // default form resets.
  function installResetFix() {
    document.addEventListener("reset", function () {
      try {
        var a = document.getElementById("arabicNumber");
        if (a) a.value = "";
      } catch (err) {}
      try {
        var b = document.getElementById("arabiccNumber");
        if (b) b.value = "";
      } catch (err) {}
    });
  }

  // Remove maxlength on the suggestions input and auto-grow up to a
  // comfortable height before introducing scrolling.  This enhances
  // readability when drafting long suggestions.
  function installSuggestionsEnhancements() {
    var input = document.getElementById("suggestionInput");
    if (!input) return;
    try { input.removeAttribute("maxlength"); } catch (err) {}
    var maxHeight = 220;
    function autoGrow() {
      // Temporarily reset height to allow shrinking.
      input.style.height = "auto";
      var h = input.scrollHeight;
      if (h > maxHeight) {
        h = maxHeight;
        input.style.overflowY = "auto";
      } else {
        input.style.overflowY = "hidden";
      }
      input.style.height = h + "px";
    }
    input.addEventListener("input", autoGrow);
    // Initialize height on first load
    autoGrow();
  }

  // Adjust the size behaviour of the support message box and admin envelope
  // input.  These fields should not grow indefinitely; they adopt a
  // similar height limit to the suggestions input and enable internal
  // scrolling for overflow.
  function installEnvelopeEnhancements() {
    // Support chat message input
    var msgInput = document.getElementById("supportMessageInput");
    if (msgInput) {
      var maxMsgHeight = 220;
      var autoGrowMsg = function () {
        msgInput.style.height = "auto";
        var h = msgInput.scrollHeight;
        if (h > maxMsgHeight) {
          h = maxMsgHeight;
          msgInput.style.overflowY = "auto";
        } else {
          msgInput.style.overflowY = "hidden";
        }
        msgInput.style.height = h + "px";
      };
      msgInput.addEventListener("input", autoGrowMsg);
      autoGrowMsg();
    }
    // Admin envelope input (announcement panel)
    var envInput = document.getElementById("adminAnnouncementEnvelopeInput");
    if (envInput) {
      envInput.style.maxHeight = "240px";
      envInput.style.overflowY = "auto";
    }
  }

  // Remove any tooltip/title attribute from Re-subscribe SR links.  Only
  // affects UI by eliminating the hover popup; underlying links remain
  // untouched.
  function removeResubscribeTooltip() {
    var links = Array.prototype.slice.call(document.querySelectorAll("a"));
    links.forEach(function (a) {
      try {
        var text = (a.textContent || "").trim();
        if (/Re-?subscribe/i.test(text) && a.hasAttribute("title")) {
          a.removeAttribute("title");
        }
      } catch (err) {}
    });
  }

  // Register our enhancements on DOM ready.  Keep this separate from
  // other initializers to avoid coupling behaviours.
  onReady(function () {
    installTopStabilizer();
    installResetFix();
    installSuggestionsEnhancements();
    installEnvelopeEnhancements();
    removeResubscribeTooltip();
  });

  onReady(function () {
    insertFixedVoiceLabel();
    wrapOpenCity();
    installHeaderResetButton();
    installCalculator();
    setTimeout(insertFixedVoiceLabel, 80);
  });
})();
