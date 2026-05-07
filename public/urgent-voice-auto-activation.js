/*
 * Urgent admin voice auto-activation helper.
 * Scope: #SR_URGENT_TICKER only.
 * Purpose: make urgent Arabic voice reliable in normal and private/incognito
 * windows by using Web Audio. A trusted user gesture resumes AudioContext once,
 * and the prepared TTS buffer can then start without the HTMLAudio autoplay trap.
 */
(function(){
  if (window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V3) return;
  window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V3 = true;

  var PLAY_SELECTOR = 'button[data-sr-urgent-voice-button="1"]';
  var DEFAULT_VOICE = 'ar-EG-SalmaNeural';
  var audioCtx = null;
  var activeSource = null;
  var state = { key: '', text: '', voice: DEFAULT_VOICE, status: 'idle', buffer: null, promise: null, wanted: false };
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
  function getAudioContext(){
    if (audioCtx) return audioCtx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  }
  function resumeAudioContext(){
    var ctx = getAudioContext();
    if (!ctx) return Promise.resolve(null);
    try {
      if (ctx.state === 'suspended') return ctx.resume().then(function(){ return ctx; }).catch(function(){ return ctx; });
    } catch {}
    return Promise.resolve(ctx);
  }
  function stopActiveSource(){
    try { if (activeSource) activeSource.stop(0); } catch {}
    try { if (activeSource) activeSource.disconnect(); } catch {}
    activeSource = null;
    try { window.speechSynthesis && window.speechSynthesis.cancel && window.speechSynthesis.cancel(); } catch {}
  }
  function resetForKey(key, text, voice){
    stopActiveSource();
    state = { key: key, text: text, voice: voice, status: 'idle', buffer: null, promise: null, wanted: false };
  }
  function ensureBuffer(btn){
    if (!btn || !isVisibleUrgent()) return null;
    var text = getText(btn);
    var voice = getVoice(btn);
    var key = voice + '\n' + text;
    if (!text) return null;

    if (state.key !== key) resetForKey(key, text, voice);
    if (state.status === 'ready' || state.status === 'loading') return state.promise;

    state.status = 'loading';
    state.wanted = state.wanted || false;
    showButton(btn);
    setStatus('جاري تجهيز صوت رسالة الأدمن');

    state.promise = fetch('/api/urgent-tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text, voice: voice })
    }).then(function(res){
      if (!res.ok) throw new Error('urgent-tts-failed');
      return res.arrayBuffer();
    }).then(function(arrayBuffer){
      var ctx = getAudioContext();
      if (!ctx) throw new Error('web-audio-unavailable');
      return ctx.decodeAudioData(arrayBuffer.slice(0));
    }).then(function(buffer){
      if (state.key !== key || !isVisibleUrgent()) return null;
      state.buffer = buffer;
      state.status = 'ready';
      setStatus('الصوت جاهز — اضغط تشغيل الصوت');
      showButton(getButton());
      if (state.wanted) playBuffer(getButton());
      return buffer;
    }).catch(function(){
      if (state.key === key) {
        state.status = 'failed';
        state.buffer = null;
        setStatus('اضغط تشغيل الصوت لإعادة تجهيز الصوت');
        showButton(getButton());
      }
      return null;
    });

    return state.promise;
  }
  function playBuffer(btn){
    if (!btn || !isVisibleUrgent()) return false;
    var key = getKey(btn);
    if (state.key !== key) return false;
    if (!state.buffer) {
      state.wanted = true;
      ensureBuffer(btn);
      setStatus('جاري تجهيز الصوت — سيتم تشغيله فورًا');
      showButton(btn);
      return false;
    }

    var ctx = getAudioContext();
    if (!ctx) {
      setStatus('المتصفح لا يدعم تشغيل الصوت هنا');
      showButton(btn);
      return false;
    }

    stopActiveSource();
    hideButton(btn);
    setStatus('جاري قراءة رسالة الأدمن العاجلة');

    try {
      var source = ctx.createBufferSource();
      source.buffer = state.buffer;
      source.connect(ctx.destination);
      source.onended = function(){
        if (activeSource === source) activeSource = null;
        if (!isVisibleUrgent()) return;
        state.status = 'ended';
        setStatus('انتهت قراءة رسالة الأدمن العاجلة');
        showButton(getButton());
      };
      activeSource = source;
      source.start(0);
      state.status = 'playing';
      state.wanted = false;
      return true;
    } catch {
      state.status = 'failed';
      setStatus('اضغط تشغيل الصوت لإعادة المحاولة');
      showButton(getButton());
      return false;
    }
  }
  function requestPlay(btn){
    if (!btn || !isVisibleUrgent()) return;
    resumeAudioContext().then(function(){
      if (!isVisibleUrgent()) return;
      if (state.status === 'ready' && state.buffer) {
        playBuffer(btn);
        return;
      }
      state.wanted = true;
      ensureBuffer(btn);
      setStatus('جاري تجهيز الصوت — سيتم تشغيله فورًا');
      showButton(btn);
    });
  }
  function handleTrustedEvent(event){
    if (!isVisibleUrgent()) return;
    if (isAckTarget(event && event.target)) {
      stopActiveSource();
      return;
    }
    var btn = getButton();
    if (!btn) return;

    // Always start preparing early.
    ensureBuffer(btn);

    if (isVoiceButtonTarget(event && event.target)) {
      try {
        event.preventDefault();
        event.stopImmediatePropagation();
      } catch {}
      requestPlay(btn);
      return;
    }

    // Any real interaction can unlock Web Audio, then play if the sound is ready.
    resumeAudioContext().then(function(){
      if (!isVisibleUrgent()) return;
      if (state.status === 'ready' && state.buffer) playBuffer(getButton());
    });
  }
  function evaluate(){
    if (!isVisibleUrgent()) return;
    var btn = getButton();
    if (!btn) return;
    showButton(btn);
    ensureBuffer(btn);
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
  setInterval(evaluate, 200);
})();
