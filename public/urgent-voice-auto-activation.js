/*
 * Urgent admin voice auto-activation helper.
 * Scope: #SR_URGENT_TICKER only.
 * Purpose: make the existing urgent Arabic voice flow feel automatic whenever
 * the browser allows it, while keeping the manual voice button immediately
 * available when autoplay is blocked, especially in private/incognito windows.
 */
(function(){
  if (window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V1) return;
  window.__UA07_URGENT_VOICE_AUTO_ACTIVATION_V1 = true;

  var PLAY_SELECTOR = 'button[data-sr-urgent-voice-button="1"]';
  var deferredPlay = null;
  var deferredShownTimer = 0;
  var lastRetryKey = '';
  var retryCount = 0;
  var userActivated = false;

  function markUserActivated(){
    userActivated = true;
  }
  function hasUserActivation(){
    try {
      if (navigator.userActivation && navigator.userActivation.hasBeenActive) return true;
    } catch {}
    return userActivated;
  }

  function urgentWrap(){ return document.getElementById('SR_URGENT_TICKER'); }
  function urgentStatus(){ return document.getElementById('SR_URGENT_VOICE_STATUS'); }
  function isAckTarget(target){
    try { return !!(target && target.closest && target.closest('#SR_URGENT_ACK')); } catch { return false; }
  }
  function isVisibleUrgent(){
    var wrap = urgentWrap();
    return !!wrap && wrap.style.display === 'block';
  }
  function getButton(){
    var wrap = urgentWrap();
    return wrap ? wrap.querySelector(PLAY_SELECTOR) : null;
  }
  function setStatus(text){
    var status = urgentStatus();
    if (!status) return;
    var btn = getButton();
    status.textContent = text || '';
    if (btn && btn.parentElement !== status) status.appendChild(btn);
    else if (btn) status.appendChild(btn);
  }
  function hideButton(btn){
    if (!btn) return;
    btn.style.display = 'none';
    btn.setAttribute('aria-hidden', 'true');
  }
  function showButton(btn){
    if (!btn || !isVisibleUrgent()) return;
    btn.style.display = 'inline-flex';
    btn.setAttribute('aria-hidden', 'false');
  }
  function clickButton(btn){
    if (!btn || !isVisibleUrgent()) return false;
    try {
      btn.click();
      return true;
    } catch {
      return false;
    }
  }
  function armDeferredPlay(btn){
    deferredPlay = btn;
    showButton(btn);
    setStatus('اضغط تشغيل الصوت لو المتصفح منع التشغيل التلقائي');
    clearTimeout(deferredShownTimer);
  }
  function triggerDeferred(event){
    markUserActivated();
    if (!deferredPlay || !isVisibleUrgent()) return;
    if (isAckTarget(event && event.target)) return;
    var btn = deferredPlay;
    deferredPlay = null;
    clearTimeout(deferredShownTimer);
    hideButton(btn);
    setStatus('جاري تشغيل صوت رسالة الأدمن');
    clickButton(btn);
    setTimeout(function(){
      if (!isVisibleUrgent()) return;
      var currentBtn = getButton();
      if (currentBtn) showButton(currentBtn);
    }, 1200);
  }
  function autoRetryFailure(btn){
    var key = String(btn.dataset.urgentText || '') + '\n' + String(btn.dataset.urgentVoice || '');
    if (lastRetryKey !== key) {
      lastRetryKey = key;
      retryCount = 0;
    }
    if (retryCount >= 2) {
      setStatus('اضغط تشغيل الصوت لو المتصفح منع التشغيل التلقائي');
      showButton(btn);
      return;
    }
    retryCount += 1;
    if (!hasUserActivation()) {
      armDeferredPlay(btn);
      return;
    }
    hideButton(btn);
    setStatus('جاري إعادة محاولة تشغيل الصوت تلقائيًا');
    setTimeout(function(){
      if (!isVisibleUrgent()) return;
      clickButton(btn);
      setTimeout(function(){
        if (!isVisibleUrgent()) return;
        var currentBtn = getButton();
        if (currentBtn) showButton(currentBtn);
      }, 1200);
    }, retryCount === 1 ? 80 : 250);
  }
  function evaluate(){
    if (!isVisibleUrgent()) {
      deferredPlay = null;
      clearTimeout(deferredShownTimer);
      return;
    }
    var btn = getButton();
    if (!btn) return;
    var label = String(btn.textContent || '').trim();
    if (label.indexOf('تشغيل الصوت') !== -1) {
      armDeferredPlay(btn);
      if (hasUserActivation()) {
        setTimeout(function(){ if (deferredPlay === btn) triggerDeferred({ target: btn }); }, 30);
      }
      return;
    }
    if (label.indexOf('إعادة المحاولة') !== -1) {
      autoRetryFailure(btn);
    }
  }

  ['pointerdown','mousedown','touchstart','keydown','focusin','click','input'].forEach(function(evt){
    document.addEventListener(evt, triggerDeferred, true);
  });

  try {
    var observer = new MutationObserver(function(){ setTimeout(evaluate, 40); });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  } catch {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(evaluate, 300); }, { once: true });
  } else {
    setTimeout(evaluate, 300);
  }
  setInterval(evaluate, 2500);
})();
