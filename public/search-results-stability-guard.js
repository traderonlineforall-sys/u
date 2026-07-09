(function () {
  'use strict';

  /*
   * UA07 Search Results Egypt Sleek V6
   *
   * Goal:
   * - Keep the working V4/V5 overlay behavior: no layout push, no heavy portal.
   * - Remove numbers and the EGYPT SEARCH title.
   * - Visually attach the results panel to the search input with a premium Egypt theme.
   * - Stay lightweight: no MutationObserver loops, no body portal, no DOM scanning loop.
   */

  var STYLE_ID = 'ua07-search-results-egypt-sleek-v6';
  var OPEN_CLASS = 'ua07-search-is-open';
  var PANEL_CLASS = 'ua07-egypt-sleek-panel';
  var CONTAINER_CLASS = 'ua07-egypt-sleek-container';
  var OLD_STYLE_IDS = [
    'ua07-search-results-egypt-premium-v5',
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
  var lastContainer = null;
  var lastResults = null;

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
      '/* UA07 Egypt sleek attached search results: absolute overlay, no layout push. */',
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
      '.search-container,',
      '.' + CONTAINER_CLASS + '{',
      '  position: relative !important;',
      '  z-index: 2147483002 !important;',
      '  contain: none !important;',
      '}',
      '.' + CONTAINER_CLASS + ' input,',
      '.' + CONTAINER_CLASS + ' input[type="text"],',
      '.' + CONTAINER_CLASS + ' input[type="search"]{',
      '  transition: border-color .16s ease, box-shadow .16s ease, border-radius .16s ease, background .16s ease !important;',
      '}',
      '.' + CONTAINER_CLASS + '.' + OPEN_CLASS + ' input,',
      '.' + CONTAINER_CLASS + '.' + OPEN_CLASS + ' input[type="text"],',
      '.' + CONTAINER_CLASS + '.' + OPEN_CLASS + ' input[type="search"]{',
      '  border-bottom-left-radius: 12px !important;',
      '  border-bottom-right-radius: 12px !important;',
      '  border-color: rgba(235,196,105,.86) !important;',
      '  box-shadow: 0 0 0 1px rgba(235,196,105,.18), 0 10px 26px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.12) !important;',
      '}',
      '#searchResults.' + PANEL_CLASS + ',',
      '#searchResults.search-results.' + PANEL_CLASS + ',',
      '#searchResults#searchResults.' + PANEL_CLASS + '{',
      '  position: absolute !important;',
      '  top: calc(100% + 5px) !important;',
      '  left: var(--ua07-search-left, 0px) !important;',
      '  right: auto !important;',
      '  bottom: auto !important;',
      '  width: var(--ua07-search-width, min(420px, calc(100vw - 24px))) !important;',
      '  min-width: 0 !important;',
      '  max-width: calc(100vw - 24px) !important;',
      '  max-height: var(--ua07-search-max-height, min(350px, calc(100vh - 110px))) !important;',
      '  margin: 0 !important;',
      '  padding: 8px 8px 9px !important;',
      '  box-sizing: border-box !important;',
      '  overflow-y: auto !important;',
      '  overflow-x: hidden !important;',
      '  overscroll-behavior: contain !important;',
      '  scrollbar-gutter: stable !important;',
      '  border-radius: 0 0 19px 19px !important;',
      '  border: 1px solid rgba(225,184,89,.58) !important;',
      '  border-top-color: rgba(225,184,89,.82) !important;',
      '  background:',
      '    linear-gradient(180deg, rgba(49,38,22,.985), rgba(14,14,19,.985) 42%, rgba(4,5,9,.985)),',
      '    radial-gradient(circle at 18% -4%, rgba(198,34,27,.28), transparent 34%),',
      '    radial-gradient(circle at 85% 8%, rgba(240,193,83,.20), transparent 32%) !important;',
      '  background-blend-mode: normal, screen, screen !important;',
      '  color: rgba(255,245,218,.98) !important;',
      '  -webkit-text-fill-color: rgba(255,245,218,.98) !important;',
      '  box-shadow:',
      '    0 22px 58px rgba(0,0,0,.66),',
      '    0 0 0 1px rgba(255,231,156,.08),',
      '    inset 0 1px 0 rgba(255,255,255,.14),',
      '    inset 0 -22px 38px rgba(0,0,0,.28) !important;',
      '  text-align: center !important;',
      '  z-index: 2147483647 !important;',
      '  transform: translate3d(0,0,0) !important;',
      '  pointer-events: auto !important;',
      '  isolation: isolate !important;',
      '  contain: none !important;',
      '  counter-reset: none !important;',
      '  backdrop-filter: blur(10px) saturate(1.14) !important;',
      '  -webkit-backdrop-filter: blur(10px) saturate(1.14) !important;',
      '}',
      '#searchResults.' + PANEL_CLASS + ':empty,',
      '#searchResults.search-results.' + PANEL_CLASS + ':empty{',
      '  display: none !important;',
      '  padding: 0 !important;',
      '  border-width: 0 !important;',
      '}',
      '#searchResults.' + PANEL_CLASS + '::before,',
      '#searchResults.search-results.' + PANEL_CLASS + '::before,',
      '#searchResults#searchResults.' + PANEL_CLASS + '::before{',
      '  content: "" !important;',
      '  display: block !important;',
      '  height: 3px !important;',
      '  margin: -1px 10px 8px !important;',
      '  border-radius: 999px !important;',
      '  background: linear-gradient(90deg, transparent, rgba(196,34,28,.86) 18%, rgba(241,200,105,.96) 52%, rgba(196,34,28,.64) 82%, transparent) !important;',
      '  box-shadow: 0 0 16px rgba(230,184,82,.24) !important;',
      '}',
      '#searchResults.' + PANEL_CLASS + '::after,',
      '#searchResults.search-results.' + PANEL_CLASS + '::after,',
      '#searchResults#searchResults.' + PANEL_CLASS + '::after{',
      '  content: "" !important;',
      '  position: absolute !important;',
      '  left: 16px !important;',
      '  right: 16px !important;',
      '  top: -6px !important;',
      '  height: 8px !important;',
      '  border-radius: 999px !important;',
      '  background: linear-gradient(90deg, rgba(160,24,20,.12), rgba(245,203,106,.38), rgba(160,24,20,.12)) !important;',
      '  filter: blur(.2px) !important;',
      '  pointer-events: none !important;',
      '  z-index: -1 !important;',
      '}',
      '#searchResults.' + PANEL_CLASS + ' a,',
      '#searchResults.search-results.' + PANEL_CLASS + ' a,',
      '#searchResults#searchResults.' + PANEL_CLASS + ' a{',
      '  position: relative !important;',
      '  display: flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  width: 100% !important;',
      '  min-height: 41px !important;',
      '  margin: 6px 0 !important;',
      '  padding: 10px 16px !important;',
      '  box-sizing: border-box !important;',
      '  border-radius: 14px !important;',
      '  border: 1px solid rgba(223,184,91,.24) !important;',
      '  background:',
      '    linear-gradient(180deg, rgba(255,255,255,.090), rgba(255,255,255,.030) 45%, rgba(0,0,0,.20)),',
      '    linear-gradient(90deg, rgba(170,30,24,.13), rgba(255,211,111,.055) 48%, rgba(170,30,24,.08)) !important;',
      '  color: rgba(255,247,225,.98) !important;',
      '  -webkit-text-fill-color: rgba(255,247,225,.98) !important;',
      '  font-weight: 900 !important;',
      '  font-size: 14px !important;',
      '  line-height: 1.36 !important;',
      '  text-align: center !important;',
      '  text-decoration: none !important;',
      '  text-shadow: 0 1px 2px rgba(0,0,0,.74) !important;',
      '  white-space: normal !important;',
      '  overflow-wrap: anywhere !important;',
      '  transform: translateZ(0) !important;',
      '  box-shadow: inset 0 1px 0 rgba(255,255,255,.09), 0 7px 14px rgba(0,0,0,.15) !important;',
      '  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease, transform .15s ease, color .15s ease !important;',
      '}',
      '#searchResults.' + PANEL_CLASS + ' a::before,',
      '#searchResults.search-results.' + PANEL_CLASS + ' a::before,',
      '#searchResults#searchResults.' + PANEL_CLASS + ' a::before{',
      '  content: none !important;',
      '  display: none !important;',
      '  counter-increment: none !important;',
      '}',
      '#searchResults.' + PANEL_CLASS + ' a::after,',
      '#searchResults.search-results.' + PANEL_CLASS + ' a::after,',
      '#searchResults#searchResults.' + PANEL_CLASS + ' a::after{',
      '  content: "" !important;',
      '  position: absolute !important;',
      '  inset: 1px !important;',
      '  border-radius: 13px !important;',
      '  border-top: 1px solid rgba(255,255,255,.105) !important;',
      '  pointer-events: none !important;',
      '}',
      '#searchResults.' + PANEL_CLASS + ' a:hover,',
      '#searchResults.' + PANEL_CLASS + ' a:focus,',
      '#searchResults.search-results.' + PANEL_CLASS + ' a:hover,',
      '#searchResults.search-results.' + PANEL_CLASS + ' a:focus,',
      '#searchResults#searchResults.' + PANEL_CLASS + ' a:hover,',
      '#searchResults#searchResults.' + PANEL_CLASS + ' a:focus{',
      '  outline: none !important;',
      '  padding: 10px 16px !important;',
      '  color: #fff8df !important;',
      '  -webkit-text-fill-color: #fff8df !important;',
      '  border-color: rgba(255,219,132,.74) !important;',
      '  background:',
      '    linear-gradient(180deg, rgba(128,27,21,.88), rgba(52,12,10,.90)),',
      '    linear-gradient(90deg, rgba(255,211,104,.18), transparent 58%, rgba(255,211,104,.08)) !important;',
      '  box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 11px 24px rgba(0,0,0,.28), 0 0 0 1px rgba(255,217,132,.08) !important;',
      '  transform: translateY(-1px) translateZ(0) !important;',
      '}',
      '#searchResults.' + PANEL_CLASS + ' a:active,',
      '#searchResults.search-results.' + PANEL_CLASS + ' a:active{',
      '  transform: translateY(0) translateZ(0) !important;',
      '}',
      '#searchResults.' + PANEL_CLASS + '::-webkit-scrollbar{ width: 8px !important; }',
      '#searchResults.' + PANEL_CLASS + '::-webkit-scrollbar-track{ background: rgba(0,0,0,.22) !important; border-radius: 999px !important; margin: 12px 0 !important; }',
      '#searchResults.' + PANEL_CLASS + '::-webkit-scrollbar-thumb{ background: linear-gradient(180deg, rgba(232,190,88,.86), rgba(137,36,27,.78)) !important; border-radius: 999px !important; border: 2px solid rgba(8,8,12,.92) !important; }',
      '#searchResults.' + PANEL_CLASS + '::-webkit-scrollbar-thumb:hover{ background: linear-gradient(180deg, rgba(255,221,130,.96), rgba(184,45,33,.92)) !important; }'
    ].join('\n');

    (document.head || document.documentElement).appendChild(style);
  }

  function setImportant(el, prop, value) {
    if (!el) return;
    try { el.style.setProperty(prop, value, 'important'); } catch (_) {}
  }

  function hasVisibleResults(results) {
    if (!results) return false;
    var text = (results.textContent || '').replace(/\s+/g, '').trim();
    return !!text && results.children && results.children.length > 0;
  }

  function setOpenState(container, results) {
    var isOpen = hasVisibleResults(results);
    if (container && container.classList) {
      container.classList.toggle(OPEN_CLASS, isOpen);
      container.classList.add(CONTAINER_CLASS);
    }
    if (results && results.classList) results.classList.add(PANEL_CLASS);
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

    lastContainer = container;
    lastResults = results;

    setImportant(container, 'position', 'relative');
    setImportant(container, 'overflow', 'visible');
    setImportant(container, 'z-index', '2147483002');
    setOpenState(container, results);

    var inputRect = input.getBoundingClientRect();
    var containerRect = container.getBoundingClientRect();
    var viewportW = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0, 320);
    var viewportH = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0, 320);

    if (!inputRect.width || !containerRect.width) return;

    var gap = 8;
    var desiredWidth = Math.min(Math.max(inputRect.width, 320), 460, viewportW - (gap * 2));
    desiredWidth = Math.max(270, Math.round(desiredWidth));

    var left = Math.round(inputRect.left - containerRect.left + ((inputRect.width - desiredWidth) / 2));
    var panelViewportLeft = Math.round(containerRect.left + left);
    var panelViewportRight = panelViewportLeft + desiredWidth;

    if (panelViewportLeft < gap) left += gap - panelViewportLeft;
    if (panelViewportRight > viewportW - gap) left -= panelViewportRight - (viewportW - gap);

    var topInViewport = Math.round(inputRect.bottom + 5);
    var maxHeight = Math.max(160, Math.min(355, viewportH - topInViewport - 12));

    results.style.setProperty('--ua07-search-left', Math.round(left) + 'px');
    results.style.setProperty('--ua07-search-width', desiredWidth + 'px');
    results.style.setProperty('--ua07-search-max-height', Math.round(maxHeight) + 'px');
  }

  function scheduleAlign() {
    if (raf) return;
    raf = window.requestAnimationFrame ? window.requestAnimationFrame(alignNow) : setTimeout(alignNow, 0);
  }

  function scheduleAgingAlign() {
    scheduleAlign();
    setTimeout(scheduleAlign, 30);
    setTimeout(scheduleAlign, 90);
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
      if (container.classList) container.classList.add(CONTAINER_CLASS);
    }
    if (results && results.classList) results.classList.add(PANEL_CLASS);
    setOpenState(container, results);

    if (!input || bound) {
      scheduleAlign();
      return;
    }

    bound = true;

    ['input', 'focus', 'click', 'keyup', 'change', 'paste'].forEach(function (eventName) {
      input.addEventListener(eventName, scheduleAgingAlign, { passive: true });
    });

    if (results) {
      results.addEventListener('click', scheduleAlign, { passive: true });
    }

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

  // Expose a tiny manual refresh hook for future internal use, without doing background loops.
  window.ua07RefreshSearchResultsOverlay = scheduleAlign;
}());
