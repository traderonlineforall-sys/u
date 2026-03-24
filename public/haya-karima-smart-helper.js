(function () {
  var STYLE_ID = 'hk-smart-helper-style';
  var LINE_ID = 'hkSmartInlineLine';
  var INPUT_ID = 'arabicNumber';
  var PROXY_PATH = '/api/haya-karima';
  var DIRECT_API_BASE = 'https://10.19.44.2/ireport/api/haya_karima_api.php';

  // Longest-first matching; values are the area code without the leading zero.
  var CODES = ['97','96','95','93','92','88','86','84','82','69','68','66','65','64','62','57','55','50','48','47','46','45','40','18','13','3','2'];

  var cache = Object.create(null);
  var inflight = Object.create(null);
  var lastValue = null;
  var lastKey = null;
  var activeToken = 0;

  function toEnglishDigits(value) {
    var map = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
    return String(value || '').replace(/[٠-٩]/g, function (d) { return map[d] || d; });
  }

  function digitsOnly(value) {
    return toEnglishDigits(value).replace(/\D/g, '');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeAddedOn(value) {
    if (!value || String(value).indexOf('0000-00-00') === 0) return '';
    return String(value);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.search-container{position:relative !important;}',
      '#' + LINE_ID + '{display:none;position:absolute;left:50%;top:calc(100% + 6px);transform:translateX(-50%);width:180%;max-width:720px;min-height:16px;line-height:16px;font-size:12px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:10001;pointer-events:none;user-select:text;color:rgba(255,255,255,.88);text-shadow:0 1px 2px rgba(0,0,0,.55);}',
      '#' + LINE_ID + '.hk-loading{color:rgba(255,255,255,.82);}',
      '#' + LINE_ID + ' .hk-success{color:#9ff7ab;font-weight:600;}',
      '#' + LINE_ID + ' .hk-fail{color:#ff7e7e;font-weight:600;}',
      '#' + LINE_ID + ' .hk-muted{color:rgba(255,255,255,.78);}',
      '#' + LINE_ID + ' .hk-added{color:rgba(255,255,255,.68);font-size:11px;padding-left:8px;}',
      '@media (max-width: 900px){#' + LINE_ID + '{width:190%;max-width:92vw;font-size:11px;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function getHost() {
    return document.querySelector('.search-container') || document.body;
  }

  function ensureLine() {
    ensureStyle();
    var line = document.getElementById(LINE_ID);
    if (!line) {
      line = document.createElement('div');
      line.id = LINE_ID;
      line.setAttribute('aria-live', 'polite');
      line.setAttribute('title', 'Haya Karima check result');
    }
    var host = getHost();
    if (line.parentNode !== host) host.appendChild(line);
    return line;
  }

  function setVisible(line, visible) {
    line.style.setProperty('display', visible ? 'block' : 'none', 'important');
    line.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
    line.style.setProperty('opacity', visible ? '1' : '0', 'important');
  }

  function setLineHTML(html, visible, className) {
    var line = ensureLine();
    line.innerHTML = html || '';
    line.className = className || '';
    setVisible(line, !!visible);
  }

  function hideLine() {
    setLineHTML('', false, '');
  }

  function parseLandline(rawInput) {
    var digits = digitsOnly(rawInput);
    if (!digits) return { state: 'empty' };

    // The tool may remove the first 0 from the full number; accept both forms.
    var candidates = [digits];
    if (digits.charAt(0) !== '0') candidates.push('0' + digits);

    for (var c = 0; c < candidates.length; c += 1) {
      var candidate = candidates[c];
      for (var i = 0; i < CODES.length; i += 1) {
        var strippedArea = CODES[i];
        var fullArea = '0' + strippedArea;
        if (candidate.indexOf(fullArea) === 0) {
          var landline = candidate.slice(fullArea.length);
          if (!landline) return { state: 'partial', raw: candidate, areaCode: fullArea, strippedArea: strippedArea };
          return {
            state: 'ready',
            raw: candidate,
            strippedArea: strippedArea,
            areaCode: fullArea,
            landline: landline,
            key: fullArea + '|' + landline,
            sourceDigits: digits
          };
        }
      }
    }

    return { state: 'unknown', raw: digits };
  }

  function buildQuery(parsed) {
    return 'area_code=' + encodeURIComponent(parsed.areaCode) + '&landline=' + encodeURIComponent(parsed.landline);
  }

  function renderUnknown(rawDigits) {
    setLineHTML('<span class="hk-muted">حياه كريمة: كود أرضي غير معروف</span><span class="hk-added">' + escapeHtml(rawDigits || '') + '</span>', true, 'hk-muted');
  }

  function renderLoading(parsed) {
    var label = escapeHtml(parsed.areaCode + ' - ' + parsed.landline);
    setLineHTML('<span class="hk-muted">حياه كريمة: جاري الفحص...</span><span class="hk-added">' + label + '</span>', true, 'hk-loading');
  }

  function renderResult(parsed, payload) {
    var label = escapeHtml(parsed.areaCode + ' - ' + parsed.landline);
    var addedOn = normalizeAddedOn(payload && payload.data && payload.data.added_on);

    if (payload && Number(payload.status) === 1) {
      var successHtml = '<span class="hk-success">number ( ' + label + ' ) belongs to Haya Karima</span>';
      if (addedOn) successHtml += '<span class="hk-added">added on : ' + escapeHtml(addedOn) + '</span>';
      setLineHTML(successHtml, true, 'hk-success');
      return;
    }

    if (payload && Number(payload.status) === 0) {
      setLineHTML('<span class="hk-fail">number ( ' + label + ' ) does not exist</span>', true, 'hk-fail');
      return;
    }

    var message = payload && payload.message ? escapeHtml(payload.message) : 'تعذر فحص حياه كريمة من هذه النسخة';
    setLineHTML('<span class="hk-muted">حياه كريمة: ' + message + '</span><span class="hk-added">' + label + '</span>', true, 'hk-muted');
  }

  function safeJsonParse(text) {
    try { return JSON.parse(text); } catch (error) { return null; }
  }

  function fetchJson(url, options) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 2600) : null;
    var requestOptions = { method: 'GET', cache: 'no-store', credentials: 'omit', headers: { 'Accept': 'application/json, text/plain, */*' } };
    if (controller) requestOptions.signal = controller.signal;
    if (options) for (var key in options) if (Object.prototype.hasOwnProperty.call(options, key)) requestOptions[key] = options[key];
    return fetch(url, requestOptions).then(function (response) {
      return response.text().then(function (text) { return { ok: response.ok, status: response.status, text: text }; });
    }).finally(function () { if (timeoutId) clearTimeout(timeoutId); });
  }

  function requestHayaKarima(parsed) {
    if (cache[parsed.key]) return Promise.resolve(cache[parsed.key]);
    if (inflight[parsed.key]) return inflight[parsed.key];

    var query = buildQuery(parsed);
    var sameOriginUrl = PROXY_PATH + '?' + query;
    var directUrl = DIRECT_API_BASE + '?' + query;

    inflight[parsed.key] = fetchJson(sameOriginUrl)
      .then(function (result) {
        var payload = safeJsonParse(result.text);
        if (result.ok && payload && (Number(payload.status) === 0 || Number(payload.status) === 1)) return payload;
        return fetchJson(directUrl, { mode: 'cors' }).then(function (directResult) {
          var directPayload = safeJsonParse(directResult.text);
          if (directResult.ok && directPayload && (Number(directPayload.status) === 0 || Number(directPayload.status) === 1)) return directPayload;
          if (payload) return payload;
          if (directPayload) return directPayload;
          throw new Error('unable to parse haya karima response');
        });
      })
      .catch(function (error) {
        return { status: -1, message: (error && error.message) ? error.message : 'request failed' };
      })
      .then(function (payload) {
        cache[parsed.key] = payload;
        delete inflight[parsed.key];
        return payload;
      }, function (error) {
        delete inflight[parsed.key];
        throw error;
      });

    return inflight[parsed.key];
  }

  function processValue(rawValue) {
    var parsed = parseLandline(rawValue);

    if (parsed.state === 'empty') {
      lastKey = null;
      hideLine();
      return;
    }

    if (parsed.state === 'unknown') {
      lastKey = 'unknown|' + parsed.raw;
      renderUnknown(parsed.raw);
      return;
    }

    if (parsed.state === 'partial' || !parsed.landline || parsed.landline.length < 4) {
      lastKey = null;
      hideLine();
      return;
    }

    // Always show immediate feedback even before the network resolves.
    renderLoading(parsed);

    if (lastKey === parsed.key && cache[parsed.key]) {
      renderResult(parsed, cache[parsed.key]);
      return;
    }

    lastKey = parsed.key;
    var token = ++activeToken;
    requestHayaKarima(parsed).then(function (payload) {
      if (token !== activeToken) return;
      renderResult(parsed, payload);
    });
  }

  function bindInput(input) {
    if (!input || input.dataset.hkSmartBound === '1') return;
    input.dataset.hkSmartBound = '1';
    var handler = function () {
      var current = String(input.value || '');
      if (current !== lastValue) {
        lastValue = current;
        processValue(current);
      }
    };
    ['input', 'keyup', 'change', 'blur'].forEach(function (eventName) {
      input.addEventListener(eventName, handler, { passive: true });
    });
  }

  function tick() {
    var input = document.getElementById(INPUT_ID);
    ensureLine();
    if (!input) return;
    bindInput(input);
    var current = String(input.value || '');
    if (current !== lastValue) {
      lastValue = current;
      processValue(current);
    }
  }

  function init() {
    ensureLine();
    tick();
    setInterval(tick, 300);
    try {
      var observer = new MutationObserver(function () { tick(); });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    } catch (error) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
