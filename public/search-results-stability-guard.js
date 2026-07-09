(function () {
  'use strict';

  /*
   * Search input safety hotfix.
   * Previous guard was too aggressive: it listened in capture phase, moved the
   * results node, forced focus/click routing, and observed mutations. On some
   * browsers this could block typing in #searchInput or make the page feel hung.
   *
   * The real filtering is now handled inside app.js while building results.
   * This file intentionally does not intercept keyboard, pointer, input, focus,
   * click, or mutation events.
   */

  function stripLegacyResultTitles() {
    var results = document.getElementById('searchResults');
    if (!results) return;
    var links = results.querySelectorAll('a[title]');
    for (var i = 0; i < links.length; i += 1) {
      try { links[i].removeAttribute('title'); } catch (_) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', stripLegacyResultTitles, { once: true });
  } else {
    stripLegacyResultTitles();
  }
}());
