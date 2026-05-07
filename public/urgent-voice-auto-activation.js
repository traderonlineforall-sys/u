/*
 * Urgent admin voice auto-activation helper.
 * Scope: #SR_URGENT_TICKER only.
 * Purpose: make Edge TTS playback work in normal and private/incognito windows
 * without relying on any local Arabic system voice. The trusted click starts an
 * HTMLAudioElement immediately, then the remote TTS MP3 is attached to that same
 * user-initiated audio element.
 */
(function(){
  if (window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V5) return;
  window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V5 = true;

  var PLAY_SELECTOR = 'button[data-sr-urgent-voice-button="1"]';
  var DEFAULT_VOICE = 'ar-EG-SalmaNeural';
  var activeAudio = null;
  var activeUrl = '';
  var prefetch = { key: '', state: 'idle', text: '', voice: DEFAULT_VOICE, buffer: null, promise: null, error: '' };
  var lastStatus = '';

  function urgentWrap(){ return document.getElementById('SR_URGENT_TICKER'); }
  function urgentStatus(){ return document.getElementById('SR_URGENT_VOICE_STATUS'); }
  function isVisibleUrgent(){
    var wrap = urgentWrap();
    return !!wrap && wrap.style.display === 'block';
  }
  function getButton(){
    var wrap = urgentWrap();
    return wrap ? wrap.querySelector(PLAY_SELECTOR) : null;
  }
  function isAckTarget(target){
    try { return !!(target && target.closest && target.closest('#SR_URGENT_ACK')); } catch { return false; }
  }
  function isVoiceButtonTarget(target){
    try { return !!(target && target.closest && target.closest(PLAY_SELECTOR)); } catch { return false; }
  }
  function getVoice(btn){
    return String((btn && btn.dataset && btn.dataset.urgentVoice) || DEFAULT_VOICE).trim() || DEFAULT_VOICE;
  }
  function getText(btn){
    return String((btn && btn.dataset && btn.dataset.urgentText) || '').replace(/\s+/g, ' ').trim();
  }
  function getKey(btn){ return getVoice(btn) + '\n' + getText(btn); }
  function setStatus(text){
    var status = urgentStatus();
    if (!status) return;
    var btn = getButton();
    var next = String(text || '');
    if (lastStatus === next && btn && btn.parentElement === status) return;
    lastStatus = next;
    status.textContent = next;
    if (btn) status.appendChild(btn);
  }
  function showButton(btn){
    if (!btn || !isVisibleUrgent()) return;
    btn.style.display = 'inline-flex';
    btn.setAttribute('aria-hidden', 'false');
  }
  function hideButton(btn){
    if (!btn) return;
    btn.style.display = 'none';
    btn.setAttribute('aria-hidden', 'true');
  }
  function stopAudio(){
    try {
      if (activeAudio) {
        activeAudio.pause();
        activeAudio.removeAttribute('src');
        activeAudio.load && activeAudio.load();
      }
    } catch {}
    try { if (activeUrl) URL.revokeObjectURL(activeUrl); } catch {}
    activeAudio = null;
    activeUrl = '';
  }
  function resetPrefetch(key, text, voice){
    prefetch = { key: key, state: 'idle', text: text, voice: voice, buffer: null, promise: null, error: '' };
  }
  function fetchTtsBuffer(text, voice){
    return fetch('/api/urgent-tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text, voice: voice })
    }).then(function(res){
      if (!res.ok) throw new Error('TTS HTTP ' + res.status);
      return res.arrayBuffer();
    });
  }
  function ensurePrefetch(btn){
    if (!btn || !isVisibleUrgent()) return null;
    var text = getText(btn);
    var voice = getVoice(btn);
    var key = voice + '\n' + text;
    if (!text) return null;

    if (prefetch.key !== key) resetPrefetch(key, text, voice);
    if (prefetch.state === 'ready' || prefetch.state === 'loading') return prefetch.promise;

    prefetch.state = 'loading';
    prefetch.error = '';
    showButton(btn);
    setStatus('جاري تجهيز صوت رسالة الأدمن');

    prefetch.promise = fetchTtsBuffer(text, voice).then(function(buffer){
      if (prefetch.key !== key || !isVisibleUrgent()) return null;
      prefetch.buffer = buffer;
      prefetch.state = 'ready';
      setStatus('الصوت جاهز — اضغط تشغيل الصوت');
      showButton(getButton());
      return buffer;
    }).catch(function(error){
      if (prefetch.key === key) {
        prefetch.state = 'failed';
        prefetch.error = String(error && error.message || 'TTS failed');
        setStatus('تعذر تجهيز TTS: ' + prefetch.error);
        showButton(getButton());
      }
      return null;
    });

    return prefetch.promise;
  }
  function playBlobBuffer(btn, buffer){
    if (!btn || !buffer || !isVisibleUrgent()) return false;
    stopAudio();
    var blob = new Blob([buffer], { type: 'audio/mpeg' });
    var url = URL.createObjectURL(blob);
    var audio = new Audio();
    activeAudio = audio;
    activeUrl = url;
    audio.preload = 'auto';
    audio.autoplay = false;
    audio.setAttribute('playsinline', '');
    audio.playsInline = true;
    audio.src = url;
    hideButton(btn);
    setStatus('جاري قراءة رسالة الأدمن العاجلة');
    audio.onended = function(){
      if (!isVisibleUrgent()) return;
      setStatus('انتهت قراءة رسالة الأدمن العاجلة');
      showButton(getButton());
    };
    audio.onerror = function(){
      if (!isVisibleUrgent()) return;
      setStatus('فشل تشغيل ملف TTS الجاهز');
      showButton(getButton());
    };
    try {
      var p = audio.play();
      if (p && typeof p.then === 'function') {
        p.catch(function(error){
          setStatus('المتصفح منع التشغيل: ' + String(error && error.name || 'play blocked'));
          showButton(getButton());
        });
      }
      return true;
    } catch(error) {
      setStatus('المتصفح منع التشغيل: ' + String(error && error.name || 'play blocked'));
      showButton(getButton());
      return false;
    }
  }
  function playViaMediaSource(btn){
    if (!btn || !isVisibleUrgent()) return false;
    var text = getText(btn);
    var voice = getVoice(btn);
    if (!text) return false;

    if (!('MediaSource' in window)) return false;
    try {
      if (MediaSource.isTypeSupported && !MediaSource.isTypeSupported('audio/mpeg')) return false;
    } catch {}

    stopAudio();
    var mediaSource = new MediaSource();
    var url = URL.createObjectURL(mediaSource);
    var audio = new Audio();
    activeAudio = audio;
    activeUrl = url;
    audio.preload = 'auto';
    audio.autoplay = false;
    audio.setAttribute('playsinline', '');
    audio.playsInline = true;
    audio.src = url;

    hideButton(btn);
    setStatus('جاري فتح قناة صوت TTS');

    var playPromise;
    try {
      playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function(error){
          setStatus('المتصفح منع قناة الصوت: ' + String(error && error.name || 'play blocked'));
          showButton(getButton());
        });
      }
    } catch(error) {
      setStatus('المتصفح منع قناة الصوت: ' + String(error && error.name || 'play blocked'));
      showButton(getButton());
      return false;
    }

    mediaSource.addEventListener('sourceopen', function(){
      var sourceBuffer;
      try {
        sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
      } catch(error) {
        setStatus('MediaSource لا يدعم MP3 هنا');
        showButton(getButton());
        return;
      }
      setStatus('جاري تحميل صوت TTS');
      fetchTtsBuffer(text, voice).then(function(buffer){
        if (!isVisibleUrgent() || activeAudio !== audio) return;
        setStatus('جاري قراءة رسالة الأدمن العاجلة');
        sourceBuffer.addEventListener('updateend', function(){
          try { if (mediaSource.readyState === 'open') mediaSource.endOfStream(); } catch {}
        }, { once: true });
        sourceBuffer.appendBuffer(buffer);
      }).catch(function(error){
        setStatus('فشل TTS: ' + String(error && error.message || 'request failed'));
        showButton(getButton());
      });
    }, { once: true });

    audio.onended = function(){
      if (!isVisibleUrgent()) return;
      setStatus('انتهت قراءة رسالة الأدمن العاجلة');
      showButton(getButton());
    };
    audio.onerror = function(){
      if (!isVisibleUrgent()) return;
      setStatus('فشل مشغل الصوت');
      showButton(getButton());
    };
    return true;
  }
  function requestPlay(btn){
    if (!btn || !isVisibleUrgent()) return;
    var key = getKey(btn);
    if (prefetch.key === key && prefetch.state === 'ready' && prefetch.buffer) {
      playBlobBuffer(btn, prefetch.buffer);
      return;
    }

    // Strong Private-window path: start the audio element immediately from the
    // trusted click, then feed TTS bytes into it. No local Arabic voice is used.
    if (playViaMediaSource(btn)) return;

    // Fallback when MediaSource is unavailable: prepare TTS and ask for another
    // real click. This still uses Edge TTS only, never the local system voice.
    ensurePrefetch(btn);
    setStatus('جاري تجهيز TTS — اضغط تشغيل الصوت مرة أخرى بعد الجاهزية');
    showButton(btn);
  }
  function handleTrustedEvent(event){
    if (!isVisibleUrgent()) return;
    if (isAckTarget(event && event.target)) {
      stopAudio();
      return;
    }
    var btn = getButton();
    if (!btn) return;

    ensurePrefetch(btn);

    if (isVoiceButtonTarget(event && event.target)) {
      try {
        event.preventDefault();
        event.stopImmediatePropagation();
      } catch {}
      requestPlay(btn);
    }
  }
  function evaluate(){
    if (!isVisibleUrgent()) return;
    var btn = getButton();
    if (!btn) return;
    showButton(btn);
    ensurePrefetch(btn);
  }

  ['pointerdown','mousedown','touchstart','keydown','click'].forEach(function(evt){
    document.addEventListener(evt, handleTrustedEvent, true);
  });

  try {
    var observer = new MutationObserver(function(){ setTimeout(evaluate, 0); });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  } catch {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(evaluate, 0); }, { once: true });
  } else {
    setTimeout(evaluate, 0);
  }
  setInterval(evaluate, 250);
})();
