(function () {
  'use strict';

  /*
   * Lightweight search results visual guard.
   * No keyboard/click/input interception. No MutationObserver.
   * It only improves the results panel layer so it does not visually mix with
   * the page menus, and keeps the old tooltip path behavior handled by app.js.
   */
  function injectSearchResultsLayerCss() {
    var id = 'mndo-search-results-layer-polish-v2';
    if (document.getElementById(id)) return;

    var style = document.createElement('style');
    style.id = id;
    style.textContent = [
      '.search-container{',
      '  position: relative !important;',
      '  overflow: visible !important;',
      '  z-index: 2147483600 !important;',
      '}',
      '#searchResults.search-results, #searchResults{',
      '  position: absolute !important;',
      '  top: calc(100% + 10px) !important;',
      '  z-index: 2147483647 !important;',
      '  max-height: 240px !important;',
      '  overflow-y: auto !important;',
      '  overflow-x: hidden !important;',
      '  padding: 7px !important;',
      '  border-radius: 16px !important;',
      '  border: 1px solid rgba(219,186,105,.42) !important;',
      '  background: linear-gradient(180deg, rgba(25,10,7,.98), rgba(6,3,2,.97)) !important;',
      '  box-shadow: 0 22px 46px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,241,199,.08) !important;',
      '  backdrop-filter: blur(10px) saturate(1.05) !important;',
      '  -webkit-backdrop-filter: blur(10px) saturate(1.05) !important;',
      '  isolation: isolate !important;',
      '}',
      '#searchResults.search-results a, #searchResults a{',
      '  min-height: 34px !important;',
      '  margin: 4px 0 !important;',
      '  border-radius: 11px !important;',
      '  border: 1px solid rgba(219,186,105,.18) !important;',
      '  background: linear-gradient(180deg, rgba(255,246,220,.08), rgba(80,12,9,.18)) !important;',
      '  color: #f7e6b8 !important;',
      '  text-shadow: 0 1px 2px rgba(0,0,0,.7) !important;',
      '  text-decoration: none !important;',
      '  box-shadow: inset 0 1px 0 rgba(255,255,255,.05) !important;',
      '}',
      '#searchResults.search-results a:hover, #searchResults.search-results a:focus, #searchResults a:hover, #searchResults a:focus{',
      '  background: linear-gradient(180deg, rgba(116,18,14,.82), rgba(28,6,4,.92)) !important;',
      '  border-color: rgba(245,214,144,.52) !important;',
      '  color: #fff3cf !important;',
      '  box-shadow: 0 8px 22px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08) !important;',
      '}',
      '#searchResults::-webkit-scrollbar{ width: 8px !important; }',
      '#searchResults::-webkit-scrollbar-track{ background: rgba(0,0,0,.24) !important; border-radius: 999px !important; }',
      '#searchResults::-webkit-scrollbar-thumb{ background: rgba(205,168,86,.48) !important; border-radius: 999px !important; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSearchResultsLayerCss, { once: true });
  } else {
    injectSearchResultsLayerCss();
  }
}());
