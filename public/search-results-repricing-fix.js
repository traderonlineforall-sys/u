(function(){
  'use strict';

  function normText(value){
    return String(value || '')
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normHref(value){
    try { return new URL(String(value || '').trim(), window.location.href).href; }
    catch (_) { return String(value || '').trim(); }
  }

  function getSourceLinks(){
    return Array.prototype.slice.call(document.querySelectorAll('.dropdown-content a, .sub-dropdown-content a, a#singlelink'))
      .filter(function(link){ return link && !link.classList.contains('no-search') && link.href; });
  }

  function findOriginalLink(resultLink){
    var wantedHref = normHref(resultLink.getAttribute('href') || resultLink.href || '');
    var wantedText = normText(resultLink.textContent);
    var links = getSourceLinks();
    var hrefMatches = links.filter(function(link){ return normHref(link.href) === wantedHref; });
    if (!hrefMatches.length) return null;
    return hrefMatches.find(function(link){ return normText(link.textContent) === wantedText; }) || hrefMatches[0];
  }

  function makeEventFor(link){
    return {
      target: link,
      currentTarget: link,
      preventDefault: function(){},
      stopPropagation: function(){},
      stopImmediatePropagation: function(){}
    };
  }

  function adslNumber(){
    var el = document.getElementById('arabicNumber');
    return el ? String(el.value || '').trim() : '';
  }

  function fbbNumber(){
    var fbb = document.getElementById('arabiccNumber');
    var value = fbb ? String(fbb.value || '').trim() : '';
    if (!value) {
      var adsl = adslNumber().replace(/\D/g, '');
      if (adsl) value = 'FBB' + adsl;
    }
    return value;
  }

  function fallbackOpenLink(link){
    var url = String(link.href || '');
    var value = fbbNumber();
    if (url.indexOf('srTypeId=102040017') !== -1 ||
        url.indexOf('srTypeId=103010007') !== -1 ||
        url.indexOf('srTypeId=103010008') !== -1 ||
        url.indexOf('srTypeId=102002061') !== -1 ||
        url.indexOf('srTypeId=103038004') !== -1) {
      url = url.replace(/([?&]subsNumber=)[^&]*/i, '$1' + encodeURIComponent(value));
      value = '';
    }
    if (url.indexOf('srTypeId=100034005') !== -1) {
      url = url.replace(/([?&]subsNumber=)FBB(&BMEWebToken=)/, '$1' + encodeURIComponent(value) + '$2');
    }
    if (url.indexOf('srTypeId=102094003') !== -1) {
      url = url.replace(/([?&]subsNumber=)(&BMEWebToken=)/, '$1' + encodeURIComponent(value) + '$2');
      value = '';
    }
    if (url.indexOf('srTypeId=100047001') !== -1) {
      url = url.replace(/([?&]serviceContent=)[^&]*/i, '$1' + encodeURIComponent('FBB Num (' + adslNumber() + ') Accepted (3) GB for (2) days related tts - outage - ir  id (xxx) on mobile (xxx) '));
    }
    if (url.indexOf('srTypeId=100047021') !== -1) {
      url = url.replace(/([?&]serviceContent=)[^&]*/i, '$1' + encodeURIComponent('FBB Num (' + adslNumber() + ') Accepted (3) GB for (5) days related Zero SELT tts  id (xxx) on mobile (xxx) '));
    }
    window.open(url + value);
  }

  function fallbackOpenLinkk(link){
    var url = String(link.href || '');
    var value = encodeURIComponent(adslNumber());
    if (/([?&]subsNumber=)222\b/.test(url)) {
      url = url.replace(/([?&]subsNumber=)222\b/, '$1' + value);
    } else if (/([?&]subsNumber=)$/.test(url)) {
      url += value;
    } else if (!/[?&]subsNumber=/.test(url)) {
      url += (url.indexOf('?') === -1 ? '?' : '&') + 'subsNumber=' + value;
    }
    window.open(url, '_blank');
  }

  function openOriginal(link){
    if (!link) return false;
    var handler = String(link.getAttribute('onclick') || '').toLowerCase();
    if (handler.indexOf('openlinkk') !== -1) {
      if (typeof window.openLinkk === 'function') window.openLinkk(makeEventFor(link));
      else fallbackOpenLinkk(link);
      return true;
    }
    if (handler.indexOf('openlink') !== -1) {
      if (typeof window.openLink === 'function') window.openLink(makeEventFor(link));
      else fallbackOpenLink(link);
      return true;
    }
    window.open(link.href, link.getAttribute('target') || '_blank');
    return true;
  }

  function applySearchLayerCss(){
    if (document.getElementById('sr-search-results-repricing-fix-css')) return;
    var style = document.createElement('style');
    style.id = 'sr-search-results-repricing-fix-css';
    style.textContent = [
      '.mndo-search-logo-row{position:relative!important;overflow:visible!important;z-index:2147483600!important;}',
      '.mndo-search-hk-anchor{position:relative!important;overflow:visible!important;z-index:2147483601!important;}',
      '.search-container{position:relative!important;overflow:visible!important;z-index:2147483602!important;}',
      '#searchResults.search-results,#searchResults{position:absolute!important;top:calc(100% + 6px)!important;left:0!important;right:auto!important;width:100%!important;min-width:100%!important;max-width:100%!important;max-height:min(500px,calc(100vh - 90px))!important;overflow-y:auto!important;z-index:2147483647!important;pointer-events:auto!important;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function bindSearchResultClicks(){
    if (bindSearchResultClicks._done) return;
    bindSearchResultClicks._done = true;
    document.addEventListener('click', function(event){
      var result = event.target && event.target.closest ? event.target.closest('#searchResults a') : null;
      if (!result) return;
      var original = findOriginalLink(result);
      if (!original) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      openOriginal(original);
    }, true);
  }

  function boot(){
    applySearchLayerCss();
    bindSearchResultClicks();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
