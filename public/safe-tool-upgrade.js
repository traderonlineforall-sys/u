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

  // Keep the top chrome stable in its original on-screen positions.
  // We intentionally do NOT dispatch synthetic resize events on input,
  // because that was the main reason the UA07 logo/header cluster drifted.
  function installTopStabilizer() {
    return;
  }

  function installTopChromeLock() {
    var state = {
      logo: null,
      hk: null,
      raf: 0,
      allowRelockUntil: 0,
      observers: Object.create(null)
    };

    function now() {
      return Date.now ? Date.now() : new Date().getTime();
    }

    function pageRect(el) {
      if (!el || typeof el.getBoundingClientRect !== "function") return null;
      var rect = el.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      var sx = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
      var sy = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      return {
        left: Math.round(sx + rect.left),
        top: Math.round(sy + rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }

    function setLockedBox(el, box) {
      if (!el || !box) return;
      el.style.setProperty("position", "absolute", "important");
      el.style.setProperty("left", box.left + "px", "important");
      el.style.setProperty("top", box.top + "px", "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("bottom", "auto", "important");
      el.style.setProperty("margin", "0", "important");
      el.style.setProperty("transform", "none", "important");
      if (box.width > 0) el.style.setProperty("width", box.width + "px", "important");
      if (box.height > 0) el.style.setProperty("height", box.height + "px", "important");
    }

    function capture(which) {
      var id = which === "logo" ? "MNDO_UA07_LOGO3" : "hkSmartFloatingLine";
      var el = document.getElementById(id);
      if (!el) return false;
      var box = pageRect(el);
      if (!box) return false;
      state[which] = box;
      setLockedBox(el, box);
      bindObserver(which, el);
      return true;
    }

    function restore(which) {
      var id = which === "logo" ? "MNDO_UA07_LOGO3" : "hkSmartFloatingLine";
      var el = document.getElementById(id);
      var box = state[which];
      if (!el || !box) return;
      setLockedBox(el, box);
    }

    function bindObserver(which, el) {
      if (!el || typeof MutationObserver === "undefined") return;
      var existing = state.observers[which];
      if (existing && existing.el === el) return;
      if (existing && existing.mo) {
        try { existing.mo.disconnect(); } catch (err) {}
      }
      var mo = new MutationObserver(function () {
        if (now() < state.allowRelockUntil) return;
        restore(which);
      });
      try {
        mo.observe(el, { attributes: true, attributeFilter: ["style", "class"] });
        state.observers[which] = { el: el, mo: mo };
      } catch (err) {}
    }

    function recalc() {
      state.allowRelockUntil = now() + 900;
      capture("logo");
      capture("hk");
      window.setTimeout(function () {
        capture("logo");
        capture("hk");
        state.allowRelockUntil = 0;
      }, 180);
      window.setTimeout(function () {
        capture("logo");
        capture("hk");
        state.allowRelockUntil = 0;
      }, 520);
    }

    function scheduleRecalc() {
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = requestAnimationFrame(function () {
        state.raf = 0;
        recalc();
      });
    }

    // Initial settle after the original scripts finish placing the elements.
    window.setTimeout(scheduleRecalc, 900);
    window.setTimeout(scheduleRecalc, 1600);

    window.addEventListener("resize", function () {
      scheduleRecalc();
    });
    window.addEventListener("pageshow", function () {
      window.setTimeout(scheduleRecalc, 50);
    });

    document.addEventListener("click", function (event) {
      var t = event.target;
      if (!t) return;
      if ((t.closest && t.closest("#headerResetBtn")) || (t.closest && t.closest("#tabs .tablinks"))) {
        window.setTimeout(scheduleRecalc, 120);
        window.setTimeout(scheduleRecalc, 420);
      }
    }, true);

    if (typeof MutationObserver !== "undefined") {
      var rootMo = new MutationObserver(function () {
        if (!state.logo && document.getElementById("MNDO_UA07_LOGO3")) scheduleRecalc();
        if (!state.hk && document.getElementById("hkSmartFloatingLine")) scheduleRecalc();
      });
      try {
        rootMo.observe(document.documentElement, { childList: true, subtree: true });
      } catch (err) {}
    }

    ["arabicNumber", "arabiccNumber"].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("input", function () {
        if (!state.hk) window.setTimeout(scheduleRecalc, 140);
      }, { passive: true });
    });
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
    installTopChromeLock();
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
