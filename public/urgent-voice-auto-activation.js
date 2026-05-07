/*
 * Urgent admin voice auto-activation helper.
 * Scope: #SR_URGENT_TICKER only.
 * Purpose: make urgent Arabic voice reliable in normal and private/incognito
 * windows by preparing the TTS audio as soon as the urgent voice button exists,
 * then playing the prepared audio directly inside the user's trusted click.
 */
(function(){
  if (window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V2) return;
  window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V2 = true;

  var PLAY_SELECTOR = 'button[data-sr-urgent-voice-button="1"]';
  var prefetch = { key: '', state: 'idle', text: '', voice: '', audio: null, url: '', promise: null };
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
  function isTrustedPlayEvent(event){
    var type = String(event && event.type || '');
    return /^(pointerdown|mousedown|touchstart|click|keydown)$/.test(type);
  }
  function getVoice(btn){
    return String((btn && btn.dataset && btn.dataset.urgentVoice) || 'ar-EG-SalmaNeural').trim() || 'ar-EG-SalmaNeural';
  }
  function getText(btn){
    return String((btn && btn.dataset && btn.dataset.urgentText) || '').replace(/\s+/g, ' ').trim();
  }
  function getKey(btn){
    return getVoice(btn) + '\n' + getText(btn);
  }
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
  function cleanupPrefetch(){
    try {
      if (prefetch.audio) {
        prefetch.audio.pause();
        prefetch.audio.removeAttribute('src');
        prefetch.audio.load && prefetch.audio.load();
      }
    } catch {}
    try { if (prefetch.url) URL.revokeObjectURL(prefetch.url); } catch {}
    prefetch.audio = null;
    prefetch.url = '';
    prefetch.promise = null;
  }
  function ensurePrefetch(btn){
    if (!btn || !isVisibleUrgent()) return null;
    var text = getText(btn);
    var voice = getVoice(btn);
    var key = voice + '\n' + text;
    if (!text) return null;

    if (prefetch.key === key && (prefetch.state === 'loading' || prefetch.state === 'ready')) {
      return prefetch.promise;
    }

    cleanupPrefetch();
    prefetch = { key: key, state: 'loading', text: text, voice: voice, audio: null, url: '', promise: null };
    showButton(btn);
    setStatus('جاري تجهيز صوت رسالة الأدمن');

    prefetch.promise = fetch('/api/urgent-tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text, voice: voice })
    }).then(function(res){
      if (!res.ok) throw new Error('urgent-tts-failed');
      var ct = String(res.headers.get('content-type') || '').toLowerCase();
      if (ct && ct.indexOf('audio/') === -1 && ct.indexOf('mpeg') === -1 && ct.indexOf('wav') === -1) {
        throw new Error('urgent-tts-invalid-content-type');
      }
      return res.blob();
    }).then(function(blob){
      if (prefetch.key !== key || !isVisibleUrgent()) return null;
      var url = URL.createObjectURL(blob);
      var audio = new Audio();
      audio.preload = 'auto';
      audio.autoplay = false;
      audio.setAttribute('playsinline', '');
      audio.playsInline = true;
      audio.src = url;
      try { audio.load(); } catch {}
      prefetch.url = url;
      prefetch.audio = audio;
      prefetch.state = 'ready';
      setStatus('الصوت جاهز — اضغط تشغيل الصوت');
      showButton(getButton());
      return audio;
    }).catch(function(){
      if (prefetch.key === key) {
        prefetch.state = 'failed';
        setStatus('اضغط تشغيل الصوت لإعادة المحاولة');
        showButton(getButton());
      }
      return null;
    });

    return prefetch.promise;
  }
  function playPrepared(btn){
    if (!btn || !isVisibleUrgent()) return false;
    var key = getKey(btn);
    if (prefetch.key !== key || prefetch.state !== 'ready' || !prefetch.audio) return false;

    try { window.speechSynthesis && window.speechSynthesis.cancel && window.speechSynthesis.cancel(); } catch {}
    try {
      prefetch.audio.pause();
      prefetch.audio.currentTime = 0;
    } catch {}

    hideButton(btn);
    setStatus('جاري قراءة رسالة الأدمن العاجلة');

    try {
      var p = prefetch.audio.play();
      if (p && typeof p.then === 'function') {
        p.then(function(){
          hideButton(getButton());
        }).catch(function(){
          setStatus('اضغط تشغيل الصوت لو المتصفح منع التشغيل');
          showButton(getButton());
        });
      }
      prefetch.audio.onended = function(){
        if (!isVisibleUrgent()) return;
        setStatus('انتهت قراءة رسالة الأدمن العاجلة');
        showButton(getButton());
      };
      prefetch.audio.onerror = function(){
        if (!isVisibleUrgent()) return;
        prefetch.state = 'failed';
        setStatus('اضغط تشغيل الصوت لإعادة المحاولة');
        showButton(getButton());
      };
      return true;
    } catch {
      setStatus('اضغط تشغيل الصوت لو المتصفح منع التشغيل');
      showButton(getButton());
      return false;
    }
  }
  function handleTrustedEvent(event){
    if (!isVisibleUrgent()) return;
    if (isAckTarget(event && event.target)) return;
    var btn = getButton();
    if (!btn) return;

    ensurePrefetch(btn);

    if (isVoiceButtonTarget(event && event.target)) {
      if (prefetch.state === 'ready' && playPrepared(btn)) {
        try {
          event.preventDefault();
          event.stopImmediatePropagation();
        } catch {}
        return;
      }
      if (prefetch.state === 'loading') {
        try {
          event.preventDefault();
          event.stopImmediatePropagation();
        } catch {}
        setStatus('جاري تجهيز الصوت — اضغط تشغيل الصوت بعد لحظة');
        showButton(btn);
        return;
      }
      return;
    }

    if (isTrustedPlayEvent(event) && prefetch.state === 'ready') {
      playPrepared(btn);
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
