(function(){
  function safeImport(src){
    return import(src).catch(function(){});
  }

  var imports = Object.create(null);
  function importOnce(key, src){
    if (!imports[key]) imports[key] = safeImport(src);
    return imports[key];
  }

  function onIdle(fn, timeout){
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(fn, { timeout: timeout || 1600 });
    } else {
      setTimeout(fn, Math.min(timeout || 800, 1200));
    }
  }

  function loadLayoutFixes(){
    if (loadLayoutFixes._done) return;
    loadLayoutFixes._done = true;
    [
      './safe-customization-layer.js'
    ].forEach(function(src){
      safeImport(src);
    });
  }

  function loadSupportThenOpen(){
    importOnce('support-chat', './support-chat.js?v=support-visible-20260426').then(function(){
      try {
        if (typeof window.__srOpenSupportChat === 'function') {
          window.__srOpenSupportChat();
        }
      } catch {}
    });
  }

  function bindSupportLauncher(){
    if (bindSupportLauncher._done) return;
    bindSupportLauncher._done = true;

    document.addEventListener('click', function(e){
      var target = e.target && e.target.closest ? e.target.closest('#supportToggleBtn') : null;
      if (!target) return;

      if (window.__srSupportChatReady) return;

      try {
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch {}

      loadSupportThenOpen();
    }, true);
  }

  function isAdminLogoTarget(el){
    if (!el || !el.closest) return false;
    return !!el.closest('#UA07_LUX_LOGO_BETWEEN, #MNDO_UA07_LOGO3, #MNDO_UA07_LOGO, .mndo-uwk07-logo-img');
  }

  function bindAdminLauncher(){
    if (bindAdminLauncher._done) return;
    bindAdminLauncher._done = true;

    var clickCount = 0;
    var timer = null;

    document.addEventListener('click', function(e){
      if (!isAdminLogoTarget(e.target)) return;

      clickCount += 1;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function(){ clickCount = 0; }, 1800);

      if (clickCount >= 5) {
        clickCount = 0;
        try {
          e.preventDefault();
          e.stopImmediatePropagation();
        } catch {}

        importOnce('admin', './admin.js').then(function(){
          try {
            if (typeof window.__srOpenAdminPanel === 'function') {
              window.__srOpenAdminPanel();
            } else {
              window.dispatchEvent(new CustomEvent('sr:open-admin'));
            }
          } catch {}
        });
      }
    }, true);
  }

  function loadExtras(){
    if (loadExtras._done) return;
    loadExtras._done = true;

    // These are non-critical and can consume realtime/browser resources.
    // Keep them delayed so the first tool load stays light.
    [
      './online-users-count.js',
      './eid-hud.js'
    ].forEach(function(src){
      safeImport(src);
    });
  }

  function scheduleExtras(){
    onIdle(loadExtras, 6500);
  }

  function bootAfterWindowLoad(){
    scheduleExtras();
  }

  function boot(){
    // Layout fixes are small and affect perceived stability, so run them as soon as DOM is ready.
    loadLayoutFixes();

    // Heavy/interactive modules are loaded only when needed.
    bindSupportLauncher();
    bindAdminLauncher();

    if (document.readyState === 'complete') {
      bootAfterWindowLoad();
    } else {
      window.addEventListener('load', bootAfterWindowLoad, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
