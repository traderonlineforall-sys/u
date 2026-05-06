(function(){
  'use strict';

  var TARGETS = [
    { key: 'logo', ids: ['MNDO_UA07_LOGO3', 'MNDO_UA07_LOGO'] },
    { key: 'cluster', ids: ['UA07_SECRET_ENVELOPE_WRAP'] },
    { key: 'hk', ids: ['hkSmartFloatingLine'] }
  ];

  var locks = new Map();
  var relockTimer = 0;
  var initTimer = 0;
  var styleId = 'TOP_UI_LOCK_STYLE';

  function ensureStyle(){
    if(document.getElementById(styleId)) return;
    var s = document.createElement('style');
    s.id = styleId;
    s.textContent = [
      'body.top-ui-lock-ready #MNDO_UA07_LOGO3,',
      'body.top-ui-lock-ready #MNDO_UA07_LOGO,',
      'body.top-ui-lock-ready #UA07_SECRET_ENVELOPE_WRAP,',
      'body.top-ui-lock-ready #hkSmartFloatingLine{',
      '  margin:0 !important;',
      '  right:auto !important;',
      '  bottom:auto !important;',
      '  animation-play-state:running;',
      '}',
      'body.top-ui-lock-ready #MNDO_UA07_LOGO3,',
      'body.top-ui-lock-ready #MNDO_UA07_LOGO{',
      '  pointer-events:auto !important;',
      '}',
      'body.top-ui-lock-ready #hkSmartFloatingLine{',
      '  max-width:none !important;',
      '}',
      'body.top-ui-lock-ready #UA07_SECRET_ENVELOPE_WRAP{',
      '  justify-content:center !important;',
      '  align-items:center !important;',
      '  contain:layout style paint;',
      '}',
      'body.top-ui-lock-ready #UA07_ONLINE_COUNT,',
      'body.top-ui-lock-ready .eid-toggle-btn,',
      'body.top-ui-lock-ready .ramadan-toggle-btn,',
      'body.top-ui-lock-ready #UA07_SECRET_ENVELOPE,',
      'body.top-ui-lock-ready #UA07_UPDATE_ICON{',
      '  flex:0 0 auto !important;',
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  function byIds(ids){
    for(var i=0;i<ids.length;i++){
      var el = document.getElementById(ids[i]);
      if(el) return el;
    }
    return null;
  }

  function nearly(a,b){
    return Math.abs(a-b) <= 1.5;
  }

  function readRect(el){
    if(!el || !el.getBoundingClientRect) return null;
    var r = el.getBoundingClientRect();
    if(!r || (!r.width && !r.height)) return null;
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height
    };
  }

  function preserveComputedZ(el){
    try{
      var z = window.getComputedStyle(el).zIndex;
      return z && z !== 'auto' ? z : '9000';
    }catch(_){ return '9000'; }
  }

  function applySnapshot(el, snap){
    if(!el || !snap) return;
    el.dataset.topUiLocked = '1';
    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('left', Math.round(snap.left) + 'px', 'important');
    el.style.setProperty('top', Math.round(snap.top) + 'px', 'important');
    el.style.setProperty('width', Math.round(snap.width) + 'px', 'important');
    if(snap.height > 0){
      el.style.setProperty('height', Math.round(snap.height) + 'px', 'important');
    }
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('bottom', 'auto', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('z-index', String(snap.zIndex || '9000'), 'important');
    el.style.setProperty('contain', 'layout style paint', 'important');
    if(snap.key === 'logo'){
      el.style.setProperty('overflow', 'visible', 'important');
    }
    if(snap.key === 'hk'){
      el.style.setProperty('left', Math.round(snap.left + (snap.width / 2)) + 'px', 'important');
      el.style.setProperty('transform', 'translateX(-50%)', 'important');
      el.style.setProperty('width', Math.round(snap.width) + 'px', 'important');
    }
  }

  function storeAndApply(key, el){
    var rect = readRect(el);
    if(!rect) return false;
    var snap = {
      key: key,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      zIndex: preserveComputedZ(el)
    };
    var prev = locks.get(key);
    if(prev && nearly(prev.left, snap.left) && nearly(prev.top, snap.top) && nearly(prev.width, snap.width) && nearly(prev.height, snap.height)){
      snap = prev;
    }
    locks.set(key, snap);
    applySnapshot(el, snap);
    return true;
  }

  function relockExisting(){
    var changed = false;
    TARGETS.forEach(function(t){
      var el = byIds(t.ids);
      var snap = locks.get(t.key);
      if(!el || !snap) return;
      applySnapshot(el, snap);
      changed = true;
    });
    if(changed){
      try{ document.body.classList.add('top-ui-lock-ready'); }catch(_){}
    }
  }

  function scheduleRelock(delay){
    clearTimeout(relockTimer);
    relockTimer = setTimeout(function(){
      relockExisting();
    }, typeof delay === 'number' ? delay : 60);
  }

  function lockNow(){
    ensureStyle();
    var readyCount = 0;
    TARGETS.forEach(function(t){
      var el = byIds(t.ids);
      if(!el) return;
      if(storeAndApply(t.key, el)) readyCount += 1;
    });
    if(readyCount >= 2){
      try{ document.body.classList.add('top-ui-lock-ready'); }catch(_){}
      relockExisting();
      return true;
    }
    return false;
  }

  function settleAndLock(){
    var tries = 0;
    var stableHits = 0;
    var last = '';
    clearInterval(initTimer);
    initTimer = setInterval(function(){
      tries += 1;
      var parts = [];
      TARGETS.forEach(function(t){
        var el = byIds(t.ids);
        var r = readRect(el);
        parts.push(t.key + ':' + (r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') : 'x'));
      });
      var sig = parts.join('|');
      if(sig === last) stableHits += 1; else stableHits = 0;
      last = sig;
      if((stableHits >= 2 && lockNow()) || tries > 40){
        clearInterval(initTimer);
        lockNow();
      }
    }, 180);
  }

  function bindObservers(){
    if(typeof MutationObserver !== 'undefined'){
      var mo = new MutationObserver(function(muts){
        for(var i=0;i<muts.length;i++){
          var m = muts[i];
          if(m.type === 'attributes'){
            var id = m.target && m.target.id;
            if(id === 'MNDO_UA07_LOGO3' || id === 'MNDO_UA07_LOGO' || id === 'UA07_SECRET_ENVELOPE_WRAP' || id === 'hkSmartFloatingLine'){
              scheduleRelock(0);
              return;
            }
          }
          if(m.type === 'childList'){
            scheduleRelock(30);
            return;
          }
        }
      });
      try{
        mo.observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:['style','class'] });
      }catch(_){ }
    }

    ['input','keyup','change','click','pointerup','mouseup'].forEach(function(ev){
      document.addEventListener(ev, function(){ scheduleRelock(10); }, true);
    });

    window.addEventListener('resize', function(){
      clearTimeout(relockTimer);
      setTimeout(function(){ locks.clear(); settleAndLock(); }, 120);
    }, { passive:true });

    window.addEventListener('orientationchange', function(){
      locks.clear();
      settleAndLock();
    }, { passive:true });

    window.addEventListener('pageshow', function(){ scheduleRelock(30); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) scheduleRelock(30); });
  }

  function init(){
    settleAndLock();
    bindObservers();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once:true });
  }else{
    init();
  }
  window.addEventListener('load', function(){ scheduleRelock(20); }, { once:true });
})();
