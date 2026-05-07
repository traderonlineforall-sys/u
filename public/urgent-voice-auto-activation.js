/*
 * Urgent admin voice auto-activation helper.
 * Scope: #SR_URGENT_TICKER only.
 * Purpose: stable Edge TTS playback without local Arabic voices.
 * Private/incognito path uses a direct GET audio URL and never auto-retries after failure.
 */
(function(){
  if (window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V7) return;
  window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V7 = true;

  var PLAY_SELECTOR = 'button[data-sr-urgent-voice-button="1"]';
  var DEFAULT_VOICE = 'ar-EG-SalmaNeural';
  var activeAudio = null;
  var lastKey = '';
  var failedKey = '';
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
  function getAudioUrl(btn){
    var text = getText(btn);
    var voice = getVoice(btn);
    return '/api/urgent-tts?voice=' + encodeURIComponent(voice) + '&text=' + encodeURIComponent(text) + '&t=' + Date.now().toString(36);
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
  function stopAudio(){
    try {
      if (activeAudio) {
        activeAudio.pause();
        activeAudio.removeAttribute('src');
        activeAudio.load && activeAudio.load();
      }
    } catch {}
    activeAudio = null;
  }
  function voiceProfile(voice){
    var v = String(voice || '').toLowerCase();
    var male = /shakir|hamed|hamdan|taim|fahed|moaz|ali|bassel|rami|jamal|abdullah|laith|hedi|saleh/.test(v);
    var gulf = /sa-|ae-|kw-|qa-|bh-|om-/.test(v);
    var levant = /jo-|lb-|sy-/.test(v);
    var maghreb = /ma-|tn-/.test(v);
    if (male && gulf) return { rate: 0.94 };
    if (male) return { rate: 0.91 };
    if (gulf) return { rate: 1.04 };
    if (levant) return { rate: 1.02 };
    if (maghreb) return { rate: 1.06 };
    return { rate: 1.0 };
  }
  function applyVoiceProfile(audio, voice){
    if (!audio) return;
    var profile = voiceProfile(voice);
    try { audio.preservesPitch = false; } catch {}
    try { audio.mozPreservesPitch = false; } catch {}
    try { audio.webkitPreservesPitch = false; } catch {}
    try { audio.playbackRate = Math.max(0.85, Math.min(1.12, profile.rate || 1)); } catch {}
  }
  function primeButton(btn){
    if (!btn || !isVisibleUrgent()) return;
    var key = getKey(btn);
    if (!getText(btn)) return;
    if (lastKey !== key) {
      lastKey = key;
      failedKey = '';
      stopAudio();
      setStatus('اضغط تشغيل الصوت لقراءة رسالة الأدمن');
    }
    showButton(btn);
  }
  function playDirectTts(btn){
    if (!btn || !isVisibleUrgent()) return;
    var text = getText(btn);
    var key = getKey(btn);
    var voice = getVoice(btn);
    if (!text) return;

    stopAudio();
    failedKey = '';

    var audio = new Audio();
    activeAudio = audio;
    audio.preload = 'auto';
    audio.autoplay = false;
    audio.crossOrigin = 'same-origin';
    audio.setAttribute('playsinline', '');
    audio.playsInline = true;
    applyVoiceProfile(audio, voice);

    hideButton(btn);
    setStatus('جاري تحميل وتشغيل صوت TTS');

    audio.onplaying = function(){
      setStatus('جاري قراءة رسالة الأدمن العاجلة');
      hideButton(getButton());
    };
    audio.onended = function(){
      if (!isVisibleUrgent()) return;
      setStatus('انتهت قراءة رسالة الأدمن العاجلة');
      showButton(getButton());
    };
    audio.onerror = function(){
      if (!isVisibleUrgent()) return;
      failedKey = key;
      var code = audio.error && audio.error.code ? String(audio.error.code) : 'unknown';
      setStatus('فشل تشغيل TTS مباشر - كود الصوت: ' + code + ' - اضغط لإعادة المحاولة');
      showButton(getButton());
    };

    audio.src = getAudioUrl(btn);
    try { audio.load(); } catch {}
    try {
      var p = audio.play();
      if (p && typeof p.then === 'function') {
        p.catch(function(error){
          if (!isVisibleUrgent()) return;
          failedKey = key;
          setStatus('المتصفح منع التشغيل: ' + String(error && error.name || 'play blocked') + ' - اضغط تشغيل الصوت');
          showButton(getButton());
        });
      }
    } catch(error) {
      failedKey = key;
      setStatus('المتصفح منع التشغيل: ' + String(error && error.name || 'play blocked') + ' - اضغط تشغيل الصوت');
      showButton(getButton());
    }
  }
  function handleTrustedEvent(event){
    if (!isVisibleUrgent()) return;
    if (isAckTarget(event && event.target)) {
      stopAudio();
      return;
    }
    var btn = getButton();
    if (!btn) return;
    primeButton(btn);

    if (isVoiceButtonTarget(event && event.target)) {
      try {
        event.preventDefault();
        event.stopImmediatePropagation();
      } catch {}
      playDirectTts(btn);
    }
  }
  function evaluate(){
    if (!isVisibleUrgent()) return;
    var btn = getButton();
    if (!btn) return;
    primeButton(btn);
    // Do not auto-fetch and do not auto-retry. This prevents Private-window flashing.
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
  setInterval(evaluate, 1000);
})();
