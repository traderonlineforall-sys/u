/*
 * SR Tool performance guard.
 * Safe scope: no SR URL logic, no urgent voice logic, no DOM IDs renamed.
 * - Keeps OCR/Tesseract fully on-demand instead of downloading/parsing it on every page load.
 * - Applies a visual-only lite mode on weak devices to reduce animation/GPU pressure.
 */
(function(){
  if (window.__SR_PERFORMANCE_LITE_GUARD_V1) return;
  window.__SR_PERFORMANCE_LITE_GUARD_V1 = true;

  var TESSERACT_SRC = 'https://unpkg.com/tesseract.js@5.0.5/dist/tesseract.min.js';
  var tesseractLoadPromise = null;

  function realTesseractReady(){
    return !!(window.Tesseract && !window.Tesseract.__srLazyShim && typeof window.Tesseract.createWorker === 'function');
  }

  function loadTesseract(){
    if (realTesseractReady()) return Promise.resolve(window.Tesseract);
    if (!tesseractLoadPromise) {
      tesseractLoadPromise = new Promise(function(resolve, reject){
        try {
          var existing = document.querySelector('script[data-sr-tesseract-loader="1"],script[src*="tesseract.min.js"]');
          if (existing && !existing.dataset.srTesseractLoader) {
            existing.addEventListener('load', function(){
              realTesseractReady() ? resolve(window.Tesseract) : reject(new Error('Tesseract loaded but unavailable'));
            }, { once: true });
            existing.addEventListener('error', function(){ reject(new Error('Tesseract load failed')); }, { once: true });
            return;
          }

          var script = existing || document.createElement('script');
          script.src = TESSERACT_SRC;
          script.async = true;
          script.dataset.srTesseractLoader = '1';
          script.onload = function(){
            realTesseractReady() ? resolve(window.Tesseract) : reject(new Error('Tesseract loaded but unavailable'));
          };
          script.onerror = function(){ reject(new Error('Tesseract load failed')); };
          if (!existing) document.head.appendChild(script);
        } catch (err) {
          reject(err);
        }
      });
    }
    return tesseractLoadPromise;
  }

  if (!realTesseractReady()) {
    window.Tesseract = {
      __srLazyShim: true,
      createWorker: function(){
        var args = arguments;
        return loadTesseract().then(function(T){ return T.createWorker.apply(T, args); });
      },
      recognize: function(){
        var args = arguments;
        return loadTesseract().then(function(T){ return T.recognize.apply(T, args); });
      }
    };
  }
  window.__SR_LOAD_TESSERACT_ON_DEMAND = loadTesseract;

  function isWeakDevice(){
    var mem = Number(navigator.deviceMemory || 0);
    var cores = Number(navigator.hardwareConcurrency || 0);
    return (mem && mem <= 4) || (cores && cores <= 4);
  }

  function applyLiteDeviceMode(){
    if (!isWeakDevice()) return;
    document.documentElement.classList.add('sr-lite-device');
    if (document.getElementById('sr-lite-device-style')) return;
    var style = document.createElement('style');
    style.id = 'sr-lite-device-style';
    style.textContent = [
      'html.sr-lite-device *{scroll-behavior:auto!important}',
      'html.sr-lite-device .moon,html.sr-lite-device .star,html.sr-lite-device #EID_DECOR_LAYER,html.sr-lite-device #EID_DECOR_LAYER *{animation:none!important;transition:none!important}',
      'html.sr-lite-device .toolsStyle,html.sr-lite-device .tablinks,html.sr-lite-device .dropbtn{transition:none!important}',
      'html.sr-lite-device .dropdown-content,html.sr-lite-device .sub-dropdown-content{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function tuneImages(){
    try {
      var imgs = document.images || [];
      for (var i = 0; i < imgs.length; i++) {
        if (!imgs[i].hasAttribute('decoding')) imgs[i].setAttribute('decoding', 'async');
        if (i > 0 && !imgs[i].hasAttribute('loading')) imgs[i].setAttribute('loading', 'lazy');
      }
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ applyLiteDeviceMode(); tuneImages(); }, { once: true });
  } else {
    applyLiteDeviceMode();
    tuneImages();
  }
})();
