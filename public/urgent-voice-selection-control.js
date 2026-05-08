/*
 * Urgent voice selection controller.
 * Scope: #SR_URGENT_TICKER voice button only.
 * Goal: preserve the working normal/private playback path, but make the chosen
 * voice audible and visible instead of silently sounding like one fallback voice.
 */
(function(){
  if (window.__UA07_URGENT_VOICE_SELECTION_CONTROL_V2) return;
  window.__UA07_URGENT_VOICE_SELECTION_CONTROL_V2 = true;

  // This branch intentionally lets this controller own the urgent voice button.
  // It prevents the previous auto-activation helper from also handling the same
  // trusted click and briefly showing AbortError before the selected voice plays.
  window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V9 = true;

  var PLAY_SELECTOR = 'button[data-sr-urgent-voice-button="1"]';
  var DEFAULT_VOICE = 'ar-EG-SalmaNeural';
  var audioCtx = null;
  var activeSource = null;
  var activeKey = '';
  var lastLaunchKey = '';
  var lastLaunchAt = 0;

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
  function isVoiceButtonTarget(target){
    try { return !!(target && target.closest && target.closest(PLAY_SELECTOR)); } catch { return false; }
  }
  function isAckTarget(target){
    try { return !!(target && target.closest && target.closest('#SR_URGENT_ACK')); } catch { return false; }
  }
  function getText(btn){
    return String((btn && btn.dataset && btn.dataset.urgentText) || '').replace(/\s+/g, ' ').trim();
  }
  function getVoice(btn){
    var wrap = urgentWrap();
    return String(
      (wrap && wrap.dataset && wrap.dataset.urgentVoice) ||
      (btn && btn.dataset && btn.dataset.urgentVoice) ||
      DEFAULT_VOICE
    ).trim() || DEFAULT_VOICE;
  }
  function voiceLabel(voice){
    var v = String(voice || '').toLowerCase();
    var m = String(voice || '').match(/ar-([A-Z]{2})-([A-Za-z]+)Neural/i);
    var name = m ? m[2] : String(voice || DEFAULT_VOICE);
    var gender = /shakir|hamed|hamdan|taim|fahed|moaz|ali|bassel|rami|jamal|abdullah|laith|hedi|saleh/i.test(v) ? 'رجالي' : 'نسائي';
    return name + ' / ' + gender;
  }
  function keyFor(btn){ return getVoice(btn) + '\n' + getText(btn); }
  function setStatus(message){
    var status = urgentStatus();
    if (!status) return;
    var btn = getButton();
    status.textContent = String(message || '');
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
  function stopActive(){
    try { if (activeSource) activeSource.stop(0); } catch {}
    try { if (activeSource) activeSource.disconnect(); } catch {}
    activeSource = null;
    activeKey = '';
  }
  function voiceProfile(voice){
    var v = String(voice || '').toLowerCase();
    var male = /shakir|hamed|hamdan|taim|fahed|moaz|ali|bassel|rami|jamal|abdullah|laith|hedi|saleh/.test(v);
    var gulf = /sa-|ae-|kw-|qa-|bh-|om-/.test(v);
    var levant = /jo-|lb-|sy-/.test(v);
    var maghreb = /ma-|tn-/.test(v);

    if (male && gulf) return { rate: 0.78, label: 'رجالي خليجي' };
    if (male) return { rate: 0.72, label: 'رجالي' };
    if (gulf) return { rate: 1.08, label: 'نسائي خليجي' };
    if (levant) return { rate: 0.96, label: 'نسائي شامي' };
    if (maghreb) return { rate: 1.12, label: 'نسائي مغاربي' };
    return { rate: 1.0, label: 'نسائي مصري' };
  }
  function makeUrl(text, voice){
    return '/api/urgent-tts?voice=' + encodeURIComponent(voice) + '&text=' + encodeURIComponent(text) + '&t=' + Date.now().toString(36);
  }
  async function fetchTts(text, voice){
    var res = await fetch(makeUrl(text, voice), { method: 'GET', cache: 'no-store' });
    var provider = String(res.headers.get('x-ua07-tts-provider') || 'unknown');
    var actualVoice = String(res.headers.get('x-ua07-tts-voice') || voice);
    var contentType = String(res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) throw new Error('TTS HTTP ' + res.status);
    if (contentType && contentType.indexOf('audio') === -1 && contentType.indexOf('mpeg') === -1) {
      throw new Error('TTS invalid content: ' + contentType);
    }
    var buffer = await res.arrayBuffer();
    if (!buffer || buffer.byteLength < 128) throw new Error('TTS empty audio');
    return { buffer: buffer, provider: provider, actualVoice: actualVoice };
  }
  async function playSelectedVoice(btn){
    var text = getText(btn);
    var requestedVoice = getVoice(btn);
    var key = keyFor(btn);
    if (!text || !isVisibleUrgent()) return;

    var now = Date.now();
    if (lastLaunchKey === key && now - lastLaunchAt < 650) return;
    lastLaunchKey = key;
    lastLaunchAt = now;

    stopActive();
    activeKey = key;
    hideButton(btn);
    setStatus('جاري تجهيز الصوت المختار: ' + voiceLabel(requestedVoice));

    var ctx = getAudioContext();
    if (!ctx) throw new Error('WebAudio غير مدعوم');
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch {}

    var result = await fetchTts(text, requestedVoice);
    if (!isVisibleUrgent() || activeKey !== key) return;

    var decoded = await ctx.decodeAudioData(result.buffer.slice(0));
    if (!isVisibleUrgent() || activeKey !== key) return;

    var selected = voiceProfile(requestedVoice);
    var source = ctx.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = Math.max(0.65, Math.min(1.16, selected.rate || 1));
    source.connect(ctx.destination);
    activeSource = source;

    var providerText = /fallback|google/i.test(result.provider) ? 'Fallback مضبوط حسب الاختيار' : 'Edge voice';
    setStatus('جاري القراءة: ' + voiceLabel(requestedVoice) + ' - ' + providerText);

    source.onended = function(){
      if (activeSource === source) activeSource = null;
      if (!isVisibleUrgent()) return;
      setStatus('انتهت القراءة - آخر صوت: ' + voiceLabel(requestedVoice));
      showButton(getButton());
    };
    source.start(0);
  }

  function shouldHandleKey(event){
    if (event.type !== 'keydown') return true;
    var key = String(event.key || '');
    return key === 'Enter' || key === ' ' || key === 'Spacebar';
  }
  function handleVoiceIntent(event){
    if (!isVisibleUrgent()) return;
    if (isAckTarget(event.target)) {
      stopActive();
      return;
    }
    if (!isVoiceButtonTarget(event.target)) return;
    if (!shouldHandleKey(event)) return;

    var btn = getButton();
    if (!btn) return;
    try {
      event.preventDefault();
      event.stopImmediatePropagation();
    } catch {}

    playSelectedVoice(btn).catch(function(error){
      if (!isVisibleUrgent()) return;
      setStatus('تعذر تشغيل الصوت المختار: ' + String(error && error.message || error || 'unknown'));
      showButton(getButton());
    });
  }

  ['pointerdown','mousedown','touchstart','keydown','click'].forEach(function(evt){
    document.addEventListener(evt, handleVoiceIntent, true);
  });
})();
