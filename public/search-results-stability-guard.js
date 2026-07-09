(function () {
  'use strict';

  var SEARCH_INPUT_ID = 'searchInput';
  var SEARCH_RESULTS_ID = 'searchResults';
  var NUMBER_INPUT_IDS = ['arabiccNumber', 'arabicNumber'];
  var HEADER_TOOL_IDS = ['copyBtn', 'copyBtn1', 'mndoTTTop', 'mndoSRTop', 'mndoTTBottom', 'mndoSRBottom'];
  var lastHeaderToolTrigger = Object.create(null);
  var keepUntil = 0;
  var restoreTimers = [];
  var rafPosition = 0;

  function byId(id) { return document.getElementById(id); }

  function injectStyle() {
    if (document.getElementById('mndo-input-search-stack-fix')) return;
    var style = document.createElement('style');
    style.id = 'mndo-input-search-stack-fix';
    style.textContent = [
      '/* Safe click/focus guard for the two original number boxes. */',
      '#arabiccNumber,#arabicNumber{',
      '  pointer-events:auto !important;',
      '  user-select:text !important;',
      '  -webkit-user-select:text !important;',
      '  touch-action:manipulation !important;',
      '  z-index:9101 !important;',
      '}',
      '#copyBtn,#copyBtn1,#copyNotification,#copyNotification1,#mndoTTTop,#mndoSRTop,#mndoTTBottom,#mndoSRBottom{',
      '  pointer-events:auto !important;',
      '  touch-action:manipulation !important;',
      '  -webkit-tap-highlight-color:transparent !important;',
      '  cursor:pointer !important;',
      '  z-index:9100 !important;',
      '}',
      '#arabiccNumber:focus,#arabicNumber:focus{',
      '  outline:0 !important;',
      '}',
      '/* Keep search results inside the original search frame, but always above page content. */',
      '.mndo-search-logo-row{ position:relative !important; overflow:visible !important; z-index:2147483600 !important; }',
      '.mndo-search-hk-anchor{ position:relative !important; overflow:visible !important; z-index:2147483601 !important; }',
      '.mndo-search-hk-anchor .search-container, .search-container{',
      '  position:relative !important;',
      '  overflow:visible !important;',
      '  z-index:2147483602 !important;',
      '  isolation:isolate;',
      '}',
      '#searchResults.search-results,#searchResults{',
      '  display:none;',
      '  position:absolute !important;',
      '  left:0 !important;',
      '  right:auto !important;',
      '  top:calc(100% + 6px) !important;',
      '  width:100% !important;',
      '  min-width:100% !important;',
      '  max-width:100% !important;',
      '  margin:0 !important;',
      '  transform:none !important;',
      '  box-sizing:border-box !important;',
      '  max-height:min(500px, calc(100vh - 92px)) !important;',
      '  overflow-y:auto !important;',
      '  overflow-x:hidden !important;',
      '  z-index:2147483647 !important;',
      '  border-radius:20px !important;',
      '  border:1px solid rgba(187,196,218,0.98) !important;',
      '  background:rgba(255,255,255,0.99) !important;',
      '  color:#181818 !important;',
      '  opacity:1 !important;',
      '  box-shadow:0 16px 36px rgba(0,0,0,0.28) !important;',
      '  padding:6px 0 !important;',
      '  scrollbar-width:thin;',
      '}',
      '#searchResults.search-results::-webkit-scrollbar,#searchResults::-webkit-scrollbar{ width:8px; }',
      '#searchResults.search-results::-webkit-scrollbar-thumb,#searchResults::-webkit-scrollbar-thumb{ background:rgba(145,172,230,0.75); border-radius:999px; }',
      '#searchResults.search-results a,#searchResults a{',
      '  position:relative;',
      '  z-index:1;',
      '  pointer-events:auto !important;',
      '  white-space:normal !important;',
      '  word-break:break-word;',
      '  box-sizing:border-box !important;',
      '  display:block !important;',
      '  margin:0 !important;',
      '  padding:12px 16px !important;',
      '  line-height:1.42 !important;',
      '  font-size:16px !important;',
      '  font-weight:700 !important;',
      '  color:#181818 !important;',
      '  -webkit-text-fill-color:#181818 !important;',
      '  text-shadow:none !important;',
      '  opacity:1 !important;',
      '  border:0 !important;',
      '  border-bottom:1px solid rgba(145,172,230,0.42) !important;',
      '  background:#fff !important;',
      '  transition:background-color .14s ease, padding-left .14s ease, color .14s ease;',
      '}',
      '#searchResults.search-results a.highlight,#searchResults a.highlight{ color:#181818 !important; -webkit-text-fill-color:#181818 !important; background:#fff !important; opacity:1 !important; text-shadow:none !important; }',
      '#searchResults.search-results a:first-child,#searchResults a:first-child{ border-top-left-radius:18px !important; border-top-right-radius:18px !important; }',
      '#searchResults.search-results a:last-child,#searchResults a:last-child{ border-bottom:0 !important; border-bottom-left-radius:18px !important; border-bottom-right-radius:18px !important; }',
      '#searchResults.search-results a:hover,#searchResults a:hover,',
      '#searchResults.search-results a:focus,#searchResults a:focus{',
      '  background:#eef3ff !important;',
      '  color:#111827 !important;',
      '  padding-left:18px !important;',
      '  outline:0 !important;',
      '}',
      '#searchInput{ pointer-events:auto !important; }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parts() {
    return {
      input: byId(SEARCH_INPUT_ID),
      results: byId(SEARCH_RESULTS_ID)
    };
  }

  function hasText(input) {
    return !!(input && String(input.value || '').trim());
  }

  function hasResults(results) {
    return !!(results && results.children && results.children.length);
  }

  function setStyle(el, name, value) {
    if (!el) return;
    el.style.setProperty(name.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }), String(value), 'important');
  }

  function ensureResultsInContainer() {
    var p = parts();
    if (!p.input || !p.results) return false;
    var container = p.input.closest('.search-container') || p.input.parentNode;
    if (!container) return false;
    if (p.results.parentNode !== container) {
      container.appendChild(p.results);
    }
    return true;
  }

  function positionResultsNow() {
    rafPosition = 0;
    var p = parts();
    if (!p.input || !p.results) return;
    if (!ensureResultsInContainer()) return;

    var inputRect = p.input.getBoundingClientRect();
    var container = p.input.closest('.search-container') || p.input.parentNode;
    var containerRect = container && container.getBoundingClientRect ? container.getBoundingClientRect() : inputRect;
    var viewportH = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    var width = Math.max(220, Math.round(containerRect.width || inputRect.width || 0));
    var topGap = 6;
    var availableBelow = Math.max(140, Math.floor(viewportH - inputRect.bottom - 18));
    var maxH = Math.max(160, Math.min(420, availableBelow));

    setStyle(p.results, 'position', 'absolute');
    setStyle(p.results, 'left', '0px');
    setStyle(p.results, 'right', 'auto');
    setStyle(p.results, 'top', 'calc(100% + ' + topGap + 'px)');
    setStyle(p.results, 'width', width + 'px');
    setStyle(p.results, 'minWidth', width + 'px');
    setStyle(p.results, 'maxWidth', width + 'px');
    setStyle(p.results, 'marginTop', '0px');
    setStyle(p.results, 'boxSizing', 'border-box');
    setStyle(p.results, 'maxHeight', maxH + 'px');
    setStyle(p.results, 'zIndex', '2147483647');
  }

  function positionResults() {
    if (rafPosition) return;
    rafPosition = window.requestAnimationFrame ? window.requestAnimationFrame(positionResultsNow) : setTimeout(positionResultsNow, 0);
  }

  function sanitizeSearchResults() {
    var p = parts();
    var links;
    if (!p.results) return;

    links = Array.prototype.slice.call(p.results.querySelectorAll('a'));
    links.forEach(function (a) {
      var original;
      try { a.removeAttribute('title'); } catch (_) {}
      original = findOriginalLink(a);
      if (!original || !isRealSearchResultLink(original)) {
        try { a.remove(); } catch (_) {}
      }
    });

    if (!hasResults(p.results)) setStyle(p.results, 'display', 'none');
  }

  function showResults() {
    var p = parts();
    if (!hasText(p.input)) return;
    sanitizeSearchResults();
    if (!hasResults(p.results)) {
      if (p.results) setStyle(p.results, 'display', 'none');
      return;
    }
    ensureResultsInContainer();
    positionResults();
    setStyle(p.results, 'display', 'block');
  }

  function keepResultsOpen() {
    keepUntil = Date.now() + 1200;
    restoreTimers.forEach(function (timer) { clearTimeout(timer); });
    restoreTimers = [];
    [0, 25, 80, 180, 420, 900].forEach(function (delay) {
      restoreTimers.push(setTimeout(showResults, delay));
    });
  }

  function isRealSearchResultLink(link) {
    var rawHref;
    if (!link || !link.classList || link.classList.contains('no-search')) return false;
    if (link.closest && link.closest('#' + SEARCH_RESULTS_ID)) return false;

    rawHref = String(link.getAttribute('href') || '').trim();
    if (!rawHref || rawHref === '#' || rawHref.charAt(0) === '#') return false;
    if (/^javascript\s*:/i.test(rawHref)) return false;

    // Internal submenu headers are navigation labels, not executable SR links.
    if (link.nextElementSibling && link.nextElementSibling.classList && link.nextElementSibling.classList.contains('sub-dropdown-content')) {
      return false;
    }

    return true;
  }

  function allSearchableLinks() {
    return Array.prototype.slice.call(
      document.querySelectorAll('.dropdown-content a, .sub-dropdown-content a, a#singlelink')
    ).filter(isRealSearchResultLink);
  }

  function sameHref(a, b) {
    try {
      return String(a.href || '').trim() === String(b.href || '').trim();
    } catch (_) {
      return false;
    }
  }

  function findOriginalLink(resultLink) {
    var resultText = normalizeText(resultLink.textContent);
    var links = allSearchableLinks();
    var i;

    for (i = 0; i < links.length; i += 1) {
      if (sameHref(links[i], resultLink) && normalizeText(links[i].textContent) === resultText) {
        return links[i];
      }
    }
    for (i = 0; i < links.length; i += 1) {
      if (sameHref(links[i], resultLink)) return links[i];
    }
    for (i = 0; i < links.length; i += 1) {
      if (normalizeText(links[i].textContent) === resultText) return links[i];
    }
    return null;
  }

  function inputValue(id) {
    var el = byId(id);
    return el ? String(el.value || '').trim() : '';
  }

  function adslNumber() {
    return inputValue('arabicNumber').replace(/[^0-9\u0660-\u0669]/g, '');
  }

  function fbbNumber() {
    var fbb = inputValue('arabiccNumber');
    if (fbb) return fbb;
    var adsl = adslNumber();
    return adsl ? ('FBB' + adsl) : '';
  }

  function buildOpenLinkUrl(href) {
    var link = String(href || '');
    var value = fbbNumber();

    if (link.indexOf('srTypeId=102040017') !== -1 ||
        link.indexOf('srTypeId=103010007') !== -1 ||
        link.indexOf('srTypeId=103010008') !== -1 ||
        link.indexOf('srTypeId=102002061') !== -1) {
      link = link.replace(/([?&]subsNumber=)[^&]*/i, '$1' + value);
      value = '';
    }

    if (link.indexOf('srTypeId=100034005') !== -1) {
      link = link.replace(/([?&]subsNumber=)FBB(&BMEWebToken=)/, '$1' + value + '$2');
    }

    if (link.indexOf('srTypeId=102094003') !== -1) {
      link = link.replace(/([?&]subsNumber=)(&BMEWebToken=)/, '$1' + value + '$2');
      value = '';
    }

    if (link.indexOf('srTypeId=103038004') !== -1) {
      link = link.replace(/([?&]subsNumber=)[^&]*/i, '$1' + value);
      value = '';
    }

    if (link.indexOf('srTypeId=100047001') !== -1) {
      var n1 = inputValue('arabicNumber');
      var c1 = 'FBB Num (' + n1 + ') Accepted (3) GB for (2) days related tts - outage - ir  id (xxx) on mobile (xxx) ';
      link = link.replace(/([?&]serviceContent=)[^&]*/i, '$1' + encodeURIComponent(c1));
    }

    if (link.indexOf('srTypeId=100047021') !== -1) {
      var n2 = inputValue('arabicNumber');
      var c2 = 'FBB Num (' + n2 + ') Accepted (3) GB for (5) days related Zero SELT tts  id (xxx) on mobile (xxx) ';
      link = link.replace(/([?&]serviceContent=)[^&]*/i, '$1' + encodeURIComponent(c2));
    }

    return link + value;
  }

  function buildOpenLinkkUrl(href) {
    var link = String(href || '');
    var value = inputValue('arabicNumber');

    if (/([?&]subsNumber=)222\b/.test(link)) {
      link = link.replace(/([?&]subsNumber=)222\b/, '$1' + encodeURIComponent(value));
    } else if (/([?&]subsNumber=)$/.test(link)) {
      link = link + encodeURIComponent(value);
    } else if (!/[?&]subsNumber=/.test(link)) {
      link = link + (link.indexOf('?') === -1 ? '?' : '&') + 'subsNumber=' + encodeURIComponent(value);
    }

    return link;
  }

  function buildUrlForOriginal(original, resultLink) {
    var href = String(original ? (original.getAttribute('href') || original.href) : (resultLink.getAttribute('href') || resultLink.href) || '').trim();
    var onclick = original ? String(original.getAttribute('onclick') || '') : '';

    if (/openLinkk\s*\(/.test(onclick)) return buildOpenLinkkUrl(href);
    if (/openLink\s*\(/.test(onclick)) return buildOpenLinkUrl(href);

    return href;
  }

  function openOriginalFromSearch(resultLink) {
    var original = findOriginalLink(resultLink);
    var url;
    var rawTarget;
    var target;

    if (!original || !isRealSearchResultLink(original)) {
      try { if (resultLink) resultLink.remove(); } catch (_) {}
      sanitizeSearchResults();
      return;
    }

    url = buildUrlForOriginal(original, resultLink);
    rawTarget = String((original && original.getAttribute('target')) || resultLink.getAttribute('target') || '_blank');
    target = /blank/i.test(rawTarget) ? '_blank' : (rawTarget.replace(/\s+/g, '') || '_blank');

    keepResultsOpen();
    positionResults();

    try {
      window.open(url, target || '_blank');
    } catch (err) {
      try { window.location.href = url; } catch (_) {}
    }

    keepResultsOpen();
  }

  function isSearchResultAnchor(target) {
    var p = parts();
    if (!p.results || !target || !target.closest) return null;
    var a = target.closest('a');
    if (a && p.results.contains(a)) return a;
    return null;
  }

  function interceptResultEvent(event) {
    var resultLink = isSearchResultAnchor(event.target);
    if (!resultLink) return false;

    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    openOriginalFromSearch(resultLink);
    return true;
  }

  function anyBlockingModalOpen() {
    var selectors = [
      '.support-overlay',
      '.suggestions-overlay.is-open',
      '.smart-calc-overlay.is-open',
      '#UA07_SECRET_MODAL.is-open',
      '#UA07_UPDATE_MODAL.is-open',
      '#tagsOverlay'
    ];
    for (var i = 0; i < selectors.length; i += 1) {
      var nodes = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < nodes.length; j += 1) {
        var el = nodes[j];
        var cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (!cs) continue;
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') !== 0) return true;
      }
    }
    return false;
  }

  function eventPoint(event) {
    var src = event;
    if (event.touches && event.touches.length) src = event.touches[0];
    if (event.changedTouches && event.changedTouches.length) src = event.changedTouches[0];
    if (typeof src.clientX !== 'number' || typeof src.clientY !== 'number') return null;
    return { x: src.clientX, y: src.clientY };
  }

  function insideRect(point, rect, pad) {
    return point && rect &&
      point.x >= rect.left - pad && point.x <= rect.right + pad &&
      point.y >= rect.top - pad && point.y <= rect.bottom + pad;
  }


  function isHeaderTool(target) {
    if (!target || !target.closest) return null;
    for (var i = 0; i < HEADER_TOOL_IDS.length; i += 1) {
      var el = byId(HEADER_TOOL_IDS[i]);
      if (el && (target === el || (el.contains && el.contains(target)))) return el;
    }
    return null;
  }

  function triggerHeaderTool(el) {
    if (!el) return false;
    var id = el.id || 'header-tool';
    var now = Date.now();
    if (lastHeaderToolTrigger[id] && now - lastHeaderToolTrigger[id] < 320) return false;
    lastHeaderToolTrigger[id] = now;
    try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (__) {} }
    try { el.click(); return true; } catch (_) {}
    try {
      var evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      el.dispatchEvent(evt);
      return true;
    } catch (_) {}
    return false;
  }

  function routeHeaderToolPointer(event) {
    if (!event || anyBlockingModalOpen()) return;
    var point = eventPoint(event);
    if (!point) return;

    var directTool = isHeaderTool(event.target);
    if (directTool) return;

    for (var i = 0; i < HEADER_TOOL_IDS.length; i += 1) {
      var tool = byId(HEADER_TOOL_IDS[i]);
      if (!tool) continue;
      var rect = tool.getBoundingClientRect();
      if (!insideRect(point, rect, 5)) continue;
      if (triggerHeaderTool(tool)) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        return false;
      }
      return;
    }
  }

  function routeNumberInputPointer(event) {
    if (!event || anyBlockingModalOpen()) return;
    var point = eventPoint(event);
    if (!point) return;

    for (var i = 0; i < NUMBER_INPUT_IDS.length; i += 1) {
      var input = byId(NUMBER_INPUT_IDS[i]);
      if (!input) continue;
      var rect = input.getBoundingClientRect();
      if (!insideRect(point, rect, 3)) continue;

      if (event.target === input || (event.target && input.contains && input.contains(event.target))) {
        setTimeout(function (el) { try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_) {} } }, 0, input);
        return;
      }

      try { input.focus({ preventScroll: true }); } catch (_) { try { input.focus(); } catch (__) {} }
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      return false;
    }
  }

  function bindPositioning() {
    injectStyle();
    ensureResultsInContainer();
    positionResults();

    ['input', 'focus', 'keyup', 'change'].forEach(function (name) {
      document.addEventListener(name, function (event) {
        if (!event || event.target !== byId(SEARCH_INPUT_ID)) return;
        setTimeout(function () { ensureResultsInContainer(); showResults(); }, 0);
        setTimeout(function () { ensureResultsInContainer(); showResults(); }, 80);
      }, true);
    });

    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (name) {
      document.addEventListener(name, function (event) {
        if (isSearchResultAnchor(event.target)) {
          keepResultsOpen();
          positionResults();
          return;
        }
        if (routeNumberInputPointer(event) === false) return;
        if (routeHeaderToolPointer(event) === false) return;
      }, true);
    });

    document.addEventListener('click', function (event) {
      if (interceptResultEvent(event)) return false;
      if (Date.now() <= keepUntil) keepResultsOpen();
    }, true);

    document.addEventListener('keydown', function (event) {
      if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
      if (!interceptResultEvent(event)) return;
      return false;
    }, true);

    ['resize', 'scroll'].forEach(function (name) {
      window.addEventListener(name, positionResults, true);
    });

    try {
      var results = byId(SEARCH_RESULTS_ID);
      if (results) {
        var mo = new MutationObserver(function () {
          ensureResultsInContainer();
          sanitizeSearchResults();
          showResults();
          positionResults();
        });
        mo.observe(results, { childList: true, subtree: true });
      }
    } catch (_) {}

    setTimeout(function () { ensureResultsInContainer(); positionResults(); }, 60);
    setTimeout(function () { ensureResultsInContainer(); positionResults(); }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPositioning, { once: true });
  } else {
    bindPositioning();
  }
}());
