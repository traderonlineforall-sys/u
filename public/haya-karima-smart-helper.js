(function () {
  var STYLE_ID = 'hk-smart-helper-style';
  var LINE_ID = 'hkSmartLine';
  var INPUT_ID = 'arabicNumber';
  var CODES = [
    '97','96','95','93','92','88','86','84','82','69','68','66','65','64','62','57',
    '55','50','48','47','46','45','40','18','13','3','2'
  ];

  function toEnglishDigits(value) {
    var map = {
      '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'
    };
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

    if (!strippedArea) {
      return { state: 'unknown', raw: raw };
    }

    var landline = raw.slice(strippedArea.length);
    if (!landline) {
      return { state: 'partial', raw: raw, strippedArea: strippedArea };
    }

    var areaCode = '0' + strippedArea;
    var apiUrl = 'https://10.19.44.2/ireport/api/haya_karima_api.php?area_code=' +
      encodeURIComponent(areaCode) + '&landline=' + encodeURIComponent(landline);

    return {
      state: 'ready',
      raw: raw,
      strippedArea: strippedArea,
      areaCode: areaCode,
      landline: landline,
      apiUrl: apiUrl
    };
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.search-container{ position: relative !important; }',
      '#' + LINE_ID + '{',
      '  display:none;',
      '  position:absolute;',
      '  left:0;',
      '  right:0;',
      '  top:calc(100% + 6px);',
      '  height:15px;',
      '  line-height:15px;',
      '  font-size:12px;',
      '  text-align:center;',
      '  white-space:nowrap;',
      '  overflow:hidden;',
      '  text-overflow:ellipsis;',
      '  z-index:2;',
      '  pointer-events:auto;',
      '  user-select:text;',
      '}',
      '#' + LINE_ID + '.is-visible{ display:block; }',
      '#' + LINE_ID + ' .hk-ready{ color: rgba(255,255,255,.84); }',
      '#' + LINE_ID + ' .hk-link{ color: rgba(255,255,255,.92); text-decoration:none; border-bottom:1px dotted rgba(255,255,255,.25); }',
      '#' + LINE_ID + ' .hk-link:hover{ color:#ffffff; border-bottom-color:rgba(255,255,255,.55); }',
      '#' + LINE_ID + ' .hk-muted{ color: rgba(255,255,255,.62); }',
      '#' + LINE_ID + ' .hk-sep{ color: rgba(255,255,255,.45); padding: 0 4px; }'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureLine() {
    ensureStyle();
    var line = document.getElementById(LINE_ID);
    if (line) return line;

    var container = document.querySelector('.search-container');
    if (!container) return null;

    line = document.createElement('div');
    line.id = LINE_ID;
    line.setAttribute('aria-live', 'polite');
    line.setAttribute('title', 'Direct inline reading from Haya Karima is blocked by browser/network policy in this hosted version. This line prepares the official lookup safely from your number only.');
    container.appendChild(line);
    return line;
  }

  function setLineHTML(html, visible) {
    var line = ensureLine();
    if (!line) return;
    line.innerHTML = html || '';
    line.className = visible ? 'is-visible' : '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderFromInput() {
    var input = document.getElementById(INPUT_ID);
    if (!input) {
      setLineHTML('', false);
      return;
    }

    var parsed = parseLandline(input.value);

    if (parsed.state === 'empty' || parsed.state === 'partial') {
      setLineHTML('', false);
      return;
    }

    if (parsed.state === 'unknown') {
      setLineHTML('<span class="hk-muted">حياه كريمة: كود أرضي غير معروف</span>', true);
      return;
    }

    if (parsed.landline.length < 4) {
      setLineHTML('', false);
      return;
    }

    var label = escapeHtml(parsed.areaCode + ' - ' + parsed.landline);
    var url = escapeHtml(parsed.apiUrl);
    var html = '' +
      '<span class="hk-ready">حياه كريمة الرسمي</span>' +
      '<span class="hk-sep">•</span>' +
      '<span class="hk-ready">' + label + '</span>' +
      '<span class="hk-sep">•</span>' +
      '<a class="hk-link" href="' + url + '" target="_blank" rel="noopener noreferrer" title="Open the official Haya Karima result for ' + label + '">فتح النتيجة</a>';

    setLineHTML(html, true);
  }

  function scheduleRender() {
    clearTimeout(scheduleRender._t);
    scheduleRender._t = setTimeout(renderFromInput, 260);
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

  function init() {
    bind();
    setTimeout(bind, 350);
    setTimeout(bind, 900);

    try {
      var observer = new MutationObserver(function () {
        bind();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
