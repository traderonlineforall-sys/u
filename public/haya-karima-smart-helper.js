(function () {
  var STYLE_ID = 'hk-smart-helper-style';
  var LINE_ID = 'hkSmartFloatingLine';
  var INPUT_ID = 'arabicNumber';
  var SEARCH_ID = 'searchInput';
  var RAW_INPUT_ID = 'hkRawApiInput';
  var CODES = ['97','96','95','93','92','88','86','84','82','69','68','66','65','64','62','57','55','50','48','47','46','45','40','18','13','3','2'];

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
      '#' + LINE_ID + '{display:none;position:fixed;left:50%;transform:translateX(-50%);min-width:300px;max-width:520px;min-height:30px;z-index:9998;pointer-events:auto;user-select:text;}',
      '#' + LINE_ID + '.is-visible{display:block;}',
      '#' + LINE_ID + ' .hk-shell{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:nowrap;white-space:nowrap;}',
      '#' + LINE_ID + ' .hk-pill{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:24px;padding:0 10px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);color:#fff;font-size:12px;font-weight:700;letter-spacing:.4px;text-decoration:none;box-shadow:0 4px 12px rgba(0,0,0,.18);backdrop-filter:blur(2px);cursor:pointer;}',
      '#' + LINE_ID + ' .hk-pill:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.34);}',
      '#' + LINE_ID + ' .hk-raw{width:138px;height:24px;padding:0 9px;border-radius:7px;border:1px solid rgba(255,255,255,.2);background:rgba(9,17,29,.34);color:#fff;font-size:11px;outline:none;box-shadow:0 4px 12px rgba(0,0,0,.15);}',
      '#' + LINE_ID + ' .hk-raw::placeholder{color:rgba(255,255,255,.55);}',
      '#' + LINE_ID + ' .hk-raw:focus{border-color:rgba(255,255,255,.42);background:rgba(9,17,29,.5);}',
      '#' + LINE_ID + ' .hk-status{display:inline-flex;align-items:center;max-width:300px;height:24px;padding:0 10px;border-radius:999px;font-size:11px;overflow:hidden;text-overflow:ellipsis;border:1px solid transparent;box-shadow:0 4px 12px rgba(0,0,0,.12);}',
      '#' + LINE_ID + ' .hk-status.is-success{color:#dff7e8;background:rgba(18,108,61,.24);border-color:rgba(103,232,169,.26);}',
      '#' + LINE_ID + ' .hk-status.is-error{color:#ffdada;background:rgba(145,29,29,.26);border-color:rgba(248,113,113,.28);}',
      '#' + LINE_ID + ' .hk-status.is-warning{color:rgba(255,255,255,.86);background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.18);}',
      '#' + LINE_ID + ' .hk-meta{font-weight:600;}',
      '#' + LINE_ID + ' .hk-sep{padding:0 5px;opacity:.55;}',
      '@media (max-width: 640px){#' + LINE_ID + '{max-width:94vw;}#' + LINE_ID + ' .hk-shell{gap:6px;}#' + LINE_ID + ' .hk-raw{width:112px;}#' + LINE_ID + ' .hk-status{max-width:160px;}}'
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
    line.setAttribute('title', 'HK quick access');
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
    line.style.left = centerX + 'px';
    line.style.top = (rect.bottom + 10) + 'px';
    line.style.width = Math.min(Math.max(rect.width, 300), 520) + 'px';
  }

  function setLineHTML(html, visible) {
    var line = ensureLine();
    if (!line) return;
    line.innerHTML = html || '';
    line.className = visible ? 'is-visible' : '';
    positionLine();
    wireLineActions();
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

  function getRawInputValue() {
    var rawInput = document.getElementById(RAW_INPUT_ID);
    return rawInput ? rawInput.value : '';
  }

  function setRawStatus(status) {
    window.__hkRawStatus = status || null;
    scheduleRender();
  }

  function parseJsonSafe(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function buildStatusFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return { type: 'warning', text: 'تعذر قراءة نتيجة HK' };
    if (String(payload.status) === '0') {
      return { type: 'error', text: 'الرقم لا ينتمي إلى حياة كريمة' };
    }
    if (String(payload.status) === '1') {
      var data = payload.data || {};
      var id = data.id ? String(data.id) : '—';
      var addedOn = data.added_on ? String(data.added_on) : '—';
      return {
        type: 'success',
        html: 'تابع لحياة كريمة<span class="hk-sep">•</span><span class="hk-meta">ID: ' + escapeHtml(id) + '</span><span class="hk-sep">•</span><span class="hk-meta">' + escapeHtml(addedOn) + '</span>'
      };
    }
    return { type: 'warning', text: 'نتيجة HK غير معروفة' };
  }

  function handleRawPayloadText(text) {
    var normalized = String(text || '').trim();
    if (!normalized) {
      setRawStatus(null);
      return;
    }

    var direct = parseJsonSafe(normalized);
    if (direct) {
      setRawStatus(buildStatusFromPayload(direct));
      return;
    }

    if (/^https?:\/\//i.test(normalized)) {
      setRawStatus({ type: 'warning', text: 'جاري قراءة نتيجة HK...' });
      fetch(normalized, { credentials: 'include' })
        .then(function (response) { return response.text(); })
        .then(function (bodyText) {
          var parsed = parseJsonSafe(bodyText);
          if (!parsed) throw new Error('invalid-json');
          setRawStatus(buildStatusFromPayload(parsed));
        })
        .catch(function () {
          setRawStatus({ type: 'error', text: 'تعذر قراءة الرابط الخام' });
        });
      return;
    }

    var embedded = normalized.match(/\{[\s\S]*\}$/);
    if (embedded) {
      var parsedEmbedded = parseJsonSafe(embedded[0]);
      if (parsedEmbedded) {
        setRawStatus(buildStatusFromPayload(parsedEmbedded));
        return;
      }
    }

    setRawStatus({ type: 'error', text: 'صيغة raw غير صالحة' });
  }

  function getStatusHtml() {
    var status = window.__hkRawStatus;
    if (!status) return '';
    var klass = status.type === 'success' ? 'is-success' : (status.type === 'error' ? 'is-error' : 'is-warning');
    var content = status.html || escapeHtml(status.text || '');
    return '<span class="hk-status ' + klass + '">' + content + '</span>';
  }

  function buildBaseHtml(popupUrl, extraHtml) {
    var safeUrl = popupUrl ? escapeHtml(popupUrl) : '';
    return '<div class="hk-shell"><a class="hk-pill" href="' + safeUrl + '" data-popup-url="' + safeUrl + '" target="_blank" rel="noopener noreferrer" title="Open HK result">HK</a><input id="' + RAW_INPUT_ID + '" class="hk-raw" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Raw HK" title="Paste raw JSON or raw link" />' + (extraHtml || '') + '</div>';
  }

  function restoreRawInput() {
    var rawInput = document.getElementById(RAW_INPUT_ID);
    if (!rawInput) return;
    var saved = window.__hkRawDraft || '';
    if (rawInput.value !== saved) rawInput.value = saved;
  }

  function renderFromInput() {
    var input = document.getElementById(INPUT_ID);
    if (!input) return setLineHTML('', false);

    var parsed = parseLandline(input.value);
    if (parsed.state === 'empty' || parsed.state === 'partial') return setLineHTML('', false);
    if (parsed.state === 'unknown') {
      setLineHTML(buildBaseHtml('', '<span class="hk-status is-warning">حياه كريمة: كود أرضي غير معروف</span>'), true);
      restoreRawInput();
      return;
    }
    if (parsed.landline.length < 4) return setLineHTML('', false);

    setLineHTML(buildBaseHtml(parsed.apiUrl, getStatusHtml()), true);
    restoreRawInput();
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
      window.__hkRawDraft = target.value || '';
      if (!target.value) setRawStatus(null);
    });

    line.addEventListener('change', function (event) {
      var target = event.target;
      if (!target || target.id !== RAW_INPUT_ID) return;
      window.__hkRawDraft = target.value || '';
      handleRawPayloadText(target.value);
    });

    line.addEventListener('keydown', function (event) {
      var target = event.target;
      if (!target || target.id !== RAW_INPUT_ID) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        window.__hkRawDraft = target.value || '';
        handleRawPayloadText(target.value);
      }
    });

    line.addEventListener('blur', function (event) {
      var target = event.target;
      if (!target || target.id !== RAW_INPUT_ID) return;
      window.__hkRawDraft = target.value || '';
      if (target.value) handleRawPayloadText(target.value);
    }, true);
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
