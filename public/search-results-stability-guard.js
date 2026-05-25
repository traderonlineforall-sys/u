(function () {
  'use strict';

  var SEARCH_INPUT_ID = 'searchInput';
  var SEARCH_RESULTS_ID = 'searchResults';
  var NUMBER_INPUT_IDS = ['arabiccNumber', 'arabicNumber'];
  var keepUntil = 0;
  var restoreTimers = [];
  var layerReady = false;
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
      '#copyBtn,#copyBtn1,#copyNotification,#copyNotification1{',
      '  pointer-events:auto !important;',
      '  z-index:9100 !important;',
      '}',
      '#arabiccNumber:focus,#arabicNumber:focus{',
      '  outline:0 !important;',
      '}',
      '/* Keep search results exactly under the search box and above the rest of the page. */',
      '.mndo-search-logo-row{position:relative !important; overflow:visible !important; z-index:2147483600 !important;}',
      '.mndo-search-hk-anchor{position:relative !important; overflow:visible !important; z-index:2147483601 !important;}',
      '.search-container{position:relative !important; overflow:visible !important; z-index:2147483602 !important;}',
      '#searchResults.search-results,#searchResults{',
      '  position:absolute !important;',
      '  top:calc(100% + 6px) !important;',
      '  left:0 !important;',
      '  right:auto !important;',
      '  margin:0 !important;',
      '  width:100% !important;',
      '  min-width:100% !important;',
      '  max-width:100% !important;',
      '  z-index:2147483646 !important;',
      '  box-sizing:border-box !important;',
      '  overflow-y:auto !important;',
      '  overflow-x:hidden !important;',
      '  max-height:min(500px,calc(100vh - 90px)) !important;',
      '  -webkit-overflow-scrolling:touch;',
      '}',
      '#searchResults.search-results a,#searchResults a{',
      '  position:relative;',
      '  z-index:1;',
      '  pointer-events:auto !important;',
      '  white-space:normal !important;',
      '  word-break:break-word;',
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
    if (!el || el.style[name] === value) return;
    el.style[name] = value;
  }

  function ensureSearchLayer() {
    var p = parts();
    if (!p.input || !p.results) return false;
    var container = p.input.closest ? p.input.closest('.search-container') : null;
    if (!container) container = p.input.parentNode;
    if (!container) return false;
    if (p.results.parentNode !== container) {
      container.appendChild(p.results);
    }
    layerReady = true;
    return true;
  }

  function positionResultsNow() {
    rafPosition = 0;
    var p = parts();
    if (!p.input || !p.results) return;
    if (!ensureSearchLayer()) return;
    var rect = p.input.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    var viewportH = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    var maxH = Math.max(140, Math.min(500, viewportH - Math.round(rect.bottom) - 12));
    var container = p.input.closest ? p.input.closest('.search-container') : null;
    var width = container ? Math.round(container.getBoundingClientRect().width) : Math.round(rect.width);
    if (width < 220) width = Math.max(220, Math.round(rect.width));

    setStyle(p.results, 'position', 'absolute');
    setStyle(p.results, 'left', '0px');
    setStyle(p.results, 'top', 'calc(100% + 6px)');
    setStyle(p.results, 'width', width + 'px');
    setStyle(p.results, 'minWidth', width + 'px');
    setStyle(p.results, 'maxWidth', width + 'px');
    setStyle(p.results, 'right', 'auto');
    setStyle(p.results, 'marginTop', '0px');
    setStyle(p.results, 'zIndex', '2147483646');
    setStyle(p.results, 'boxSizing', 'border-box');
    setStyle(p.results, 'maxHeight', maxH + 'px');
  }

  function positionResults() {
    if (rafPosition) return;
    rafPosition = window.requestAnimationFrame ? window.requestAnimationFrame(positionResultsNow) : setTimeout(positionResultsNow, 0);
  }

  function showResults() {
    var p = parts();
    if (!hasText(p.input) || !hasResults(p.results)) return;
    ensureSearchLayer();
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

  function allSearchableLinks() {
    var currentResults = byId(SEARCH_RESULTS_ID);
    return Array.prototype.slice.call(
      document.querySelectorAll('.dropdown-content a, .sub-dropdown-content a, a#singlelink')
    ).filter(function (link) {
      return link && !link.classList.contains('no-search') && !(currentResults && currentResults.contains(link));
    });
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
    var url = buildUrlForOriginal(original, resultLink);
    var rawTarget = String((original && original.getAttribute('target')) || resultLink.getAttribute('target') || '_blank');
    var target = /blank/i.test(rawTarget) ? '_blank' : (rawTarget.replace(/\s+/g, '') || '_blank');

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
    var p = parts();
    if (p.results) ensureSearchLayer();

    ['input', 'focus', 'keyup', 'change'].forEach(function (name) {
      document.addEventListener(name, function (event) {
        if (!event || event.target !== byId(SEARCH_INPUT_ID)) return;
        setTimeout(function () { ensureSearchLayer(); showResults(); }, 0);
        setTimeout(function () { ensureSearchLayer(); showResults(); }, 80);
      }, true);
    });

    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (name) {
      document.addEventListener(name, function (event) {
        if (isSearchResultAnchor(event.target)) {
          keepResultsOpen();
          positionResults();
          return;
        }
        routeNumberInputPointer(event);
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
          if (!layerReady) ensureSearchLayer();
          showResults();
          positionResults();
        });
        mo.observe(results, { childList: true, subtree: true });
      }
    } catch (_) {}

    setTimeout(function () { ensureSearchLayer(); positionResults(); }, 60);
    setTimeout(function () { ensureSearchLayer(); positionResults(); }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPositioning, { once: true });
  } else {
    bindPositioning();
  }
}());
