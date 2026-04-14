(function(){
  function safeImport(src){
    return import(src).catch(function(){});
  }

  function loadLayoutFixes(){
    if (loadLayoutFixes._done) return;
    loadLayoutFixes._done = true;
    safeImport('./layout-stabilizer.js');
  }

  function loadExtras(){
    if (loadExtras._done) return;
    loadExtras._done = true;
    [
      './online-users-count.js',
      './eid-hud.js'
    ].forEach(function(src){
      safeImport(src);
    });
  }

  function scheduleExtras(){
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(loadExtras, { timeout: 1800 });
    } else {
      setTimeout(loadExtras, 900);
    }
  }

  if (document.readyState === 'complete') {
    loadLayoutFixes();
    scheduleExtras();
  } else {
    window.addEventListener('load', function(){
      loadLayoutFixes();
      scheduleExtras();
    }, { once: true });
  }
})();
