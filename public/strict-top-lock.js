(function(){
  "use strict";
  if (window.__strictTopLockLoaded) return;
  window.__strictTopLockLoaded = true;

  var root = document.documentElement;

  function injectStyle(){
    if (document.getElementById('strict-top-lock-style')) return;
    var s = document.createElement('style');
    s.id = 'strict-top-lock-style';
    s.textContent = [
      '#MNDO_UA07_LOGO3.ua07-strict-locked, #UA07_LUX_LOGO_BETWEEN.ua07-strict-locked{position:absolute !important; left:var(--ua07-lock-left, auto) !important; top:var(--ua07-lock-top, auto) !important; right:auto !important; bottom:auto !important; margin:0 !important; transform:translateZ(0) !important;}',
      '#hkSmartFloatingLine.hk-strict-locked{position:absolute !important; left:var(--hk-lock-left, 50%) !important; top:var(--hk-lock-top, auto) !important; width:var(--hk-lock-width, auto) !important; right:auto !important; bottom:auto !important; margin:0 !important; transform:translateX(-50%) !important;}',
      '#UA07_SECRET_ENVELOPE_WRAP{pointer-events:auto;}'
    ].join('');
    document.head.appendChild(s);
  }

  function pageX(){ return window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0; }
  function pageY(){ return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0; }

  function findLogo(){
    return document.getElementById('MNDO_UA07_LOGO3') || document.getElementById('UA07_LUX_LOGO_BETWEEN');
  }

  function findSearch(){
    return document.getElementById('searchInput')
      || document.querySelector('input.search-input')
      || document.querySelector('.search-container input')
      || document.querySelector("input[type='search']")
      || document.querySelector("input[id*='search' i], input[class*='search' i]");
  }

  function captureLogoCurrent(logo){
    if(!logo || typeof logo.getBoundingClientRect !== 'function') return null;
    var r = logo.getBoundingClientRect();
    if(!r || r.width < 20 || r.height < 20) return null;
    return { left: Math.round(pageX() + r.left), top: Math.round(pageY() + r.top) };
  }

  function computeLogoFallback(logo){
    var s = findSearch();
    if(!logo || !s || typeof s.getBoundingClientRect !== 'function') return null;
    var sr = s.getBoundingClientRect();
    if(!sr || sr.width < 10 || sr.height < 10) return null;
    var left = Math.round(pageX() + sr.left - logo.offsetWidth - 12);
    var top = Math.round(pageY() + sr.top + ((sr.height - logo.offsetHeight) / 2) - 1);
    if(top < 6) top = 6;
    return { left:left, top:top };
  }

  function lockLogo(){
    var logo = findLogo();
    if(!logo) return false;
    injectStyle();
    var pos = captureLogoCurrent(logo) || computeLogoFallback(logo);
    if(!pos) return false;
    root.style.setProperty('--ua07-lock-left', pos.left + 'px');
    root.style.setProperty('--ua07-lock-top', pos.top + 'px');
    logo.classList.add('ua07-strict-locked');
    return true;
  }

  function computeHkFallback(){
    var s = findSearch();
    if(!s || typeof s.getBoundingClientRect !== 'function') return null;
    var sr = s.getBoundingClientRect();
    if(!sr || sr.width < 10 || sr.height < 10) return null;
    var viewportCap = Math.max(280, (window.innerWidth || document.documentElement.clientWidth || 320) - 24);
    return {
      left: Math.round(pageX() + sr.left + (sr.width / 2)),
      top: Math.round(pageY() + sr.bottom + 10),
      width: Math.min(Math.max(sr.width, 320), 560, viewportCap)
    };
  }

  function captureHkCurrent(line){
    if(!line || typeof line.getBoundingClientRect !== 'function') return null;
    var r = line.getBoundingClientRect();
    if(!r || r.width < 10 || r.height < 10) return null;
    return {
      left: Math.round(pageX() + r.left + (r.width / 2)),
      top: Math.round(pageY() + r.top),
      width: Math.round(r.width)
    };
  }

  function lockHk(){
    var line = document.getElementById('hkSmartFloatingLine');
    if(!line) return false;
    injectStyle();
    var pos = captureHkCurrent(line) || computeHkFallback();
    if(!pos) return false;
    root.style.setProperty('--hk-lock-left', pos.left + 'px');
    root.style.setProperty('--hk-lock-top', pos.top + 'px');
    root.style.setProperty('--hk-lock-width', pos.width + 'px');
    line.classList.add('hk-strict-locked');
    return true;
  }

  function runLock(){
    lockLogo();
    lockHk();
  }

  function after(ms){ setTimeout(runLock, ms); }

  function bindResetRefresh(){
    ['reset1','headerResetBtn'].forEach(function(id){
      var btn = document.getElementById(id);
      if(!btn || btn.dataset.strictTopLockBound === '1') return;
      btn.dataset.strictTopLockBound = '1';
      btn.addEventListener('click', function(){
        after(120);
        after(420);
        after(900);
      }, true);
    });
  }

  function observe(){
    if(typeof MutationObserver === 'undefined') return;
    var obs = new MutationObserver(function(){
      bindResetRefresh();
      runLock();
    });
    try{
      obs.observe(document.documentElement, { childList:true, subtree:true });
      setTimeout(function(){ try{obs.disconnect();}catch(e){} }, 5000);
    }catch(e){}
  }

  function boot(){
    injectStyle();
    runLock();
    bindResetRefresh();
    after(120);
    after(350);
    after(900);
    after(1600);
    after(2600);
    observe();
    window.addEventListener('load', function(){ after(80); after(500); after(1400); }, { once:true });
    window.addEventListener('pageshow', function(){ after(80); after(400); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) after(120); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
