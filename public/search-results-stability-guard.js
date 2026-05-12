(function () {
  'use strict';

  var SEARCH_INPUT_ID = 'searchInput';
  var SEARCH_RESULTS_ID = 'searchResults';
  var keepUntil = 0;
  var restoreTimers = [];
  var portalReady = false;

  function byId(id) { return document.getElementById(id); }

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
    return !!(results && results.childNodes && results.childNodes.length);
  }

  function ensurePortal() {
    var p = parts();
    if (!p.results || !document.body) return false;
    if (p.results.parentNode !== document.body) {
      document.body.appendChild(p.results);
    }
    p.results.classList.add('sr-search-results-portal');
    portalReady = true;
    positionResults();
    return true;
  }

  function positionResults() {
    var p = parts();
    if (!p.input || !p.results) return;
    var rect = p.input.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    p.results.style.position = 'fixed';
    p.results.style.left = Math.round(rect.left) + 'px';
    p.results.style.top = Math.round(rect.bottom + 6) + 'px';
    p.results.style.width = Math.round(rect.width) + 'px';
    p.results.style.right = 'auto';
    p.results.style.marginTop = '0';
    p.results.style.zIndex = '2147483646';
    p.results.style.boxSizing = 'border-box';
    p.results.style.maxHeight = 'min(500px, calc(100vh - ' + Math.round(rect.bottom + 18) + 'px))';
  }

  function showResults() {
    var p = parts();
    if (!hasText(p.input) || !hasResults(p.results)) return;
    ensurePortal();
    positionResults();
    p.results.style.display = 'block';
  }

  function keepResultsOpen() {
    keepUntil = Date.now() + 1600;
    restoreTimers.forEach(function (timer) { clearTimeout(timer); });
    restoreTimers = [];
    [0, 25, 80, 180, 420, 900, 1400].forEach(function (delay) {
      restoreTimers.push(setTimeout(showResults, delay));
    });
  }

  function allSearchableLinks() {
    return Array.prototype.slice.call(
      document.querySelectorAll('.dropdown-content a, .sub-dropdown-content a, a#singlelink')
    ).filter(function (link) {
      var currentResults = byId(SEARCH_RESULTS_ID);
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

  ['pointerdown', 'mousedown', 'touchstart'].forEach(function (name) {
    document.addEventListener(name, function (event) {
      if (!isSearchResultAnchor(event.target)) return;
      keepResultsOpen();
      positionResults();
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

  function bindPositioning() {
    var p = parts();
    if (!p.input || !p.results) return;
    ensurePortal();
    positionResults();

    ['input', 'focus', 'keyup'].forEach(function (name) {
      p.input.addEventListener(name, function () {
        setTimeout(function () { ensurePortal(); showResults(); }, 0);
      }, true);
    });

    ['resize', 'scroll'].forEach(function (name) {
      window.addEventListener(name, positionResults, true);
    });

    try {
      var mo = new MutationObserver(function () {
        if (!portalReady) ensurePortal();
        positionResults();
      });
      mo.observe(p.results, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPositioning, { once: true });
  } else {
    bindPositioning();
  }
}());
