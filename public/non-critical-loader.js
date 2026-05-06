(function(){
  function safeImport(src){
    return import(src).catch(function(){});
  }

  function loadLayoutFixes(){
    if (loadLayoutFixes._done) return;
    loadLayoutFixes._done = true;
    safeImport('./layout-stabilizer.js');
  }

  function loadUiModules(){
    if (loadUiModules._done) return;
    loadUiModules._done = true;
    [
      './support-chat.js?v=support-visible-20260426',
      './admin.js'
    ].forEach(function(src){
      safeImport(src);
    });
  }

  function loadExtras(){
    if (loadExtras._done) return;
    loadExtras._done = true;
    [
      './online-users-count.js',
      './eid-hud.js',
      './urgent-voice-auto-activation.js?v=20260507-private-audio'
    ].forEach(function(src){
      safeImport(src);
    });
  }

  function scheduleUiModules(){
    if (scheduleUiModules._armed) return;
    scheduleUiModules._armed = true;

    var eagerKick = setTimeout(loadUiModules, 700);

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(function(){
        clearTimeout(eagerKick);
        loadUiModules();
      }, { timeout: 1800 });
    }
  }

  function scheduleExtras(){
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(loadExtras, { timeout: 2200 });
    } else {
      setTimeout(loadExtras, 1100);
    }
  }

  if (document.readyState === 'complete') {
    loadLayoutFixes();
    scheduleUiModules();
    scheduleExtras();
  } else {
    window.addEventListener('load', function(){
      loadLayoutFixes();
      scheduleUiModules();
      scheduleExtras();
    }, { once: true });
  }
})();
