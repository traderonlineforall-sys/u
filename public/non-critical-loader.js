(function(){
  function loadExtras(){
    if (loadExtras._done) return;
    loadExtras._done = true;
    var mods = [
      './online-users-count.js',
      './eid-hud.js'
    ];
    mods.forEach(function(src){
      import(src).catch(function(){});
    });
  }

  function schedule(){
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(loadExtras, { timeout: 1800 });
    } else {
      setTimeout(loadExtras, 900);
    }
  }

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule, { once: true });
  }
})();
