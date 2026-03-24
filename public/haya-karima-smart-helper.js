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
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + LINE_ID + '{display:none;position:fixed;left:50%;transform:translateX(-50%);min-width:300px;max-width:520px;height:16px;line-height:16px;font-size:12px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:9998;pointer-events:auto;user-select:text;color:rgba(255,255,255,.88);text-shadow:0 1px 2px rgba(0,0,0,.55);}',
      '#' + LINE_ID + '.is-visible{display:block;}',
      '#' + LINE_ID + ' .hk-ready{color:rgba(255,255,255,.88);}',
      '#' + LINE_ID + ' .hk-link{color:#ffffff;text-decoration:none;border-bottom:1px dotted rgba(255,255,255,.35);}',
      '#' + LINE_ID + ' .hk-link:hover{border-bottom-color:rgba(255,255,255,.8);}',
      '#' + LINE_ID + ' .hk-link.is-manual{color:#ffd27a;}',
      '#' + LINE_ID + ' .hk-copy{cursor:pointer;color:#d7efff;text-decoration:none;border-bottom:1px dotted rgba(215,239,255,.35);margin-right:8px;}',
      '#' + LINE_ID + ' .hk-copy:hover{border-bottom-color:rgba(215,239,255,.8);}',
      '#' + LINE_ID + ' .hk-muted{color:rgba(255,255,255,.72);}',
      '#' + LINE_ID + ' .hk-sep{color:rgba(255,255,255,.45);padding:0 4px;}'
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

    var label = escapeHtml(parsed.areaCode + ' - ' + parsed.landline);
    var url = escapeHtml(parsed.apiUrl);
    var html = '<span class="hk-ready">حياه كريمة الرسمي</span><span class="hk-sep">•</span><span class="hk-ready">' + label + '</span><span class="hk-sep">•</span><a class="hk-copy" href="#" data-copy-url="' + url + '">نسخ الرابط</a><a class="hk-link is-manual" href="' + url + '" data-popup-url="' + url + '" target="_blank" rel="noopener noreferrer">فتح النتيجة الرسمية</a>';
    setLineHTML(html, true);
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
        return;
      }
      var copyUrl = target.getAttribute && target.getAttribute('data-copy-url');
      if (copyUrl) {
        event.preventDefault();
        copyText(copyUrl);
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
