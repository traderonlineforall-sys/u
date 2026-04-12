(function () {
  var STYLE_ID = 'hk-smart-helper-style';
  var LINE_ID = 'hkSmartFloatingLine';
  var INPUT_ID = 'arabicNumber';
  var SEARCH_ID = 'searchInput';
  var RAW_INPUT_ID = 'hkRawSourceInput';
  var RAW_STATUS_ID = 'hkRawSourceStatus';
  var CODES = ['97','96','95','93','92','88','86','84','82','69','68','66','65','64','62','57','55','50','48','47','46','45','40','18','13','3','2'];

  if (typeof window.move1 !== 'function') {
    window.move1 = function () {};
  }

  var helperState = {
    identity: '',
    rawValue: '',
    rawDisplayValue: '',
    rawDisplayTone: '',
    statusText: '',
    statusTone: '',
    dom: null,
    boundInput: null,
    observer: null,
    renderTimer: 0,
    rawTimer: 0,
    rawToken: 0,
    resizeBound: false,
    popupBound: false,
    inputListeners: []
  };

  function toEnglishDigits(value) {
    var map = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
    return String(value || '').replace(/[٠-٩]/g, function (d) { return map[d] || d; });
  }

  function digitsOnly(value) {
    return toEnglishDigits(value).replace(/\D/g, '');
  }

  function stripLeadingZeros(value) {
    return String(value || '').replace(/^0+/, '');
  }

  function parseLandline(rawInput) {
    var raw = stripLeadingZeros(digitsOnly(rawInput));
    if (!raw) return { state: 'empty' };

    var strippedArea = '';
    for (var i = 0; i < CODES.length; i += 1) {
      if (raw.indexOf(CODES[i]) === 0) {
        strippedArea = CODES[i];
        break;
      }
    }

    if (!strippedArea) return { state: 'unknown', raw: raw };

    var landline = raw.slice(strippedArea.length);
    if (!landline) return { state: 'partial', raw: raw, strippedArea: strippedArea };

    var areaCode = '0' + strippedArea;
    var apiUrl = 'https://10.19.44.2/ireport/api/haya_karima_api.php?area_code=' +
      encodeURIComponent(areaCode) + '&landline=' + encodeURIComponent(landline);

    return { state: 'ready', raw: raw, areaCode: areaCode, landline: landline, apiUrl: apiUrl };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + LINE_ID + '{display:none;position:absolute;left:0;top:0;transform:none;min-width:300px;max-width:560px;font-size:12px;text-align:center;z-index:2;pointer-events:auto;user-select:text;color:rgba(255,255,255,.88);text-shadow:0 1px 2px rgba(0,0,0,.55);white-space:normal;overflow:visible;isolation:isolate;}',
      '#' + LINE_ID + '.is-visible{display:block;}',
      '#' + LINE_ID + ',#' + LINE_ID + ' *{pointer-events:auto;}',
      '#' + LINE_ID + ' .hk-shell{display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;}',
      '#' + LINE_ID + ' .hk-row{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;}',
      '#' + LINE_ID + ' .hk-button{display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:24px;padding:0 11px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);box-shadow:0 10px 22px rgba(0,0,0,.22);text-decoration:none;color:#ffffff;font-weight:700;letter-spacing:.08em;flex:0 0 auto;cursor:pointer;}',
      '#' + LINE_ID + ' .hk-button:hover{border-color:rgba(255,255,255,.32);background:rgba(255,255,255,.12);}',
      '#' + LINE_ID + ' .hk-button:focus{outline:none;box-shadow:0 0 0 3px rgba(255,255,255,.10),0 10px 22px rgba(0,0,0,.22);}',
      '#' + LINE_ID + ' .hk-raw{flex:1 1 auto;min-width:0;width:100%;height:24px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(10,14,24,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.05);color:#ffffff;font:inherit;font-weight:700;direction:ltr;text-align:left;caret-color:#ffffff;-webkit-user-select:text;user-select:text;cursor:text;transition:border-color .16s ease, box-shadow .16s ease, color .16s ease;}',
      '#' + LINE_ID + ' .hk-raw::placeholder{color:rgba(255,255,255,.72);font-weight:700;}',
      '#' + LINE_ID + ' .hk-raw:focus{outline:none;border-color:rgba(255,255,255,.28);box-shadow:0 0 0 3px rgba(255,255,255,.08);}',
      '#' + LINE_ID + ' .hk-raw.is-ok{color:#d7ffe7;border-color:rgba(124,255,177,.34);}',
      '#' + LINE_ID + ' .hk-raw.is-bad{color:#ff9b9b;border-color:rgba(255,134,134,.38);}',
      '#' + LINE_ID + ' .hk-raw.is-warn{color:#ffffff;border-color:rgba(255,255,255,.22);}',
      '#' + LINE_ID + ' .hk-status{display:none;max-width:100%;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ffffff;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.65);}',
      '#' + LINE_ID + ' .hk-status:empty{display:none;}',
      '#' + LINE_ID + ' .hk-status.is-ok{color:#d7ffe7;font-weight:700;}',
      '#' + LINE_ID + ' .hk-status.is-bad{color:#ff8686;font-weight:700;}',
      '#' + LINE_ID + ' .hk-status.is-warn{color:#ffffff;font-weight:700;}',
      '#' + LINE_ID + ' .hk-muted{display:none;color:rgba(255,255,255,.72);}',
      '#' + LINE_ID + ' .hk-hidden{display:none !important;}'
    ].join('');
    document.head.appendChild(style);
  }

  function makeElement(tag, className, id) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (id) el.id = id;
    return el;
  }

  function bindButton(button) {
    if (!button || button.dataset.hkBound === '1') return;
    button.dataset.hkBound = '1';
    button.addEventListener('click', function (event) {
      var popupUrl = button.getAttribute('data-popup-url') || button.getAttribute('href');
      if (!popupUrl) return;
      event.preventDefault();
      event.stopPropagation();
      openPopup(popupUrl);
    });
  }

  function stopBubble(event) {
    event.stopPropagation();
  }

  function bindRawInput(rawInput) {
    if (!rawInput || rawInput.dataset.hkBound === '1') return;
    rawInput.dataset.hkBound = '1';

    ['pointerdown', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'keypress'].forEach(function (eventName) {
      rawInput.addEventListener(eventName, stopBubble);
    });

    function resetForEntry(selectAll) {
      if (!rawInput.classList.contains('is-ok') && !rawInput.classList.contains('is-bad') && !rawInput.classList.contains('is-warn')) return;
      rawInput.value = '';
      rawInput.classList.remove('is-ok', 'is-bad', 'is-warn');
      helperState.rawDisplayValue = '';
      helperState.rawDisplayTone = '';
      if (selectAll) {
        setTimeout(function () {
          try { rawInput.setSelectionRange(0, 0); } catch (error) {}
        }, 0);
      }
    }

    rawInput.addEventListener('focus', function () {
      if (!helperState.rawValue) {
        helperState.rawDisplayValue = rawInput.value;
      }
    });

    rawInput.addEventListener('beforeinput', function (event) {
      var inputType = event && event.inputType ? String(event.inputType) : '';
      if (inputType.indexOf('insert') === 0 || inputType.indexOf('delete') === 0) {
        resetForEntry(false);
      }
    });

    rawInput.addEventListener('paste', function (event) {
      stopBubble(event);
      resetForEntry(false);
      var pasted = '';
      try {
        pasted = event.clipboardData ? event.clipboardData.getData('text') : '';
      } catch (error) {}

      if (pasted) {
        event.preventDefault();
        rawInput.value = pasted;
        helperState.rawValue = pasted;
        scheduleRawCheck(pasted);
        return;
      }

      setTimeout(function () {
        helperState.rawValue = rawInput.value;
        scheduleRawCheck(rawInput.value);
      }, 0);
    });

    rawInput.addEventListener('input', function () {
      helperState.rawValue = rawInput.value;
      scheduleRawCheck(rawInput.value);
    });
  }

  function ensureDom() {
    ensureStyle();
    var line = document.getElementById(LINE_ID);
    if (!line) {
      line = document.createElement('div');
      line.id = LINE_ID;
      line.setAttribute('aria-live', 'polite');
      line.setAttribute('title', 'HK quick access and raw result status.');
      document.body.appendChild(line);
    }

    if (line.dataset.hkBuilt !== '1') {
      line.dataset.hkBuilt = '1';
      line.textContent = '';

      var shell = makeElement('div', 'hk-shell');
      var row = makeElement('div', 'hk-row');
      var button = makeElement('a', 'hk-button');
      button.textContent = 'HK';
      button.setAttribute('target', '_blank');
      button.setAttribute('rel', 'noopener noreferrer');
      button.setAttribute('title', 'فتح النتيجة الرسمية');

      var rawInput = makeElement('input', 'hk-raw', RAW_INPUT_ID);
      rawInput.type = 'text';
      rawInput.spellcheck = false;
      rawInput.autocomplete = 'off';
      rawInput.placeholder = 'صلى على النبى ❤️';
      rawInput.title = 'صلى على النبى ❤️';

      var status = makeElement('div', 'hk-status', RAW_STATUS_ID);
      var muted = makeElement('span', 'hk-muted');

      row.appendChild(button);
      row.appendChild(rawInput);
      shell.appendChild(row);
      shell.appendChild(status);
      line.appendChild(shell);
      line.appendChild(muted);

      bindButton(button);
      bindRawInput(rawInput);
    }

    helperState.dom = {
      line: line,
      shell: line.querySelector('.hk-shell'),
      row: line.querySelector('.hk-row'),
      button: line.querySelector('.hk-button'),
      rawInput: line.querySelector('#' + RAW_INPUT_ID),
      status: line.querySelector('#' + RAW_STATUS_ID),
      muted: line.querySelector('.hk-muted')
    };

    return helperState.dom;
  }

  function getAnchorRect() {
    var search = document.getElementById(SEARCH_ID);
    if (search && typeof search.getBoundingClientRect === 'function') {
      var searchRect = search.getBoundingClientRect();
      if (searchRect && searchRect.width > 0 && searchRect.height > 0) return searchRect;
    }

    var input = document.getElementById(INPUT_ID);
    if (input && typeof input.getBoundingClientRect === 'function') {
      var inputRect = input.getBoundingClientRect();
      if (inputRect && inputRect.width > 0 && inputRect.height > 0) return inputRect;
    }

    return null;
  }

  function emitLineState(reason) {
    try {
      var line = helperState.dom && helperState.dom.line ? helperState.dom.line : document.getElementById(LINE_ID);
      window.dispatchEvent(new CustomEvent('mndo:hk-line-state', {
        detail: {
          reason: reason || '',
          visible: !!(line && line.classList && line.classList.contains('is-visible'))
        }
      }));
    } catch (error) {}
  }

  function positionLine() {
    var dom = ensureDom();
    var rect = getAnchorRect();
    if (!dom || !dom.line || !rect) return;
    if (dom.line.dataset.mndoTopChromeLocked === '1') return;

    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 320;
    var viewportCap = Math.max(280, viewportWidth - 24);
    var width = Math.min(Math.max(rect.width, 320), 560, viewportCap);
    var pageX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    var pageY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

    dom.line.style.left = Math.round(pageX + rect.left + ((rect.width - width) / 2)) + 'px';
    dom.line.style.top = Math.round(pageY + rect.bottom + 10) + 'px';
    dom.line.style.width = Math.round(width) + 'px';
  }

  function showLine() {
    var dom = ensureDom();
    dom.line.classList.add('is-visible');
    dom.line.setAttribute('aria-hidden', 'false');
    positionLine();
    emitLineState('show');
  }

  function hideLine() {
    var dom = ensureDom();
    dom.line.classList.remove('is-visible');
    dom.line.setAttribute('aria-hidden', 'true');
    emitLineState('hide');
  }

  function showMuted(text) {
    var dom = ensureDom();
    dom.shell.classList.add('hk-hidden');
    dom.muted.classList.remove('hk-hidden');
    dom.muted.style.display = 'inline';
    dom.muted.innerHTML = text;
    showLine();
  }

  function showReady(parsed) {
    var dom = ensureDom();
    dom.shell.classList.remove('hk-hidden');
    dom.muted.classList.add('hk-hidden');
    dom.muted.style.display = 'none';
    dom.button.setAttribute('href', parsed.apiUrl);
    dom.button.setAttribute('data-popup-url', parsed.apiUrl);

    if (helperState.rawDisplayValue) {
      dom.rawInput.value = helperState.rawDisplayValue;
    } else if (document.activeElement !== dom.rawInput && dom.rawInput.value !== helperState.rawValue) {
      dom.rawInput.value = helperState.rawValue;
    }

    dom.rawInput.classList.remove('is-ok', 'is-bad', 'is-warn');
    if (helperState.rawDisplayTone) {
      dom.rawInput.classList.add(helperState.rawDisplayTone);
    }

    dom.status.className = 'hk-status' + (helperState.statusTone ? ' ' + helperState.statusTone : '');
    dom.status.textContent = helperState.statusText;
    showLine();
  }

  function validStamp(value) {
    var text = String(value || '').trim();
    if (!text || text === '0000-00-00 00:00:00') return '';
    return text;
  }

  function setRawStatus(text, tone) {
    helperState.statusText = text || '';
    helperState.statusTone = tone || '';
    helperState.rawDisplayValue = text || '';
    helperState.rawDisplayTone = tone || '';
    var dom = ensureDom();
    dom.status.className = 'hk-status' + (helperState.statusTone ? ' ' + helperState.statusTone : '');
    dom.status.textContent = helperState.statusText;
    dom.rawInput.classList.remove('is-ok', 'is-bad', 'is-warn');
    if (helperState.rawDisplayTone) {
      dom.rawInput.classList.add(helperState.rawDisplayTone);
    }
    if (helperState.rawDisplayValue) {
      dom.rawInput.value = helperState.rawDisplayValue;
    } else if (!helperState.rawValue) {
      dom.rawInput.value = '';
    }
  }

  function clearRawState() {
    helperState.rawValue = '';
    helperState.rawDisplayValue = '';
    helperState.rawDisplayTone = '';
    helperState.statusText = '';
    helperState.statusTone = '';
    clearTimeout(helperState.rawTimer);
    helperState.rawToken += 1;

    if (helperState.dom && helperState.dom.rawInput) {
      helperState.dom.rawInput.value = '';
      helperState.dom.rawInput.classList.remove('is-ok', 'is-bad', 'is-warn');
    }
    setRawStatus('', '');
  }

  function applyRawPayload(payload) {
    var statusValue = payload && Object.prototype.hasOwnProperty.call(payload, 'status') ? Number(payload.status) : NaN;

    if (statusValue === 0) {
      return setRawStatus('الرقم لا ينتمي إلى حياة كريمة', 'is-bad');
    }

    if (statusValue === 1) {
      var data = payload && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : {};
      var pieces = ['تابع لحياة كريمة'];
      if (data.id) pieces.push('ID ' + String(data.id));
      var stamp = validStamp(data.last_edit_on) || validStamp(data.added_on);
      if (stamp) pieces.push('التوقيت: ' + stamp);
      return setRawStatus(pieces.join(' • '), 'is-ok');
    }

    return setRawStatus('تعذر تحديد حالة الرابط الخام', 'is-warn');
  }

  function tryParseJsonCandidate(value) {
    var text = String(value || '').trim();
    if (!text) return { ok: false };

    var candidates = [text];
    var firstBrace = text.indexOf('{');
    var lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      candidates.push(text.slice(firstBrace, lastBrace + 1));
    }

    for (var i = 0; i < candidates.length; i += 1) {
      try {
        var parsed = JSON.parse(candidates[i]);
        if (parsed && typeof parsed === 'object') {
          return { ok: true, value: parsed };
        }
      } catch (error) {}
    }

    return { ok: false };
  }

  function looksLikeUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
  }

  async function tryFetchPayload(url) {
    var response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Accept': 'application/json,text/plain,*/*' }
    });

    var text = await response.text();
    var parsed = tryParseJsonCandidate(text);

    if (!response.ok) {
      throw new Error(parsed.ok ? JSON.stringify(parsed.value) : (text || ('HTTP ' + response.status)));
    }

    if (!parsed.ok) {
      throw new Error(text || 'Invalid JSON');
    }

    return parsed.value;
  }

  async function fetchRawPayloadFromUrl(url) {
    var directError = null;

    try {
      return await tryFetchPayload(url);
    } catch (error) {
      directError = error;
    }

    try {
      return await tryFetchPayload('/api/hk-raw?url=' + encodeURIComponent(url));
    } catch (proxyError) {
      throw proxyError || directError || new Error('Fetch failed');
    }
  }

  async function inspectRawValue(rawValue, token) {
    var trimmed = String(rawValue || '').trim();
    if (!trimmed) {
      if (token !== helperState.rawToken) return;
      setRawStatus('', '');
      return;
    }

    var direct = tryParseJsonCandidate(trimmed);
    if (direct.ok) {
      if (token !== helperState.rawToken) return;
      applyRawPayload(direct.value);
      return;
    }

    if (!looksLikeUrl(trimmed)) {
      if (token !== helperState.rawToken) return;
      setRawStatus('تعذر قراءة البيانات الخام', 'is-warn');
      return;
    }

    if (token !== helperState.rawToken) return;
    setRawStatus('جارٍ فحص الرابط الخام…', 'is-warn');

    try {
      var payload = await fetchRawPayloadFromUrl(trimmed);
      if (token !== helperState.rawToken) return;
      applyRawPayload(payload);
    } catch (error) {
      if (token !== helperState.rawToken) return;
      var recovered = tryParseJsonCandidate(error && error.message ? error.message : '');
      if (recovered.ok) {
        applyRawPayload(recovered.value);
        return;
      }
      setRawStatus('تعذر قراءة الرابط الخام', 'is-warn');
    }
  }

  function scheduleRawCheck(value) {
    helperState.rawValue = String(value || '');
    helperState.rawDisplayValue = '';
    helperState.rawDisplayTone = '';
    clearTimeout(helperState.rawTimer);
    helperState.rawToken += 1;
    var token = helperState.rawToken;

    if (helperState.dom && helperState.dom.rawInput) {
      helperState.dom.rawInput.classList.remove('is-ok', 'is-bad', 'is-warn');
    }

    if (!helperState.rawValue.trim()) {
      setRawStatus('', '');
      return;
    }

    helperState.rawTimer = setTimeout(function () {
      inspectRawValue(helperState.rawValue, token);
    }, 240);
  }

  function renderFromInput() {
    var input = document.getElementById(INPUT_ID);
    if (!input) {
      hideLine();
      return;
    }

    var parsed = parseLandline(input.value);
    if (parsed.state === 'empty' || parsed.state === 'partial') {
      clearRawState();
      hideLine();
      return;
    }

    if (parsed.state === 'unknown') {
      clearRawState();
      showMuted('حياه كريمة: كود أرضي غير معروف');
      return;
    }

    if (parsed.landline.length < 4) {
      clearRawState();
      hideLine();
      return;
    }

    var nextIdentity = parsed.areaCode + '-' + parsed.landline;
    if (helperState.identity !== nextIdentity) {
      helperState.identity = nextIdentity;
      clearRawState();
    }

    showReady(parsed);
  }

  function scheduleRender() {
    clearTimeout(helperState.renderTimer);
    helperState.renderTimer = setTimeout(renderFromInput, 90);
  }

  function unbindCurrentInput() {
    var input = helperState.boundInput;
    if (!input || !helperState.inputListeners.length) return;
    helperState.inputListeners.forEach(function (pair) {
      try {
        input.removeEventListener(pair.name, pair.handler);
      } catch (error) {}
    });
    helperState.inputListeners = [];
    helperState.boundInput = null;
  }

  function bindInput() {
    var input = document.getElementById(INPUT_ID);
    if (!input) return false;
    if (helperState.boundInput === input) return true;

    unbindCurrentInput();
    helperState.boundInput = input;

    ['input', 'keyup', 'change'].forEach(function (eventName) {
      var handler = scheduleRender;
      input.addEventListener(eventName, handler, { passive: true });
      helperState.inputListeners.push({ name: eventName, handler: handler });
    });

    scheduleRender();
    return true;
  }

  function openPopup(url) {
    try {
      var w = 760;
      var h = 230;
      var dualLeft = window.screenLeft !== undefined ? window.screenLeft : screen.left;
      var dualTop = window.screenTop !== undefined ? window.screenTop : screen.top;
      var width = window.innerWidth || document.documentElement.clientWidth || screen.width;
      var height = window.innerHeight || document.documentElement.clientHeight || screen.height;
      var left = Math.max(0, dualLeft + ((width - w) / 2));
      var top = Math.max(0, dualTop + ((height - h) / 2));
      var popup = window.open(url, 'hkOfficialJsonPopup', 'toolbar=no,location=yes,status=no,menubar=no,scrollbars=yes,resizable=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);
      if (popup && typeof popup.focus === 'function') popup.focus();
    } catch (error) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function startObserver() {
    if (helperState.observer || typeof MutationObserver === 'undefined') return;

    helperState.observer = new MutationObserver(function () {
      var rebound = bindInput();
      if (rebound) {
        positionLine();
      }
    });

    try {
      helperState.observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (error) {}
  }

  function bindWindowEvents() {
    if (helperState.resizeBound) return;
    helperState.resizeBound = true;
    window.addEventListener('resize', positionLine, { passive: true });
  }

  function init() {
    ensureDom();
    bindInput();
    bindWindowEvents();
    startObserver();
    positionLine();
    emitLineState('init');
    setTimeout(function () { bindInput(); positionLine(); emitLineState('settle-200'); }, 200);
    setTimeout(function () { bindInput(); positionLine(); emitLineState('settle-600'); }, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
