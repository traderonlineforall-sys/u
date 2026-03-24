(function () {
  var STYLE_ID = 'hk-smart-helper-style';
  var LINE_ID = 'hkSmartFloatingLine';
  var INPUT_ID = 'arabicNumber';
  var SEARCH_ID = 'searchInput';
  var RAW_INPUT_ID = 'hkRawSourceInput';
  var RAW_STATUS_ID = 'hkRawSourceStatus';
  var CODES = ['97','96','95','93','92','88','86','84','82','69','68','66','65','64','62','57','55','50','48','47','46','45','40','18','13','3','2'];

  var helperState = {
    identity: '',
    rawValue: '',
    statusText: '',
    statusTone: ''
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

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + LINE_ID + '{display:none;position:fixed;left:50%;transform:translateX(-50%);min-width:300px;max-width:560px;font-size:12px;text-align:center;z-index:9998;pointer-events:auto;user-select:text;color:rgba(255,255,255,.88);text-shadow:0 1px 2px rgba(0,0,0,.55);white-space:normal;overflow:visible;}',
      '#' + LINE_ID + '.is-visible{display:block;}',
      '#' + LINE_ID + ' .hk-shell{display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;}',
      '#' + LINE_ID + ' .hk-row{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;}',
      '#' + LINE_ID + ' .hk-button{display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:24px;padding:0 11px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);box-shadow:0 10px 22px rgba(0,0,0,.22);text-decoration:none;color:#ffffff;font-weight:700;letter-spacing:.08em;flex:0 0 auto;}',
      '#' + LINE_ID + ' .hk-button:hover{border-color:rgba(255,255,255,.32);background:rgba(255,255,255,.12);}',
      '#' + LINE_ID + ' .hk-button:focus{outline:none;box-shadow:0 0 0 3px rgba(255,255,255,.10),0 10px 22px rgba(0,0,0,.22);}',
      '#' + LINE_ID + ' .hk-raw{flex:1 1 auto;min-width:0;width:100%;height:24px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(10,14,24,.56);box-shadow:inset 0 1px 0 rgba(255,255,255,.05);color:rgba(255,255,255,.94);font:inherit;direction:ltr;text-align:left;}',
      '#' + LINE_ID + ' .hk-raw::placeholder{color:rgba(255,255,255,.48);}',
      '#' + LINE_ID + ' .hk-raw:focus{outline:none;border-color:rgba(255,255,255,.28);box-shadow:0 0 0 3px rgba(255,255,255,.08);}',
      '#' + LINE_ID + ' .hk-status{display:block;max-width:100%;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#' + LINE_ID + ' .hk-status:empty{display:none;}',
      '#' + LINE_ID + ' .hk-status.is-ok{color:#d7ffe7;}',
      '#' + LINE_ID + ' .hk-status.is-bad{color:#ff8686;font-weight:700;}',
      '#' + LINE_ID + ' .hk-status.is-warn{color:rgba(255,255,255,.72);}',
      '#' + LINE_ID + ' .hk-muted{color:rgba(255,255,255,.72);}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureLine() {
    ensureStyle();
    var line = document.getElementById(LINE_ID);
    if (line) return line;
    line = document.createElement('div');
    line.id = LINE_ID;
    line.setAttribute('aria-live', 'polite');
    line.setAttribute('title', 'HK quick access and raw result status.');
    document.body.appendChild(line);
    return line;
  }

  function getAnchorRect() {
    var search = document.getElementById(SEARCH_ID);
    if (search && typeof search.getBoundingClientRect === 'function') {
      var r = search.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) return r;
    }
    var input = document.getElementById(INPUT_ID);
    if (input && typeof input.getBoundingClientRect === 'function') {
      return input.getBoundingClientRect();
    }
    return null;
  }

  function positionLine() {
    var line = ensureLine();
    var rect = getAnchorRect();
    if (!line || !rect) return;
    var centerX = rect.left + (rect.width / 2);
    var viewportCap = Math.max(280, (window.innerWidth || document.documentElement.clientWidth || 320) - 24);
    line.style.left = centerX + 'px';
    line.style.top = (rect.bottom + 10) + 'px';
    line.style.width = Math.min(Math.max(rect.width, 320), 560, viewportCap) + 'px';
  }

  function setLineHTML(html, visible) {
    var line = ensureLine();
    if (!line) return;
    line.innerHTML = html || '';
    line.className = visible ? 'is-visible' : '';
    positionLine();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
    } catch (e) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function clearRawState() {
    helperState.rawValue = '';
    helperState.statusText = '';
    helperState.statusTone = '';
    clearTimeout(scheduleRawCheck._t);
    scheduleRawCheck._token = (scheduleRawCheck._token || 0) + 1;
  }

  function renderReadyLine(parsed) {
    var url = escapeHtml(parsed.apiUrl);
    var rawValue = escapeHtml(helperState.rawValue);
    var tone = helperState.statusTone ? ' ' + helperState.statusTone : '';
    var statusText = escapeHtml(helperState.statusText);
    var html = '' +
      '<div class="hk-shell">' +
        '<div class="hk-row">' +
          '<a class="hk-button" href="' + url + '" data-popup-url="' + url + '" target="_blank" rel="noopener noreferrer" title="فتح النتيجة الرسمية">HK</a>' +
          '<input id="' + RAW_INPUT_ID + '" class="hk-raw" type="text" spellcheck="false" autocomplete="off" value="' + rawValue + '" placeholder="الصق الرابط الخام أو JSON" title="الصق الرابط الخام أو JSON" />' +
        '</div>' +
        '<div id="' + RAW_STATUS_ID + '" class="hk-status' + tone + '">' + statusText + '</div>' +
      '</div>';
    setLineHTML(html, true);
  }

  function validStamp(value) {
    var text = String(value || '').trim();
    if (!text || text === '0000-00-00 00:00:00') return '';
    return text;
  }

  function setRawStatus(text, tone) {
    helperState.statusText = text || '';
    helperState.statusTone = tone || '';
    var statusNode = document.getElementById(RAW_STATUS_ID);
    if (statusNode) {
      statusNode.className = 'hk-status' + (helperState.statusTone ? ' ' + helperState.statusTone : '');
      statusNode.textContent = helperState.statusText;
    }
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
      } catch (e) {}
    }

    return { ok: false };
  }

  function looksLikeUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
  }

  async function fetchRawPayloadFromUrl(url) {
    var response = await fetch('/api/hk-raw?url=' + encodeURIComponent(url), {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });

    var text = await response.text();
    var parsed = tryParseJsonCandidate(text);
    if (!response.ok) {
      throw new Error(parsed.ok ? JSON.stringify(parsed.value) : (text || 'Fetch failed'));
    }
    if (!parsed.ok) {
      throw new Error(text || 'Invalid JSON');
    }
    return parsed.value;
  }

  async function inspectRawValue(rawValue, token) {
    var trimmed = String(rawValue || '').trim();
    if (!trimmed) {
      setRawStatus('', '');
      return;
    }

    var direct = tryParseJsonCandidate(trimmed);
    if (direct.ok) {
      if (token !== scheduleRawCheck._token) return;
      applyRawPayload(direct.value);
      return;
    }

    if (!looksLikeUrl(trimmed)) {
      if (token !== scheduleRawCheck._token) return;
      setRawStatus('تعذر قراءة البيانات الخام', 'is-warn');
      return;
    }

    if (token !== scheduleRawCheck._token) return;
    setRawStatus('جارٍ فحص الرابط الخام…', 'is-warn');

    try {
      var payload = await fetchRawPayloadFromUrl(trimmed);
      if (token !== scheduleRawCheck._token) return;
      applyRawPayload(payload);
    } catch (error) {
      if (token !== scheduleRawCheck._token) return;
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
    clearTimeout(scheduleRawCheck._t);
    scheduleRawCheck._token = (scheduleRawCheck._token || 0) + 1;
    var token = scheduleRawCheck._token;

    if (!helperState.rawValue.trim()) {
      setRawStatus('', '');
      return;
    }

    scheduleRawCheck._t = setTimeout(function () {
      inspectRawValue(helperState.rawValue, token);
    }, 280);
  }

  function renderFromInput() {
    var input = document.getElementById(INPUT_ID);
    if (!input) return setLineHTML('', false);

    var parsed = parseLandline(input.value);
    if (parsed.state === 'empty' || parsed.state === 'partial') {
      clearRawState();
      return setLineHTML('', false);
    }
    if (parsed.state === 'unknown') {
      clearRawState();
      return setLineHTML('<span class="hk-muted">حياه كريمة: كود أرضي غير معروف</span>', true);
    }
    if (parsed.landline.length < 4) {
      clearRawState();
      return setLineHTML('', false);
    }

    var nextIdentity = parsed.areaCode + '-' + parsed.landline;
    if (helperState.identity !== nextIdentity) {
      helperState.identity = nextIdentity;
      clearRawState();
    }

    renderReadyLine(parsed);
  }

  function scheduleRender() {
    clearTimeout(scheduleRender._t);
    scheduleRender._t = setTimeout(renderFromInput, 180);
  }

  function bind() {
    var input = document.getElementById(INPUT_ID);
    if (!input) return false;
    if (input.dataset.hkSmartBound === '1') {
      scheduleRender();
      return true;
    }
    input.dataset.hkSmartBound = '1';
    ['input', 'keyup', 'change', 'blur'].forEach(function (eventName) {
      input.addEventListener(eventName, scheduleRender, { passive: true });
    });
    scheduleRender();
    return true;
  }

  function wireLineActions() {
    var line = ensureLine();
    if (!line || line.dataset.hkActionsBound === '1') return;
    line.dataset.hkActionsBound = '1';

    line.addEventListener('click', function (event) {
      var target = event.target;
      if (!target) return;
      var popupUrl = target.getAttribute && target.getAttribute('data-popup-url');
      if (popupUrl) {
        event.preventDefault();
        openPopup(popupUrl);
      }
    });

    line.addEventListener('input', function (event) {
      var target = event.target;
      if (!target || target.id !== RAW_INPUT_ID) return;
      scheduleRawCheck(target.value);
    });

    line.addEventListener('paste', function (event) {
      var target = event.target;
      if (!target || target.id !== RAW_INPUT_ID) return;
      setTimeout(function () {
        scheduleRawCheck(target.value);
      }, 0);
    });
  }

  function init() {
    wireLineActions();
    bind();
    positionLine();
    setTimeout(bind, 350);
    setTimeout(bind, 900);
    window.addEventListener('resize', positionLine, { passive: true });
    window.addEventListener('scroll', positionLine, { passive: true });
    try {
      var observer = new MutationObserver(function () { bind(); positionLine(); });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
