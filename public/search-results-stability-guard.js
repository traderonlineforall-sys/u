(function () {
  'use strict';

  /*
   * UA07 Search Results Egypt Premium V5
   *
   * Behavior:
   * - Search results float above the UI as a light overlay.
   * - Results do NOT push tabs / menus / buttons down.
   * - No portal, no MutationObserver loop, no DOM scanning loop.
   * - Premium Egypt-themed styling, separated visually from the search input.
   */

  var STYLE_ID = 'ua07-search-results-egypt-premium-v5';
  var OLD_STYLE_IDS = [
    'ua07-search-results-overlay-lite-v4',
    'ua07-search-results-flow-lite-v5',
    'mndo-search-results-floating-layer-v4',
    'ua07-search-results-portal-fix-v2',
    'ua07-search-results-portal-layer-v2',
    'ua07-search-results-flow-lite-v3',
    'ua07-search-results-flow-lite-v4'
  ];

  var raf = 0;
  var bound = false;

  function getInput() {
    return document.getElementById('searchInput')
      || document.querySelector('input.search-input')
      || document.querySelector('.search-container input')
      || document.querySelector('input[type="search"]')
      || document.querySelector('input[id*="search" i], input[class*="search" i]');
  }

  function getResults() {
    return document.getElementById('searchResults') || document.querySelector('.search-results');
  }

  function getContainer(input, results) {
    return (input && input.closest && input.closest('.search-container'))
      || (results && results.closest && results.closest('.search-container'))
      || (input && input.parentElement)
      || (results && results.parentElement)
      || null;
  }

  function removeOldFixes() {
    OLD_STYLE_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    if (document.body) {
      document.body.classList.remove('ua07-search-results-open');
    }
  }

  function injectCss() {
    removeOldFixes();
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '/* UA07 Egypt premium search overlay: absolute floating layer, no layout push. */',
      '.mndo-search-logo-row,',
      '.mndo-search-hk-anchor,',
      '.search-container{',
      '  overflow: visible !important;',
      '}',
      '.mndo-search-logo-row{',
      '  position: relative !important;',
      '  z-index: 2147483000 !important;',
      '}',
      '.mndo-search-hk-anchor{',
      '  position: relative !important;',
      '  z-index: 2147483001 !important;',
      '}',
      '.search-container{',
      '  position: relative !important;',
      '  z-index: 2147483002 !important;',
      '  contain: none !important;',
      '}',
      '#searchResults.search-results,',
      '#searchResults{',
      '  position: absolute !important;',
      '  top: calc(100% + 16px) !important;',
      '  left: var(--ua07-search-left, 50%) !important;',
      '  right: auto !important;',
      '  bottom: auto !important;',
      '  width: var(--ua07-search-width, min(430px, calc(100vw - 24px))) !important;',
      '  min-width: 0 !important;',
      '  max-width: calc(100vw - 24px) !important;',
      '  max-height: var(--ua07-search-max-height, min(360px, calc(100vh - 110px))) !important;',
      '  margin: 0 !important;',
      '  padding: 14px 12px 12px !important;',
      '  box-sizing: border-box !important;',
      '  overflow-y: auto !important;',
      '  overflow-x: hidden !important;',
      '  overscroll-behavior: contain !important;',
      '  scrollbar-gutter: stable !important;',
      '  border-radius: 22px !important;',
      '  border: 1px solid rgba(229,190,98,.62) !important;',
      '  background:',
      '    radial-gradient(circle at 18% 0%, rgba(224,31,31,.22), transparent 31%),',
      '    radial-gradient(circle at 86% 12%, rgba(230,176,76,.20), transparent 34%),',
      '    linear-gradient(180deg, rgba(30,21,12,.985), rgba(7,7,10,.985) 48%, rgba(3,3,7,.985)) !important;',
      '  color: rgba(255,244,214,.98) !important;',
      '  -webkit-text-fill-color: rgba(255,244,214,.98) !important;',
      '  box-shadow:',
      '    0 24px 70px rgba(0,0,0,.72),',
      '    0 0 0 1px rgba(255,234,157,.08),',
      '    inset 0 1px 0 rgba(255,255,255,.13),',
      '    inset 0 -20px 42px rgba(0,0,0,.30) !important;',
      '  text-align: center !important;',
      '  z-index: 2147483647 !important;',
      '  transform: translate3d(0,0,0) !important;',
      '  pointer-events: auto !important;',
      '  isolation: isolate !important;',
      '  contain: none !important;',
      '  counter-reset: ua07-search-result !important;',
      '}',
      '#searchResults.search-results:empty,',
      '#searchResults:empty{',
      '  display: none !important;',
      '  padding: 0 !important;',
      '  border-width: 0 !important;',
      '}',
      '#searchResults.search-results::before,',
      '#searchResults::before{',
      '  content: "EGYPT SEARCH" !important;',
      '  display: flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  height: 28px !important;',
      '  margin: -2px 2px 10px !important;',
      '  border-radius: 999px !important;',
      '  border: 1px solid rgba(236,199,111,.38) !important;',
      '  background:',
      '    linear-gradient(90deg, rgba(164,20,18,.92), rgba(232,187,82,.86) 50%, rgba(8,8,10,.96)) !important;',
      '  color: #fff2c8 !important;',
      '  -webkit-text-fill-color: #fff2c8 !important;',
      '  font-size: 11px !important;',
      '  font-weight: 900 !important;',
      '  letter-spacing: 1.7px !important;',
      '  text-shadow: 0 1px 2px rgba(0,0,0,.75) !important;',
      '  box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 8px 16px rgba(0,0,0,.22) !important;',
      '}',
      '#searchResults.search-results::after,',
      '#searchResults::after{',
      '  content: "" !important;',
      '  position: absolute !important;',
      '  top: -7px !important;',
      '  left: 50% !important;',
      '  width: 14px !important;',
      '  height: 14px !important;',
      '  margin-left: -7px !important;',
      '  box-sizing: border-box !important;',
      '  transform: rotate(45deg) !important;',
      '  border-left: 1px solid rgba(229,190,98,.62) !important;',
      '  border-top: 1px solid rgba(229,190,98,.62) !important;',
      '  background: linear-gradient(135deg, rgba(30,21,12,.985), rgba(86,22,14,.985)) !important;',
      '  box-shadow: -5px -5px 20px rgba(0,0,0,.18) !important;',
      '  z-index: -1 !important;',
      '}',
      '#searchResults.search-results a,',
      '#searchResults a{',
      '  position: relative !important;',
      '  display: flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  gap: 10px !important;',
      '  width: 100% !important;',
      '  min-height: 43px !important;',
      '  margin: 7px 0 !important;',
      '  padding: 10px 14px 10px 46px !important;',
      '  box-sizing: border-box !important;',
      '  border-radius: 15px !important;',
      '  border: 1px solid rgba(223,186,95,.28) !important;',
      '  background:',
      '    linear-gradient(180deg, rgba(255,255,255,.095), rgba(255,255,255,.035) 46%, rgba(0,0,0,.22)),',
      '    linear-gradient(90deg, rgba(184,28,23,.12), transparent 38%, rgba(232,188,86,.10)) !important;',
      '  color: rgba(255,246,221,.98) !important;',
      '  -webkit-text-fill-color: rgba(255,246,221,.98) !important;',
      '  font-weight: 900 !important;',
      '  font-size: 14px !important;',
      '  line-height: 1.35 !important;',
      '  text-align: center !important;',
      '  text-decoration: none !important;',
      '  text-shadow: 0 1px 2px rgba(0,0,0,.76) !important;',
      '  white-space: normal !important;',
      '  overflow-wrap: anywhere !important;',
      '  transform: none !important;',
      '  box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 8px 16px rgba(0,0,0,.16) !important;',
      '}',
      '#searchResults.search-results a::before,',
      '#searchResults a::before{',
      '  counter-increment: ua07-search-result !important;',
      '  content: counter(ua07-search-result) !important;',
      '  position: absolute !important;',
      '  left: 12px !important;',
      '  top: 50% !important;',
      '  width: 24px !important;',
      '  height: 24px !important;',
      '  margin-top: -12px !important;',
      '  display: inline-flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  border-radius: 999px !important;',
      '  border: 1px solid rgba(255,230,154,.48) !important;',
      '  background: radial-gradient(circle at 32% 25%, #ffeab1, #b98022 56%, #351707 100%) !important;',
      '  color: #180b04 !important;',
      '  -webkit-text-fill-color: #180b04 !important;',
      '  font-size: 11px !important;',
      '  font-weight: 950 !important;',
      '  line-height: 1 !important;',
      '  text-shadow: none !important;',
      '  box-shadow: 0 4px 10px rgba(0,0,0,.28) !important;',
      '}',
      '#searchResults.search-results a::after,',
      '#searchResults a::after{',
      '  content: "" !important;',
      '  position: absolute !important;',
      '  inset: 1px !important;',
      '  border-radius: 14px !important;',
      '  border-top: 1px solid rgba(255,255,255,.10) !important;',
      '  pointer-events: none !important;',
      '}',
      '#searchResults.search-results a:hover,',
      '#searchResults.search-results a:focus,',
      '#searchResults a:hover,',
      '#searchResults a:focus{',
      '  outline: none !important;',
      '  color: #fff8dd !important;',
      '  -webkit-text-fill-color: #fff8dd !important;',
      '  border-color: rgba(255,220,132,.72) !important;',
      '  background:',
      '    linear-gradient(180deg, rgba(144,28,21,.96), rgba(73,13,10,.96)),',
      '    linear-gradient(90deg, rgba(255,210,102,.20), transparent) !important;',
      '  box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 10px 22px rgba(0,0,0,.26), 0 0 0 1px rgba(255,217,132,.08) !important;',
      '}',
      '#searchResults.search-results a:hover::before,',
      '#searchResults.search-results a:focus::before,',
      '#searchResults a:hover::before,',
      '#searchResults a:focus::before{',
      '  background: radial-gradient(circle at 32% 25%, #fff6ce, #e1a942 58%, #4b1708 100%) !important;',
      '}',
      '#searchResults::-webkit-scrollbar{ width: 9px !important; }',
      '#searchResults::-webkit-scrollbar-track{ background: rgba(0,0,0,.24) !important; border-radius: 999px !important; margin: 14px 0 !important; }',
      '#searchResults::-webkit-scrollbar-thumb{ background: linear-gradient(180deg, rgba(230,187,85,.80), rgba(134,34,24,.78)) !important; border-radius: 999px !important; border: 2px solid rgba(7,7,10,.92) !important; }',
      '#searchResults::-webkit-scrollbar-thumb:hover{ background: linear-gradient(180deg, rgba(255,218,125,.94), rgba(178,42,30,.90)) !important; }'
    ].join('\n');

    (document.head || document.documentElement).appendChild(style);
  }

  function setImportant(el, prop, value) {
    if (!el) return;
    try { el.style.setProperty(prop, value, 'important'); } catch (_) {}
  }

  function alignNow() {
    raf = 0;
    injectCss();

    var input = getInput();
    var results = getResults();
    if (!input || !results) return;

    var container = getContainer(input, results);
    if (!container) return;

    if (results.parentElement !== container) {
      try { container.appendChild(results); } catch (_) {}
    }

    setImportant(container, 'position', 'relative');
    setImportant(container, 'overflow', 'visible');
    setImportant(container, 'z-index', '2147483002');

    var inputRect = input.getBoundingClientRect();
    var containerRect = container.getBoundingClientRect();
    var viewportW = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0, 320);
    var viewportH = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0, 320);

    if (!inputRect.width || !containerRect.width) return;

    var gap = 8;
    var desiredWidth = Math.min(Math.max(inputRect.width + 26, 350), 470, viewportW - (gap * 2));
    desiredWidth = Math.max(280, Math.round(desiredWidth));

    var left = Math.round((inputRect.left - containerRect.left) + ((inputRect.width - desiredWidth) / 2));
    var panelViewportLeft = Math.round(containerRect.left + left);
    var panelViewportRight = panelViewportLeft + desiredWidth;

    if (panelViewportLeft < gap) left += gap - panelViewportLeft;
    if (panelViewportRight > viewportW - gap) left -= panelViewportRight - (viewportW - gap);

    var topInViewport = Math.round(inputRect.bottom + 16);
    var maxHeight = Math.max(170, Math.min(370, viewportH - topInViewport - 12));

    results.style.setProperty('--ua07-search-left', Math.round(left) + 'px');
    results.style.setProperty('--ua07-search-width', desiredWidth + 'px');
    results.style.setProperty('--ua07-search-max-height', Math.round(maxHeight) + 'px');
  }

  function scheduleAlign() {
    if (raf) return;
    raf = window.requestAnimationFrame ? window.requestAnimationFrame(alignNow) : setTimeout(alignNow, 0);
  }

  function bind() {
    injectCss();

    var input = getInput();
    var results = getResults();
    var container = getContainer(input, results);

    if (container) {
      setImportant(container, 'position', 'relative');
      setImportant(container, 'overflow', 'visible');
      setImportant(container, 'z-index', '2147483002');
    }

    if (!input || bound) {
      scheduleAlign();
      return;
    }

    bound = true;

    ['input', 'focus', 'click', 'keyup', 'change', 'paste'].forEach(function (eventName) {
      input.addEventListener(eventName, scheduleAlign, { passive: true });
    });

    window.addEventListener('resize', scheduleAlign, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(scheduleAlign, 80); }, { passive: true });

    scheduleAlign();
    setTimeout(scheduleAlign, 80);
    setTimeout(scheduleAlign, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }

  window.addEventListener('load', function () {
    injectCss();
    scheduleAlign();
  }, { once: true, passive: true });
}());
