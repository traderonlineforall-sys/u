(function () {
  'use strict';

  /*
   * Search results floating layer fix.
   * Does not block typing/clicks/keyboard events.
   * Purpose: keep #searchResults as a true floating layer above the tool menus,
   * while app.js keeps the actual search logic and tooltip path behavior.
   */

  var STYLE_ID = 'mndo-search-results-floating-layer-v4';
  var RAF = 0;

  function getSearchInput() {
    return document.getElementById('searchInput')
      || document.querySelector('input.search-input')
      || document.querySelector('.search-container input')
      || document.querySelector('input[type="search"]')
      || document.querySelector('input[id*="search" i], input[class*="search" i]');
  }

  function getSearchResults() {
    return document.getElementById('searchResults') || document.querySelector('.search-results');
  }

  function injectCss() {
    var old = document.getElementById(STYLE_ID);
    if (old) old.remove();

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.search-container{',
      '  position: relative !important;',
      '  overflow: visible !important;',
      '  z-index: 2147483000 !important;',
      '}',
      '#searchResults.search-results, #searchResults{',
      '  position: fixed !important;',
      '  left: var(--mndo-search-left, 50%) !important;',
      '  top: var(--mndo-search-top, 74px) !important;',
      '  width: var(--mndo-search-width, 420px) !important;',
      '  min-width: 320px !important;',
      '  max-width: min(520px, calc(100vw - 24px)) !important;',
      '  max-height: var(--mndo-search-max-height, 255px) !important;',
      '  overflow-y: auto !important;',
      '  overflow-x: hidden !important;',
      '  box-sizing: border-box !important;',
      '  margin: 0 !important;',
      '  padding: 8px !important;',
      '  border-radius: 18px !important;',
      '  border: 1px solid rgba(212,178,94,.44) !important;',
      '  background: linear-gradient(180deg, rgba(24,24,28,.98), rgba(6,7,10,.98)) !important;',
      '  box-shadow: 0 26px 58px rgba(0,0,0,.64), inset 0 1px 0 rgba(255,255,255,.08) !important;',
      '  backdrop-filter: blur(12px) saturate(1.08) !important;',
      '  -webkit-backdrop-filter: blur(12px) saturate(1.08) !important;',
      '  z-index: 2147483647 !important;',
      '  isolation: isolate !important;',
      '  transform: translateZ(0) !important;',
      '  pointer-events: auto !important;',
      '}',
      '#searchResults.search-results a, #searchResults a{',
      '  position: relative !important;',
      '  display: flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  min-height: 38px !important;',
      '  padding: 8px 12px !important;',
      '  margin: 5px 0 !important;',
      '  border-radius: 13px !important;',
      '  border: 1px solid rgba(212,178,94,.22) !important;',
      '  background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(0,0,0,.28)) !important;',
      '  color: rgba(255,241,205,.96) !important;',
      '  font-weight: 800 !important;',
      '  line-height: 1.35 !important;',
      '  text-align: center !important;',
      '  text-decoration: none !important;',
      '  text-shadow: 0 1px 2px rgba(0,0,0,.72) !important;',
      '  box-shadow: inset 0 1px 0 rgba(255,255,255,.06) !important;',
      '  white-space: normal !important;',
      '}',
      '#searchResults.search-results a:hover, #searchResults.search-results a:focus, #searchResults a:hover, #searchResults a:focus{',
      '  outline: none !important;',
      '  color: #fff7d7 !important;',
      '  border-color: rgba(245,213,139,.58) !important;',
      '  background: linear-gradient(180deg, rgba(117,28,22,.86), rgba(30,8,6,.96)) !important;',
      '  box-shadow: 0 12px 26px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.09) !important;',
      '}',
      '#searchResults::-webkit-scrollbar{ width: 8px !important; }',
      '#searchResults::-webkit-scrollbar-track{ background: rgba(0,0,0,.24) !important; border-radius: 999px !important; }',
      '#searchResults::-webkit-scrollbar-thumb{ background: rgba(205,168,86,.52) !important; border-radius: 999px !important; }',

      'html.egypt-worldcup-theme-live #searchResults.search-results, html.egypt-worldcup-theme-live #searchResults{',
      '  border-color: rgba(214,174,88,.58) !important;',
      '  background:',
      '    linear-gradient(180deg, rgba(118,19,15,.16) 0 12%, rgba(255,244,210,.06) 12% 55%, rgba(0,0,0,.16) 55% 100%),',
      '    linear-gradient(180deg, rgba(26,8,6,.985), rgba(6,3,2,.985)) !important;',
      '  box-shadow: 0 28px 62px rgba(0,0,0,.68), 0 0 0 1px rgba(255,232,168,.08), inset 0 1px 0 rgba(255,246,210,.10) !important;',
      '}',
      'html.egypt-worldcup-theme-live #searchResults.search-results a, html.egypt-worldcup-theme-live #searchResults a{',
      '  border-color: rgba(211,171,78,.28) !important;',
      '  background:',
      '    linear-gradient(90deg, rgba(150,22,17,.92) 0 5px, transparent 5px),',
      '    linear-gradient(180deg, rgba(255,248,224,.10), rgba(92,15,11,.22)) !important;',
      '  color: #f4deb0 !important;',
      '}',
      'html.egypt-worldcup-theme-live #searchResults.search-results a:hover, html.egypt-worldcup-theme-live #searchResults.search-results a:focus, html.egypt-worldcup-theme-live #searchResults a:hover, html.egypt-worldcup-theme-live #searchResults a:focus{',
      '  background:',
      '    linear-gradient(90deg, rgba(194,30,24,.98) 0 5px, transparent 5px),',
      '    linear-gradient(180deg, rgba(255,246,219,.16), rgba(104,17,13,.84)) !important;',
      '  color: #fff4cd !important;',
      '  border-color: rgba(245,213,139,.64) !important;',
      '}'
    ].join('\n');

    document.head.appendChild(style);
  }

  function schedulePosition() {
    if (RAF) cancelAnimationFrame(RAF);
    RAF = requestAnimationFrame(positionResults);
  }

  function positionResults() {
    RAF = 0;
    var input = getSearchInput();
    var results = getSearchResults();
    if (!input || !results) return;

    var rect = input.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    var gap = 8;
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1366;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
    var desiredWidth = Math.max(320, Math.min(rect.width, 520, viewportWidth - 24));
    var left = Math.round(rect.left + (rect.width - desiredWidth) / 2);
    left = Math.max(12, Math.min(left, viewportWidth - desiredWidth - 12));

    var top = Math.round(rect.bottom + gap);
    var maxHeight = Math.max(150, Math.min(280, viewportHeight - top - 14));

    results.style.setProperty('--mndo-search-left', left + 'px');
    results.style.setProperty('--mndo-search-top', top + 'px');
    results.style.setProperty('--mndo-search-width', Math.round(desiredWidth) + 'px');
    results.style.setProperty('--mndo-search-max-height', Math.round(maxHeight) + 'px');
    results.classList.add('mndo-search-results-floating-layer');
  }

  function bind() {
    var input = getSearchInput();
    if (!input || input.__mndoFloatingSearchBound) return;
    input.__mndoFloatingSearchBound = true;

    ['focus', 'input', 'keyup', 'paste', 'click'].forEach(function (eventName) {
      input.addEventListener(eventName, function () {
        schedulePosition();
        setTimeout(schedulePosition, 0);
      }, { passive: true });
    });

    window.addEventListener('resize', schedulePosition, { passive: true });
    window.addEventListener('scroll', schedulePosition, { passive: true });
    schedulePosition();
  }

  function init() {
    injectCss();
    bind();
    setTimeout(bind, 250);
    setTimeout(bind, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
