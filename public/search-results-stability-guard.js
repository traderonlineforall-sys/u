(function () {
  'use strict';

  /*
   * UA07 Search Results Flow Fix - lightweight rollback-safe version.
   *
   * Why this exists:
   * - The old floating/fixed search panel could overlap the main tool buttons.
   * - Portal/MutationObserver based fixes can make the page heavy.
   *
   * What this version does:
   * - Keeps #searchResults inside the original .search-container.
   * - Lets the header row grow only while results are open, so results do not cover buttons.
   * - Uses no MutationObserver, no ResizeObserver, no scroll loop, and no repeated style reinjection.
   */

  var STYLE_ID = 'ua07-search-results-flow-lite-v5';
  var BODY_CLASS = 'ua07-search-results-open';
  var bound = false;
  var syncTimer = 0;

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

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '/* UA07 search flow fix: no fixed portal, no overlap, no heavy observers. */',
      'body.' + BODY_CLASS + ' .mndo-search-logo-row{',
      '  height: auto !important;',
      '  min-height: 44px !important;',
      '  max-height: none !important;',
      '  align-items: flex-start !important;',
      '  overflow: visible !important;',
      '  contain: none !important;',
      '}',
      'body.' + BODY_CLASS + ' .mndo-search-hk-anchor{',
      '  height: auto !important;',
      '  min-height: 44px !important;',
      '  max-height: none !important;',
      '  overflow: visible !important;',
      '  z-index: 2147483000 !important;',
      '}',
      'body.' + BODY_CLASS + ' .search-container,',
      'body.' + BODY_CLASS + ' .mndo-search-logo-row .search-container{',
      '  height: auto !important;',
      '  min-height: 44px !important;',
      '  max-height: none !important;',
      '  overflow: visible !important;',
      '  position: relative !important;',
      '  z-index: 2147483000 !important;',
      '}',
      'body.' + BODY_CLASS + ' #searchResults.search-results,',
      'body.' + BODY_CLASS + ' #searchResults{',
      '  display: block !important;',
      '  position: static !important;',
      '  inset: auto !important;',
      '  top: auto !important;',
      '  right: auto !important;',
      '  bottom: auto !important;',
      '  left: auto !important;',
      '  transform: none !important;',
      '  width: min(400px, calc(100vw - 24px)) !important;',
      '  min-width: 0 !important;',
      '  max-width: 100% !important;',
      '  max-height: min(320px, calc(100vh - 140px)) !important;',
      '  margin: 8px auto 12px auto !important;',
      '  padding: 8px !important;',
      '  box-sizing: border-box !important;',
      '  overflow-y: auto !important;',
      '  overflow-x: hidden !important;',
      '  scrollbar-gutter: stable !important;',
      '  overscroll-behavior: contain !important;',
      '  border-radius: 18px !important;',
      '  border: 1px solid rgba(212,178,94,.44) !important;',
      '  background: linear-gradient(180deg, rgba(24,24,28,.98), rgba(6,7,10,.98)) !important;',
      '  color: rgba(255,241,205,.96) !important;',
      '  -webkit-text-fill-color: rgba(255,241,205,.96) !important;',
      '  box-shadow: 0 18px 36px rgba(0,0,0,.50), inset 0 1px 0 rgba(255,255,255,.08) !important;',
      '  text-align: center !important;',
      '  z-index: 2147483647 !important;',
      '}',
      'body.' + BODY_CLASS + ' #searchResults.search-results a,',
      'body.' + BODY_CLASS + ' #searchResults a{',
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
      'body.' + BODY_CLASS + ' #searchResults.search-results a:hover,',
      'body.' + BODY_CLASS + ' #searchResults.search-results a:focus,',
      'body.' + BODY_CLASS + ' #searchResults a:hover,',
      'body.' + BODY_CLASS + ' #searchResults a:focus{',
      '  outline: none !important;',
      '  color: #fff7d7 !important;',
      '  -webkit-text-fill-color: #fff7d7 !important;',
      '  border-color: rgba(245,213,139,.58) !important;',
      '  background: linear-gradient(180deg, rgba(117,28,22,.86), rgba(30,8,6,.96)) !important;',
      '  transform: none !important;',
      '}',
      'body:not(.' + BODY_CLASS + ') #searchResults.search-results:empty,',
      'body:not(.' + BODY_CLASS + ') #searchResults:empty{',
      '  display: none !important;',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  border-width: 0 !important;',
      '}',
      '#searchResults::-webkit-scrollbar{ width: 8px !important; }',
      '#searchResults::-webkit-scrollbar-track{ background: rgba(0,0,0,.24) !important; border-radius: 999px !important; }',
      '#searchResults::-webkit-scrollbar-thumb{ background: rgba(205,168,86,.52) !important; border-radius: 999px !important; }'
    ].join('\n');

    /* Append late to body so it wins over older inline body styles without using a loop. */
    (document.body || document.head || document.documentElement).appendChild(style);
  }

  function hasVisibleResults(input, results) {
    if (!input || !results) return false;
    if (!String(input.value || '').trim()) return false;
    if (!results.children || results.children.length === 0) return false;
    if (results.style && results.style.display === 'none') return false;
    return true;
  }

  function syncOpenState() {
    syncTimer = 0;
    injectCss();

    var input = getInput();
    var results = getResults();
    var open = hasVisibleResults(input, results);

    if (document.body) {
      document.body.classList.toggle(BODY_CLASS, open);
    }
  }

  function scheduleSync(delay) {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(syncOpenState, typeof delay === 'number' ? delay : 0);
  }

  function bind() {
    injectCss();

    var input = getInput();
    if (!input || bound) {
      syncOpenState();
      return;
    }

    bound = true;

    ['input', 'focus', 'click', 'keyup', 'change', 'paste'].forEach(function (eventName) {
      input.addEventListener(eventName, function () {
        scheduleSync(0);
      }, { passive: true });
    });

    /* app.js hides results on outside click. Run after that handler. */
    document.addEventListener('click', function () {
      scheduleSync(0);
    }, false);

    /* Cheap safety checks for late page/theme scripts; no continuous loop. */
    scheduleSync(0);
    scheduleSync(120);
    scheduleSync(500);
  }

  function init() {
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.addEventListener('load', function () {
    injectCss();
    syncOpenState();
  }, { once: true, passive: true });
}());
