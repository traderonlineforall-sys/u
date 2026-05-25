/*
  SR Runtime Safety Guard
  Purpose: protect critical SR / voice / admin DOM contracts at runtime without changing core logic.
  Safe by design: no network calls, no storage, no alerts, no overrides of core functions.
*/
(function(){
  'use strict';

  if (window.__SR_RUNTIME_SAFETY_GUARD_V1) return;
  window.__SR_RUNTIME_SAFETY_GUARD_V1 = true;

  var VERSION = '2026-05-12-safe-contract-v1';
  var warnings = [];
  var protectedNodes = Object.create(null);
  var scanTimer = 0;
  var observerStarted = false;
  var urgentTickerObserved = null;
  var urgentTickerObserver = null;

  var CORE_SCRIPT_ORDER = [
    'app.js',
    'haya-karima-smart-helper.js',
    'safe-tool-upgrade.js',
    'outage-by-mail.js',
    'admin-message-client.js',
    'runtime-safety-guard.js',
    'non-critical-loader.js'
  ];

  var CRITICAL_IDS = [
    'arabicNumber',
    'arabiccNumber',
    'copyBtn',
    'copyBtn1',
    'tabs',
    'MNDO_UA07_LOGO3',
    'UA07_SECRET_ENVELOPE',
    'UA07_SECRET_MODAL',
    'adminOverlay',
    'adminTabAnnouncements',
    'SR_URGENT_TICKER',
    'SR_URGENT_MARQUEE',
    'SR_URGENT_VOICE_STATUS',
    'SR_URGENT_ACK'
  ];

  function now(){ return new Date().toISOString(); }

  function warn(code, detail){
    var item = { time: now(), code: code, detail: String(detail || '') };
    warnings.push(item);
    if (warnings.length > 80) warnings.shift();
    try {
      if (window.console && console.warn) console.warn('[SR Safety Guard]', code, detail || '');
    } catch (e) {}
  }

  function isConnected(node){
    if (!node) return false;
    if (typeof node.isConnected === 'boolean') return node.isConnected;
    return !!(document.documentElement && document.documentElement.contains(node));
  }

  function rememberNode(id){
    var el = document.getElementById(id);
    if (!el) return false;
    var current = protectedNodes[id];
    if (current && current.el === el) return true;
    protectedNodes[id] = {
      id: id,
      el: el,
      parent: el.parentNode || null,
      next: el.nextSibling || null,
      tag: el.tagName || '',
      type: el.getAttribute ? (el.getAttribute('type') || '') : '',
      className: el.className || ''
    };
    return true;
  }

  function restoreNode(id){
    var rec = protectedNodes[id];
    if (!rec || !rec.el) return false;
    if (isConnected(rec.el)) return true;
    if (!rec.parent || !isConnected(rec.parent)) return false;
    try {
      var next = rec.next && rec.next.parentNode === rec.parent ? rec.next : null;
      rec.parent.insertBefore(rec.el, next);
      warn('restored-critical-node', id);
      return true;
    } catch (e) {
      warn('restore-failed', id + ': ' + (e && e.message ? e.message : e));
      return false;
    }
  }

  function createElement(tag, id, className, text){
    var el = document.createElement(tag);
    el.id = id;
    if (className) el.className = className;
    if (typeof text === 'string') el.textContent = text;
    return el;
  }

  function observeUrgentTicker(wrap){
    if (!wrap || !window.MutationObserver) return;
    if (urgentTickerObserved === wrap) return;
    try { if (urgentTickerObserver) urgentTickerObserver.disconnect(); } catch (e) {}
    try {
      urgentTickerObserver = new MutationObserver(function(){ scheduleScan(); });
      urgentTickerObserver.observe(wrap, { attributes: true, attributeFilter: ['style', 'class'] });
      urgentTickerObserved = wrap;
    } catch (e2) {
      warn('urgent-ticker-observer-failed', e2 && e2.message ? e2.message : e2);
    }
  }

  function ensureUrgentTickerChildren(){
    var wrap = document.getElementById('SR_URGENT_TICKER');
    if (!wrap) return;

    rememberNode('SR_URGENT_TICKER');
    observeUrgentTicker(wrap);

    var bar = wrap.querySelector ? wrap.querySelector('.sr-urgent-bar') : null;
    var marquee = document.getElementById('SR_URGENT_MARQUEE');
    var ack = document.getElementById('SR_URGENT_ACK');
    var status = document.getElementById('SR_URGENT_VOICE_STATUS');

    if (!bar) {
      bar = createElement('div', '', 'sr-urgent-bar', '');
      try { wrap.insertBefore(bar, wrap.firstChild || null); } catch (e) { wrap.appendChild(bar); }
      warn('recreated-urgent-bar', 'sr-urgent-bar');
    }

    if (!marquee) {
      marquee = createElement('div', 'SR_URGENT_MARQUEE', 'sr-urgent-marquee', '');
      try { bar.appendChild(marquee); } catch (e) { wrap.appendChild(marquee); }
      warn('recreated-urgent-marquee', 'SR_URGENT_MARQUEE');
    }

    if (!ack) {
      ack = createElement('button', 'SR_URGENT_ACK', 'sr-urgent-ack', 'فهمت');
      ack.type = 'button';
      ack.onclick = function(){
        var ticker = document.getElementById('SR_URGENT_TICKER');
        if (ticker) ticker.style.display = 'none';
      };
      try { bar.appendChild(ack); } catch (e) { wrap.appendChild(ack); }
      warn('recreated-urgent-ack', 'SR_URGENT_ACK');
    }

    if (!status) {
      status = createElement('div', 'SR_URGENT_VOICE_STATUS', '', '');
      status.style.fontSize = '11px';
      status.style.opacity = '0.9';
      status.style.margin = '4px 8px 0 8px';
      wrap.appendChild(status);
      warn('recreated-urgent-voice-status', 'SR_URGENT_VOICE_STATUS');
    }

    rememberNode('SR_URGENT_MARQUEE');
    rememberNode('SR_URGENT_ACK');
    rememberNode('SR_URGENT_VOICE_STATUS');

    // Voice logic in admin-message-client.js checks inline display === "block".
    // Normalize only active/visible ticker states and never force a hidden ticker open.
    try {
      var active = !!(wrap.dataset && wrap.dataset.urgentActiveKey);
      var hasText = !!(marquee && marquee.textContent && marquee.textContent.replace(/\s+/g, '').length);
      if (wrap.style && wrap.style.display && wrap.style.display !== 'none' && wrap.style.display !== 'block') {
        wrap.style.display = 'block';
        warn('normalized-urgent-display', 'forced inline display to block for voice compatibility');
      } else if (wrap.style && wrap.style.display === '' && (active || hasText)) {
        wrap.style.display = 'block';
        warn('normalized-urgent-display', 'active urgent ticker had no inline display');
      }
    } catch (e) {}
  }

  function checkDuplicateCriticalIds(){
    for (var i = 0; i < CRITICAL_IDS.length; i += 1) {
      var id = CRITICAL_IDS[i];
      var count = 0;
      try { count = document.querySelectorAll('[id="' + id + '"]').length; } catch (e) { count = 0; }
      if (count > 1) warn('duplicate-critical-id', id + ' x' + count);
    }
  }

  function scriptName(src){
    src = String(src || '');
    var clean = src.split('#')[0].split('?')[0];
    var parts = clean.split('/');
    return parts[parts.length - 1] || clean;
  }

  function checkScriptOrder(){
    var scripts = document.getElementsByTagName('script');
    var order = [];
    for (var i = 0; i < scripts.length; i += 1) {
      var name = scriptName(scripts[i].getAttribute('src') || '');
      if (name) order.push(name);
    }

    var last = -1;
    for (var j = 0; j < CORE_SCRIPT_ORDER.length; j += 1) {
      var expected = CORE_SCRIPT_ORDER[j];
      var idx = -1;
      for (var k = 0; k < order.length; k += 1) {
        if (order[k] === expected) { idx = k; break; }
      }
      if (idx === -1) {
        warn('missing-core-script', expected);
        continue;
      }
      if (idx < last) warn('core-script-order-risk', expected + ' loaded before expected order');
      last = idx;
    }
  }

  function checkCoreContracts(){
    for (var i = 0; i < CRITICAL_IDS.length; i += 1) {
      var id = CRITICAL_IDS[i];
      if (!rememberNode(id)) continue;
      restoreNode(id);
    }
    ensureUrgentTickerChildren();
    checkDuplicateCriticalIds();
  }

  function scan(){
    scanTimer = 0;
    try { checkCoreContracts(); } catch (e) { warn('contract-check-failed', e && e.message ? e.message : e); }
    try { checkScriptOrder(); } catch (e2) { warn('script-order-check-failed', e2 && e2.message ? e2.message : e2); }
    window.__SR_SAFE_STATUS__.lastCheck = now();
  }

  function scheduleScan(){
    if (scanTimer) return;
    scanTimer = setTimeout(scan, 120);
  }

  function startObserver(){
    if (observerStarted) return;
    observerStarted = true;
    if (!window.MutationObserver || !document.documentElement) return;
    try {
      var observer = new MutationObserver(function(){ scheduleScan(); });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      window.__SR_SAFE_STATUS__.observer = observer;
    } catch (e) { warn('observer-start-failed', e && e.message ? e.message : e); }
  }

  function boot(){
    window.__SR_SAFE_STATUS__ = window.__SR_SAFE_STATUS__ || {
      version: VERSION,
      warnings: warnings,
      protectedNodes: protectedNodes,
      lastCheck: '',
      check: scan
    };
    window.__SR_SAFE_STATUS__.version = VERSION;
    window.__SR_SAFE_STATUS__.warnings = warnings;
    window.__SR_SAFE_STATUS__.protectedNodes = protectedNodes;
    scan();
    startObserver();
    // Catch late-created admin/ticker nodes without adding constant work.
    setTimeout(scan, 700);
    setTimeout(scan, 1800);
    setTimeout(scan, 4500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
