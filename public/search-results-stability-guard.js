(function () {
  'use strict';

  /*
   * UA07 Search Results Overlay Lite V4
   *
   * Required behavior:
   * - Search results must float above the tool UI.
   * - Results must NOT push tabs / menus / buttons down.
   * - No portal, no DOM moving to body, no MutationObserver loop.
   * - Keep app.js search logic untouched.
   */

  var STYLE_ID = 'ua07-search-results-overlay-lite-v4';
  var OLD_STYLE_IDS = [
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
      '/* UA07 search overlay: absolute floating layer, no layout push. */',
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
      '  top: calc(100% + 6px) !important;',
      '  left: var(--ua07-search-left, 50%) !important;',
      '  right: auto !important;',
      '  bottom: auto !important;',
      '  width: var(--ua07-search-width, min(400px, calc(100vw - 24px))) !important;',
      '  min-width: 0 !important;',
      '  max-width: calc(100vw - 24px) !important;',
      '  max-height: var(--ua07-search-max-height, min(320px, calc(100vh - 96px))) !important;',
      '  margin: 0 !important;',
      '  padding: 8px !important;',
      '  box-sizing: border-box !important;',
      '  overflow-y: auto !important;',
      '  overflow-x: hidden !important;',
      '  overscroll-behavior: contain !important;',
      '  scrollbar-gutter: stable !important;',
      '  border-radius: 18px !important;',
      '  border: 1px solid rgba(212,178,94,.44) !important;',
      '  background: linear-gradient(180deg, rgba(24,24,28,.985), rgba(6,7,10,.985)) !important;',
      '  color: rgba(255,241,205,.96) !important;',
      '  -webkit-text-fill-color: rgba(255,241,205,.96) !important;',
      '  box-shadow: 0 24px 54px rgba(0,0,0,.66), inset 0 1px 0 rgba(255,255,255,.08) !important;',
      '  text-align: center !important;',
      '  z-index: 2147483647 !important;',
      '  transform: translate3d(0,0,0) !important;',
      '  pointer-events: auto !important;',
      '  isolation: isolate !important;',
      '  contain: none !important;',
      '}',
      '#searchResults.search-results:empty,',
      '#searchResults:empty{',
      '  display: none !important;',
      '  padding: 0 !important;',
      '  border-width: 0 !important;',
      '}',
      '#searchResults.search-results a,',
      '#searchResults a{',
      '  display: flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  width: 100% !important;',
      '  min-height: 36px !important;',
      '  margin: 5px 0 !important;',
      '  padding: 8px 12px !important;',
      '  box-sizing: border-box !important;',
      '  border-radius: 13px !important;',
      '  border: 1px solid rgba(212,178,94,.22) !important;',
      '  background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(0,0,0,.28)) !important;',
      '  color: rgba(255,241,205,.96) !important;',
      '  -webkit-text-fill-color: rgba(255,241,205,.96) !important;',
      '  font-weight: 800 !important;',
      '  font-size: 14px !important;',
      '  line-height: 1.35 !important;',
      '  text-align: center !important;',
      '  text-decoration: none !important;',
      '  text-shadow: 0 1px 2px rgba(0,0,0,.72) !important;',
      '  white-space: normal !important;',
      '  overflow-wrap: anywhere !important;',
      '  transform: none !important;',
      '}',
      '#searchResults.search-results a:hover,',
      '#searchResults.search-results a:focus,',
      '#searchResults a:hover,',
      '#searchResults a:focus{',
      '  outline: none !important;',
      '  color: #fff7d7 !important;',
      '  -webkit-text-fill-color: #fff7d7 !important;',
      '  border-color: rgba(245,213,139,.58) !important;',
      '  background: linear-gradient(180deg, rgba(117,28,22,.86), rgba(30,8,6,.96)) !important;',
      '}',
      '#searchResults::-webkit-scrollbar{ width: 8px !important; }',
      '#searchResults::-webkit-scrollbar-track{ background: rgba(0,0,0,.24) !important; border-radius: 999px !important; }',
      '#searchResults::-webkit-scrollbar-thumb{ background: rgba(205,168,86,.52) !important; border-radius: 999px !important; }'
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
    var desiredWidth = Math.min(Math.max(inputRect.width, 320), 460, viewportW - (gap * 2));
    desiredWidth = Math.max(260, Math.round(desiredWidth));

    var left = Math.round((inputRect.left - containerRect.left) + ((inputRect.width - desiredWidth) / 2));
    var panelViewportLeft = Math.round(containerRect.left + left);
    var panelViewportRight = panelViewportLeft + desiredWidth;

    if (panelViewportLeft < gap) left += gap - panelViewportLeft;
    if (panelViewportRight > viewportW - gap) left -= panelViewportRight - (viewportW - gap);

    var topInViewport = Math.round(inputRect.bottom + 6);
    var maxHeight = Math.max(160, Math.min(340, viewportH - topInViewport - 12));

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
