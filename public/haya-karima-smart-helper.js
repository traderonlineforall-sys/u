(function () {
  var STYLE_ID = 'hk-smart-helper-style';
  var LINE_ID = 'hkSmartFloatingLine';
  var INPUT_ID = 'arabicNumber';
  var SEARCH_ID = 'searchInput';
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
    // create a style tag only once
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    /*
     * The floating line originally had a fixed height of 16px and used overflow
     * clipping.  For the manual HK helper we relax those constraints so the
     * additional form elements can be shown without truncation.  We keep
     * positioning and sizing similar to the original but allow the height to
     * grow based on its contents and make the overflow visible.
     */
    style.textContent = [
      '#' + LINE_ID + '{display:none;position:fixed;left:50%;transform:translateX(-50%);min-width:300px;max-width:520px;padding:2px 4px;height:auto;line-height:16px;font-size:12px;text-align:center;white-space:nowrap;overflow:visible;z-index:9998;pointer-events:auto;user-select:text;color:rgba(255,255,255,.88);text-shadow:0 1px 2px rgba(0,0,0,.55);}',
      '#' + LINE_ID + '.is-visible{display:block;}',
      // style for the ready text (not used in manual HK display but kept for completeness)
      '#' + LINE_ID + ' .hk-ready{color:rgba(255,255,255,.88);}',
      '#' + LINE_ID + ' .hk-link{color:#ffffff;text-decoration:none;border-bottom:1px dotted rgba(255,255,255,.35);}',
      '#' + LINE_ID + ' .hk-link:hover{border-bottom-color:rgba(255,255,255,.8);}',
      '#' + LINE_ID + ' .hk-link.is-manual{color:#ffd27a;}',
      // muted state for unknown area code
      '#' + LINE_ID + ' .hk-muted{color:rgba(255,255,255,.72);}',
      '#' + LINE_ID + ' .hk-sep{color:rgba(255,255,255,.45);padding:0 4px;}',
      // small input used for manual API JSON.  It inherits the floating line font-size
      '#' + LINE_ID + ' .hk-input{margin-left:6px;padding:1px 4px;font-size:12px;border-radius:4px;border:1px solid rgba(255,255,255,.35);background-color:rgba(255,255,255,0.15);color:#ffffff;width:150px;position:relative;z-index:2;pointer-events:auto;}',
      '#' + LINE_ID + ' .hk-input::placeholder{color:rgba(255,255,255,.55);}',
      // result area for manual JSON parsing
      '#' + LINE_ID + ' .hk-manual-result{margin-left:8px;font-weight:bold;}',
      // success and error colouring
      '#' + LINE_ID + ' .hk-error{color:#ff6b6b;}',
      '#' + LINE_ID + ' .hk-success{color:#6acd6a;}'
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
    line.setAttribute('title', 'Opens the official Haya Karima result directly, without browser-blocked inline fetch.');
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

  function copyText(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function renderFromInput() {
    var input = document.getElementById(INPUT_ID);
    if (!input) return setLineHTML('', false);

    var parsed = parseLandline(input.value);
    if (parsed.state === 'empty' || parsed.state === 'partial') return setLineHTML('', false);
    if (parsed.state === 'unknown') return setLineHTML('<span class="hk-muted">حياه كريمة: كود أرضي غير معروف</span>', true);
    if (parsed.landline.length < 4) return setLineHTML('', false);

    var url = escapeHtml(parsed.apiUrl);
    /*
     * For the manual HK helper we simplify the floating line.  We hide the
     * original "حياه كريمة" label and the landline/area code number and
     * instead present a minimal clickable indicator "HK".  Clicking it
     * continues to open the official API URL in a centred popup.  A small
     * adjacent input allows the user to paste a raw JSON result from the API.
     * When a valid JSON value is provided it is parsed and a status message is
     * displayed: a red error if the status is 0, otherwise a green success
     * including the record id and timestamp.  The separators and styling are
     * defined in ensureStyle.
     */
    var html = '';
    html += '<a class="hk-link is-manual" href="' + url + '" data-popup-url="' + url + '" target="_blank" rel="noopener noreferrer">HK</a>';
    html += '<input type="text" class="hk-input" id="hkRawInput" placeholder="أدخل النتيجة الخام هنا" tabindex="0" />';
    html += '<span id="hkManualResult" class="hk-manual-result"></span>';
    setLineHTML(html, true);
    // Attach handler for the manual input when rendering completes
    attachManualInputHandler();
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
      /*
       * If the click originated on the manual JSON input (or its children)
       * we bail out early.  Even though we stop propagation on the input
       * itself, other listeners might still fire on this element.  We
       * explicitly ignore clicks on the input so it can receive focus and
       * paste operations without interference from this handler.
       */
      if (target.tagName === 'INPUT' || (target.closest && target.closest('.hk-input'))) {
        return;
      }
      var popupUrl = target.getAttribute && target.getAttribute('data-popup-url');
      if (popupUrl) {
        event.preventDefault();
        openPopup(popupUrl);
        return;
      }
      var copyUrl = target.getAttribute && target.getAttribute('data-copy-url');
      if (copyUrl) {
        event.preventDefault();
        copyText(copyUrl);
      }
    });
  }

  /**
   * Attaches a one-off handler to the manual JSON input.  This handler
   * listens for input events and attempts to parse the provided value as
   * JSON.  If the structure matches the expected Haya Karima API response
   * it will update a nearby result span to indicate whether the record
   * belongs to the programme.  A status of 0 results in a red error
   * message; a status of 1 displays a green success message along with the
   * record id and added_on timestamp.  Invalid or empty JSON clears the
   * message.  This function should be invoked after setLineHTML when the
   * floating line is showing a manual input.
   */
  function attachManualInputHandler() {
    var line = ensureLine();
    if (!line) return;
    var inputEl = line.querySelector('#hkRawInput');
    var resultEl = line.querySelector('#hkManualResult');
    if (!inputEl || !resultEl) return;
    // Avoid attaching multiple listeners when re-rendering
    if (inputEl.dataset.hkManualBound === '1') return;
    inputEl.dataset.hkManualBound = '1';
    // Stop propagation of pointer/click/mouse events from the input so that the
    // enclosing line's click handler does not interfere with focusing or pasting.
    // We use multiple event types because different browsers may fire different
    // sequences when focusing or pasting (e.g. pointerdown, mousedown, mouseup).
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(function(evt) {
      inputEl.addEventListener(evt, function(e) {
        // Stop the event from bubbling up the DOM and cancel any click
        // listeners on ancestor elements.  We use stopImmediatePropagation to
        // prevent other handlers at this level from running.
        e.stopImmediatePropagation();
        e.stopPropagation();
      });
    });

    inputEl.addEventListener('input', function () {
      var value = (inputEl.value || '').trim();
      // Reset message when no input
      if (!value) {
        resultEl.innerHTML = '';
        return;
      }
      try {
        var obj = JSON.parse(value);
        // status==0: not part of HK
        if (obj && typeof obj.status !== 'undefined' && obj.status == 0) {
          resultEl.innerHTML = '<span class="hk-error">الرقم لا ينتمى الى حياه كريمه</span>';
        } else if (obj && obj.status == 1) {
          // status 1: record exists
          var id = '';
          var added = '';
          if (obj.data && typeof obj.data === 'object') {
            id = escapeHtml(obj.data.id || '');
            added = escapeHtml(obj.data.added_on || '');
          }
          var parts = [];
          parts.push('<span class="hk-success">تابع لحياه كريمه</span>');
          if (id) parts.push('<span class="hk-sep">•</span><span class="hk-success">ID: ' + id + '</span>');
          if (added) parts.push('<span class="hk-sep">•</span><span class="hk-success">' + added + '</span>');
          resultEl.innerHTML = parts.join('');
        } else {
          // Unknown status or structure: clear
          resultEl.innerHTML = '';
        }
      } catch (e) {
        // If JSON.parse fails, clear the result
        resultEl.innerHTML = '';
      }
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
