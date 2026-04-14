(function(){
  "use strict";

  var LOGO_SELECTOR = "#MNDO_UA07_LOGO3";
  var HK_SELECTOR = "#hkSmartFloatingLine";
  var SAMPLE_INTERVAL = 180;
  var STABLE_SAMPLES = 3;
  var EPS = 1.2;
  var MAX_BOOT_WAIT = 10000;

  var state = {
    logo: { baseline: null, observer: null, last: null, stable: 0 },
    hk:   { baseline: null, observer: null, last: null, stable: 0 }
  };

  function now(){ return Date.now ? Date.now() : new Date().getTime(); }

  function round(n){ return Math.round(Number(n) || 0); }

  function isVisible(el){
    if(!el) return false;
    var cs = getComputedStyle(el);
    if(cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return !!(r.width > 0 && r.height > 0);
  }

  function getPageBox(el){
    if(!isVisible(el)) return null;
    var r = el.getBoundingClientRect();
    return {
      top: r.top + (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0),
      left: r.left + (window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0),
      width: r.width,
      height: r.height
    };
  }

  function closeEnough(a, b){
    if(!a || !b) return false;
    return Math.abs(a.top - b.top) <= EPS &&
           Math.abs(a.left - b.left) <= EPS &&
           Math.abs(a.width - b.width) <= EPS &&
           Math.abs(a.height - b.height) <= EPS;
  }

  function forceLogoBaseline(el, box){
    if(!el || !box) return;
    el.style.setProperty('position', 'absolute', 'important');
    el.style.setProperty('top', round(box.top) + 'px', 'important');
    el.style.setProperty('left', round(box.left) + 'px', 'important');
    el.style.setProperty('width', round(box.width) + 'px', 'important');
    el.style.setProperty('height', round(box.height) + 'px', 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('bottom', 'auto', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('transform', 'translateZ(0)', 'important');
    el.setAttribute('data-top-lock-logo', '1');
  }

  function forceHkBaseline(el, box){
    if(!el || !box) return;
    el.style.setProperty('position', 'absolute', 'important');
    el.style.setProperty('top', round(box.top) + 'px', 'important');
    el.style.setProperty('left', round(box.left) + 'px', 'important');
    el.style.setProperty('width', round(box.width) + 'px', 'important');
    el.style.setProperty('max-width', round(box.width) + 'px', 'important');
    el.style.setProperty('min-width', round(box.width) + 'px', 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('bottom', 'auto', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('transform', 'none', 'important');
    el.setAttribute('data-top-lock-hk', '1');
  }

  function observeAndRestore(which, selector, applyBaseline){
    var slot = state[which];
    var el = document.querySelector(selector);
    if(!el) return false;
    if(slot.observer && slot.observer.__boundEl === el) return true;
    if(slot.observer){
      try { slot.observer.disconnect(); } catch(e){}
      slot.observer = null;
    }
    if(typeof MutationObserver === 'undefined') return true;
    var busy = false;
    var obs = new MutationObserver(function(){
      if(busy) return;
      if(!slot.baseline) return;
      busy = true;
      try {
        applyBaseline(el, slot.baseline);
      } catch(e) {}
      busy = false;
    });
    try {
      obs.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
      obs.__boundEl = el;
      slot.observer = obs;
    } catch(e) {}
    return true;
  }

  function captureStable(which, selector, applyBaseline, allowHidden){
    var slot = state[which];
    var start = now();
    function tick(){
      var el = document.querySelector(selector);
      if(!el || (!allowHidden && !isVisible(el))){
        if(now() - start < MAX_BOOT_WAIT){
          setTimeout(tick, SAMPLE_INTERVAL);
        }
        return;
      }
      var box = getPageBox(el);
      if(!box){
        if(now() - start < MAX_BOOT_WAIT){
          setTimeout(tick, SAMPLE_INTERVAL);
        }
        return;
      }

      if(closeEnough(slot.last, box)) slot.stable += 1;
      else slot.stable = 1;
      slot.last = box;

      if(slot.stable >= STABLE_SAMPLES){
        slot.baseline = box;
        applyBaseline(el, box);
        observeAndRestore(which, selector, applyBaseline);
        return;
      }

      if(now() - start < MAX_BOOT_WAIT){
        setTimeout(tick, SAMPLE_INTERVAL);
      } else {
        slot.baseline = box;
        applyBaseline(el, box);
        observeAndRestore(which, selector, applyBaseline);
      }
    }
    tick();
  }

  var recaptureTimer = 0;
  function recaptureAll(delay){
    clearTimeout(recaptureTimer);
    recaptureTimer = setTimeout(function(){
      state.logo.last = null; state.logo.stable = 0;
      state.hk.last = null; state.hk.stable = 0;
      captureStable('logo', LOGO_SELECTOR, forceLogoBaseline, false);
      captureStable('hk', HK_SELECTOR, forceHkBaseline, false);
    }, typeof delay === 'number' ? delay : 0);
  }

  var relockRaf = 0;
  function relockVisibleNow(){
    relockRaf = 0;
    var logo = document.querySelector(LOGO_SELECTOR);
    if(logo && state.logo.baseline) forceLogoBaseline(logo, state.logo.baseline);
    var hk = document.querySelector(HK_SELECTOR);
    if(hk && state.hk.baseline && isVisible(hk)) forceHkBaseline(hk, state.hk.baseline);
  }

  function scheduleRelock(){
    if(relockRaf) return;
    relockRaf = requestAnimationFrame(relockVisibleNow);
  }

  function bindEvents(){
    window.addEventListener('load', function(){
      recaptureAll(1800);
      setTimeout(function(){ recaptureAll(0); }, 3200);
    }, { once: true });

    window.addEventListener('resize', function(){
      scheduleRelock();
    }, { passive: true });

    window.addEventListener('scroll', function(){
      scheduleRelock();
    }, { passive: true });

    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) setTimeout(scheduleRelock, 80);
    });

    window.addEventListener('pageshow', function(){
      setTimeout(function(){ recaptureAll(180); }, 0);
    });

    document.addEventListener('click', function(e){
      var t = e.target;
      if(!t || !t.closest) return;
      if(t.closest('#reset1, #bss_pkg, #mndoQTResetV10, button[type="reset"], input[type="reset"]')){
        setTimeout(function(){ recaptureAll(200); }, 60);
        setTimeout(function(){ recaptureAll(0); }, 700);
      }
    }, true);

    if(typeof MutationObserver !== 'undefined'){
      var bodyObserver = new MutationObserver(function(){
        observeAndRestore('logo', LOGO_SELECTOR, forceLogoBaseline);
        observeAndRestore('hk', HK_SELECTOR, forceHkBaseline);
        var hk = document.querySelector(HK_SELECTOR);
        if(hk && isVisible(hk) && !state.hk.baseline){
          recaptureAll(120);
        }
      });
      try {
        bodyObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
      } catch(e){}
    }
  }

  bindEvents();

  if(document.readyState === 'complete'){
    recaptureAll(1800);
    setTimeout(function(){ recaptureAll(0); }, 3200);
  } else if(document.readyState === 'interactive'){
    recaptureAll(2200);
  } else {
    document.addEventListener('DOMContentLoaded', function(){
      recaptureAll(2200);
    }, { once: true });
  }
})();
