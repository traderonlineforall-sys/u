(function () {
  'use strict';

  var SEARCH_INPUT_ID = 'searchInput';
  var SEARCH_RESULTS_ID = 'searchResults';
  var restoreUntil = 0;
  var restoreTimers = [];

  function getSearchParts() {
    return {
      input: document.getElementById(SEARCH_INPUT_ID),
      results: document.getElementById(SEARCH_RESULTS_ID)
    };
  }

  function hasSearchResults(results) {
    return !!(results && results.childNodes && results.childNodes.length > 0);
  }

  function hasSearchText(input) {
    return !!(input && String(input.value || '').trim() !== '');
  }

  function restoreResultsVisibility() {
    var parts = getSearchParts();
    if (!hasSearchText(parts.input) || !hasSearchResults(parts.results)) return;
    parts.results.style.display = 'block';
  }

  function queueRestore() {
    restoreTimers.forEach(function (timer) { clearTimeout(timer); });
    restoreTimers = [];
    [0, 40, 140, 320].forEach(function (delay) {
      restoreTimers.push(setTimeout(restoreResultsVisibility, delay));
    });
  }

  function armSearchResultRestore() {
    restoreUntil = Date.now() + 900;
    queueRestore();
  }

  document.addEventListener('click', function (event) {
    var parts = getSearchParts();
    if (!parts.results) return;

    if (parts.results.contains(event.target)) {
      armSearchResultRestore();
      return;
    }

    if (Date.now() <= restoreUntil) {
      queueRestore();
    }
  }, true);

  document.addEventListener('keydown', function (event) {
    if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
    var parts = getSearchParts();
    if (!parts.results || !parts.results.contains(event.target)) return;
    armSearchResultRestore();
  }, true);
}());
