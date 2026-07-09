/*
  Eid Theme Toggle (Premium / Safe)
  ---------------------------------
  - Keeps the original tool layout intact.
  - Uses an icon-only luxury toggle instead of visible text.
  - Only enables/disables the Eid stylesheet.
  - Preserves existing hidden admin/UA07 interactions.
*/
const LS_THEME_OFF = "sr_eid_theme_off";
const LS_THEME_MODE = "sr_visual_theme_mode";
const TOGGLE_BTN_ID = "EID_TOGGLE_BTN";
const LEGACY_THEME_LINK_ID = "ua07LegacyThemeLink";
const LEGACY_THEME_HREF = "ua07-20-theme.css?v=ua07legacy7-transparent-menu-layer";
const AHLY_THEME_LINK_ID = "ahlyPremiumThemeLink";
const AHLY_THEME_HREF = "ahly-premium-theme.css?v=ahly-v13-transparent-menu-layer";
const EGYPT_THEME_LINK_ID = "egyptWorldCupThemeLink";
const EGYPT_THEME_HREF = "egypt-worldcup-theme.css?v=egyptwc-layer-v10";
const THEME_EID = "eid";
const THEME_LEGACY = "legacy";
const THEME_AHLY = "ahly";
const THEME_EGYPT = "egypt";
const THEME_OFF = "off";

function getThemeLink(){
  return document.getElementById("eidThemeLink") || document.querySelector('link[href$="eid-theme.css"], link[href*="eid-theme.css"]');
}
function getLegacyThemeLink(){
  let link = document.getElementById(LEGACY_THEME_LINK_ID);
  if (link) return link;
  try {
    link = document.createElement("link");
    link.id = LEGACY_THEME_LINK_ID;
    link.rel = "stylesheet";
    link.href = LEGACY_THEME_HREF;
    link.disabled = true;
    (document.head || document.documentElement).appendChild(link);
    return link;
  } catch {
    return null;
  }
}
function getAhlyThemeLink(){
  let link = document.getElementById(AHLY_THEME_LINK_ID);
  if (link) return link;
  try {
    link = document.createElement("link");
    link.id = AHLY_THEME_LINK_ID;
    link.rel = "stylesheet";
    link.href = AHLY_THEME_HREF;
    link.disabled = true;
    (document.head || document.documentElement).appendChild(link);
    return link;
  } catch {
    return null;
  }
}
function getEgyptThemeLink(){
  let link = document.getElementById(EGYPT_THEME_LINK_ID);
  if (link) return link;
  try {
    link = document.createElement("link");
    link.id = EGYPT_THEME_LINK_ID;
    link.rel = "stylesheet";
    link.href = EGYPT_THEME_HREF;
    link.disabled = true;
    (document.head || document.documentElement).appendChild(link);
    return link;
  } catch {
    return null;
  }
}
function getThemeMode(){
  try {
    const saved = localStorage.getItem(LS_THEME_MODE);
    if (saved === THEME_EID || saved === THEME_LEGACY || saved === THEME_AHLY || saved === THEME_EGYPT || saved === THEME_OFF) return saved;
    return localStorage.getItem(LS_THEME_OFF) === "1" ? THEME_OFF : THEME_EID;
  } catch {
    return THEME_EID;
  }
}
function setThemeMode(mode){
  const safeMode = (mode === THEME_EID || mode === THEME_LEGACY || mode === THEME_AHLY || mode === THEME_EGYPT || mode === THEME_OFF) ? mode : THEME_EID;
  try {
    localStorage.setItem(LS_THEME_MODE, safeMode);
    localStorage.setItem(LS_THEME_OFF, safeMode === THEME_OFF ? "1" : "0");
  } catch {}
}
function getNextThemeMode(){
  const mode = getThemeMode();
  if (mode === THEME_EID) return THEME_LEGACY;
  if (mode === THEME_LEGACY) return THEME_AHLY;
  if (mode === THEME_AHLY) return THEME_EGYPT;
  if (mode === THEME_EGYPT) return THEME_OFF;
  return THEME_EID;
}
function isThemeOff(){
  return getThemeMode() === THEME_OFF;
}
function setThemeOff(v){
  setThemeMode(v ? THEME_OFF : THEME_EID);
}


function ensureToggleBaseStyle(){
  if (document.getElementById("EID_TOGGLE_BASE_STYLE")) return;
  const style = document.createElement("style");
  style.id = "EID_TOGGLE_BASE_STYLE";
  style.textContent = `
    #UA07_SECRET_ENVELOPE_WRAP { z-index: 9002; gap: 6px; }
    .eid-toggle-btn {
      position: relative;
      pointer-events: auto;
      width: 38px !important;
      min-width: 38px !important;
      height: 28px !important;
      padding: 0 !important;
      border-radius: 10px !important;
      border: 1px solid rgba(255,255,255,.22) !important;
      background:
        radial-gradient(circle at 26% 22%, rgba(255,255,255,.26), rgba(255,255,255,0) 34%),
        linear-gradient(180deg, rgba(255,248,220,.14), rgba(246,211,122,.14) 48%, rgba(255,155,125,.14) 100%) !important;
      box-shadow: 0 10px 22px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.20) !important;
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      outline: none;
      transform: translateZ(0);
      transition: transform .16s ease, filter .16s ease, box-shadow .16s ease, border-color .16s ease;
      opacity: 1 !important;
      appearance: none;
      -webkit-appearance: none;
    }
    .eid-toggle-btn:hover {
      transform: translateY(-1px);
      filter: brightness(1.04);
      border-color: rgba(255,238,196,.32) !important;
      box-shadow: 0 14px 26px rgba(0,0,0,.44), inset 0 1px 0 rgba(255,255,255,.22) !important;
    }
    .eid-toggle-btn:active { transform: translateY(0) scale(.98); }
    .eid-toggle-btn.is-off {
      filter: saturate(.92) brightness(.98);
      opacity: 1 !important;
      background:
        radial-gradient(circle at 26% 22%, rgba(255,255,255,.22), rgba(255,255,255,0) 36%),
        linear-gradient(180deg, rgba(13,20,39,.96), rgba(23,34,63,.96) 52%, rgba(14,19,36,.97) 100%) !important;
      border-color: rgba(255,236,190,.34) !important;
      box-shadow: 0 10px 22px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.18), inset 0 0 0 1px rgba(255,223,150,.06) !important;
    }
    .eid-toggle-btn.is-legacy {
      filter: saturate(1.05) brightness(1.02);
      background:
        radial-gradient(circle at 28% 20%, rgba(255,255,255,.32), rgba(255,255,255,0) 36%),
        linear-gradient(180deg, rgba(44,44,48,.98), rgba(12,12,14,.98) 52%, rgba(95,0,0,.92) 100%) !important;
      border-color: rgba(255,255,255,.30) !important;
      box-shadow: 0 10px 22px rgba(0,0,0,.44), inset 0 1px 0 rgba(255,255,255,.20), inset 0 -1px 0 rgba(255,0,0,.22) !important;
    }
    .eid-toggle-btn.is-egypt {
      background:
        radial-gradient(circle at 28% 18%, rgba(255,255,255,.34), rgba(255,255,255,0) 36%),
        linear-gradient(180deg, rgba(255,234,165,.98), rgba(163,105,35,.96) 50%, rgba(12,8,7,.98) 100%) !important;
      border-color: rgba(255,218,132,.56) !important;
      box-shadow: 0 12px 26px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.34), 0 0 17px rgba(255,202,101,.16) !important;
    }
    .eid-toggle-btn.is-egypt .eid-toggle-orb { background: linear-gradient(180deg,#dc1f2c,#fff5df 50%,#050505 100%) !important; }
    .eid-toggle-btn .eid-toggle-shell { position: relative; display:flex; align-items:center; justify-content:center; width:100%; height:100%; }
    .eid-toggle-btn .eid-toggle-shell::before {
      content: ""; position:absolute; width:18px; height:18px; border-radius:999px;
      background: radial-gradient(circle at 30% 30%, rgba(255,248,222,.34), rgba(255,229,154,.12) 46%, rgba(255,229,154,0) 72%);
      box-shadow: inset 0 0 0 1px rgba(255,240,196,.12); opacity:.9;
    }
    .eid-toggle-btn .eid-toggle-glyph { width:16px; height:16px; filter: drop-shadow(0 3px 6px rgba(0,0,0,.30)); opacity:1 !important; }
    .eid-toggle-btn .eid-toggle-orb {
      position:absolute; right:4px; top:4px; width:6px; height:6px; border-radius:50%;
      background: linear-gradient(180deg,#fff7d6,#f3d37a);
      box-shadow: 0 0 0 1px rgba(4,8,19,.40), 0 0 8px rgba(243,211,122,.45); opacity:1 !important;
    }
    .eid-toggle-btn.is-off .eid-toggle-glyph { opacity: 1 !important; filter: drop-shadow(0 2px 5px rgba(0,0,0,.32)); }
    .eid-toggle-btn.is-off .eid-toggle-orb {
      opacity: .96 !important; background: linear-gradient(180deg,#ffe8a8,#ebb650);
      box-shadow: 0 0 0 1px rgba(4,8,19,.42), 0 0 7px rgba(243,211,122,.32);
    }
    .eid-toggle-btn::before {
      content:""; position:absolute; inset:1px; border-radius:inherit;
      background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,0)); pointer-events:none;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function ensureAhlyTransparentMenuLayer(){
  if (document.getElementById('MNDO_AHLY_TRANSPARENT_MENU_LAYER')) return;
  const css = `
    /* Runtime visual-only override for the inline Ahly V9 layer in index.html.
       It intentionally touches colors/background/border/shadow only. */
    html.ahly-premium-theme-live body .tabcontent .dropdown .dropbtn,
    html.ahly-premium-theme-live body .tabcontent .navbar a,
    html.ahly-premium-theme-live body .tabcontent #singlelink,
    html.ahly-premium-theme-live body .dropdown .dropbtn,
    html.ahly-premium-theme-live body .navbar a,
    html.ahly-premium-theme-live body #singlelink {
      color: rgba(255, 235, 184, 0.98) !important;
      -webkit-text-fill-color: rgba(255, 235, 184, 0.98) !important;
      background: transparent !important;
      background-color: transparent !important;
      border-color: transparent !important;
      text-shadow: 0 1px 2px rgba(0,0,0,0.98), 0 0 8px rgba(145,0,0,0.34), 0 0 7px rgba(255,214,116,0.16) !important;
      box-shadow: none !important;
      filter: none !important;
    }
    html.ahly-premium-theme-live body .tabcontent .dropdown .dropbtn::before,
    html.ahly-premium-theme-live body .tabcontent .dropdown .dropbtn::after,
    html.ahly-premium-theme-live body .tabcontent .navbar a::before,
    html.ahly-premium-theme-live body .tabcontent .navbar a::after,
    html.ahly-premium-theme-live body .tabcontent #singlelink::before,
    html.ahly-premium-theme-live body .tabcontent #singlelink::after,
    html.ahly-premium-theme-live body .dropdown .dropbtn::before,
    html.ahly-premium-theme-live body .dropdown .dropbtn::after,
    html.ahly-premium-theme-live body .navbar a::before,
    html.ahly-premium-theme-live body .navbar a::after,
    html.ahly-premium-theme-live body #singlelink::before,
    html.ahly-premium-theme-live body #singlelink::after {
      opacity: 0 !important;
      background: none !important;
      background-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      filter: none !important;
    }
    html.ahly-premium-theme-live body .dropdown:hover .dropbtn,
    html.ahly-premium-theme-live body .dropdown:focus-within .dropbtn,
    html.ahly-premium-theme-live body .dropdown.open .dropbtn,
    html.ahly-premium-theme-live body .dropdown.active .dropbtn,
    html.ahly-premium-theme-live body .navbar a:hover,
    html.ahly-premium-theme-live body .navbar a:focus,
    html.ahly-premium-theme-live body #singlelink:hover,
    html.ahly-premium-theme-live body #singlelink:focus {
      color: #fffdf1 !important;
      -webkit-text-fill-color: #fffdf1 !important;
      background: transparent !important;
      background-color: transparent !important;
      border-color: transparent !important;
      text-shadow: 0 1px 2px rgba(0,0,0,1), 0 0 10px rgba(255,213,112,0.24), 0 0 14px rgba(205,0,0,0.18) !important;
      box-shadow: none !important;
      filter: none !important;
    }
    html.ahly-premium-theme-live body .sub-dropdown,
    html.ahly-premium-theme-live body .sub-dropdown[style],
    html.ahly-premium-theme-live body .dropdown-content a,
    html.ahly-premium-theme-live body .sub-dropdown-content a,
    html.ahly-premium-theme-live body .sub-dropdown > a,
    html.ahly-premium-theme-live body #searchResults.search-results a,
    html.ahly-premium-theme-live body #searchResults a,
    html.ahly-premium-theme-live body .search-results a {
      color: rgba(255, 235, 184, 0.98) !important;
      -webkit-text-fill-color: rgba(255, 235, 184, 0.98) !important;
      background: transparent !important;
      background-color: transparent !important;
      border-color: rgba(255,213,112,0.10) !important;
      text-shadow: 0 1px 2px rgba(0,0,0,0.96) !important;
      box-shadow: none !important;
      filter: none !important;
    }
    html.ahly-premium-theme-live body .sub-dropdown:hover,
    html.ahly-premium-theme-live body .sub-dropdown:hover[style],
    html.ahly-premium-theme-live body .dropdown-content a:hover,
    html.ahly-premium-theme-live body .dropdown-content a:focus,
    html.ahly-premium-theme-live body .sub-dropdown-content a:hover,
    html.ahly-premium-theme-live body .sub-dropdown-content a:focus,
    html.ahly-premium-theme-live body .sub-dropdown:hover > a,
    html.ahly-premium-theme-live body #searchResults.search-results a:hover,
    html.ahly-premium-theme-live body #searchResults a:hover,
    html.ahly-premium-theme-live body #searchResults.search-results a:focus,
    html.ahly-premium-theme-live body #searchResults a:focus,
    html.ahly-premium-theme-live body #searchResults.search-results a.highlight,
    html.ahly-premium-theme-live body #searchResults a.highlight,
    html.ahly-premium-theme-live body .search-results a:hover,
    html.ahly-premium-theme-live body .search-results a:focus,
    html.ahly-premium-theme-live body .search-results a.highlight {
      color: #fffdf1 !important;
      -webkit-text-fill-color: #fffdf1 !important;
      background: transparent !important;
      background-color: transparent !important;
      border-color: rgba(255,229,164,0.18) !important;
      text-shadow: 0 1px 2px rgba(0,0,0,1), 0 0 10px rgba(255,213,112,0.20) !important;
      box-shadow: none !important;
      filter: none !important;
    }
  `;
  const style = document.createElement('style');
  style.id = 'MNDO_AHLY_TRANSPARENT_MENU_LAYER';
  style.textContent = css;
  try {
    (document.body || document.documentElement).appendChild(style);
  } catch {
    try { (document.head || document.documentElement).appendChild(style); } catch {}
  }
}

function ensureDecorLayer(){
  if (document.getElementById('EID_DECOR_LAYER')) return;
  const host = document.body || document.documentElement;
  if (!host) return;
  const layer = document.createElement('div');
  layer.id = 'EID_DECOR_LAYER';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = [
    '<span class="eid-art eid-art-ribbon"></span>',
    '<span class="eid-art eid-art-center"></span>',
    '<span class="eid-art eid-art-left"></span>',
    '<span class="eid-art eid-art-right"></span>'
  ].join('');
  host.appendChild(layer);
}
function applyThemeState(){
  ensureDecorLayer();
  ensureAhlyTransparentMenuLayer();
  const mode = getThemeMode();
  const eidLink = getThemeLink();
  const legacyLink = getLegacyThemeLink();
  const ahlyLink = getAhlyThemeLink();
  const egyptLink = getEgyptThemeLink();
  if(eidLink) eidLink.disabled = mode !== THEME_EID;
  if(legacyLink) legacyLink.disabled = mode !== THEME_LEGACY;
  if(ahlyLink) ahlyLink.disabled = mode !== THEME_AHLY;
  if(egyptLink) egyptLink.disabled = mode !== THEME_EGYPT;
  document.documentElement.classList.toggle('eid-theme-live', mode === THEME_EID);
  document.documentElement.classList.toggle('ua07-legacy-theme-live', mode === THEME_LEGACY);
  document.documentElement.classList.toggle('ahly-premium-theme-live', mode === THEME_AHLY);
  document.documentElement.classList.toggle('egypt-worldcup-theme-live', mode === THEME_EGYPT);
  updateToggleUi();
}
function findEnvelopeWrap(){
  return document.getElementById("UA07_SECRET_ENVELOPE_WRAP");
}
function buildToggleMarkup(){
  return `
    <span class="eid-toggle-shell" aria-hidden="true">
      <svg viewBox="0 0 64 64" class="eid-toggle-glyph" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id="eidGemGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fff6cf"></stop>
            <stop offset="48%" stop-color="#f4cf72"></stop>
            <stop offset="100%" stop-color="#ffab73"></stop>
          </linearGradient>
          <linearGradient id="eidGemStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fff8e0"></stop>
            <stop offset="100%" stop-color="#ffd8b0"></stop>
          </linearGradient>
        </defs>
        <path d="M37.8 11.5c-8.1 1.7-13.9 8.7-13.9 17.2 0 9.4 7.9 17.1 17.4 17.1 1.9 0 3.9-.3 5.7-.9-2.7 2.8-6.5 4.5-10.9 4.5-9.4 0-17-7.6-17-17 0-7.5 4.8-14 11.9-16.2 2.1-.7 4.4-.9 6.8-.7z" fill="url(#eidGemGradient)"></path>
        <path d="M44 18l1.7 4.1 4.1 1.7-4.1 1.7-1.7 4.1-1.7-4.1-4.1-1.7 4.1-1.7 1.7-4.1zm-18.2 15.4 1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1 1.1-2.6z" fill="url(#eidGemGradient)"></path>
        <circle cx="32" cy="32" r="29" fill="none" stroke="url(#eidGemStroke)" stroke-width="1.45" opacity=".58"></circle>
      </svg>
      <span class="eid-toggle-orb"></span>
    </span>
  `;
}
function ensureToggleButton(){
  const wrap = findEnvelopeWrap();
  if(!wrap) return null;
  let btn = document.getElementById(TOGGLE_BTN_ID);
  if(btn) return btn;

  btn = document.createElement("button");
  btn.id = TOGGLE_BTN_ID;
  btn.type = "button";
  btn.className = "eid-toggle-btn";
  btn.innerHTML = buildToggleMarkup();
  btn.title = "ثيم العيد";
  btn.setAttribute('aria-label', 'تبديل ثيم العيد');
  btn.addEventListener("click", function(e){
    try { e.preventDefault(); e.stopPropagation(); } catch {}
    setThemeMode(getNextThemeMode());
    applyThemeState();
  });

  try {
    const pill = document.getElementById("UA07_ONLINE_COUNT");
    const env = document.getElementById("UA07_SECRET_ENVELOPE");
    if (pill && pill.parentNode === wrap) wrap.insertBefore(btn, pill.nextSibling || env || null);
    else if (env && env.parentNode === wrap) wrap.insertBefore(btn, env);
    else wrap.appendChild(btn);
  } catch {
    try { wrap.appendChild(btn); } catch {}
  }
  return btn;
}
function updateToggleUi(){
  const btn = document.getElementById(TOGGLE_BTN_ID);
  if(!btn) return;
  const mode = getThemeMode();
  const off = mode === THEME_OFF;
  const legacy = mode === THEME_LEGACY;
  const ahly = mode === THEME_AHLY;
  const egypt = mode === THEME_EGYPT;
  btn.classList.toggle("is-off", off);
  btn.classList.toggle("is-legacy", legacy);
  btn.classList.toggle("is-ahly", ahly);
  btn.classList.toggle("is-egypt", egypt);
  btn.setAttribute("aria-pressed", off ? "false" : "true");
  if (legacy) {
    btn.title = 'ثيم الزمالك 20 مفعل - اضغط لتشغيل ثيم الأهلي الفاخر';
    btn.setAttribute('aria-label', 'ثيم الزمالك 20 مفعل - اضغط لتشغيل ثيم الأهلي الفاخر');
  } else if (ahly) {
    btn.title = 'ثيم الأهلي الفاخر مفعل - اضغط لتشغيل ثيم مصر كأس العالم';
    btn.setAttribute('aria-label', 'ثيم الأهلي الفاخر مفعل - اضغط لتشغيل ثيم مصر كأس العالم');
  } else if (egypt) {
    btn.title = 'ثيم مصر كأس العالم مفعل - اضغط لإيقاف الثيم';
    btn.setAttribute('aria-label', 'ثيم مصر كأس العالم مفعل - اضغط لإيقاف الثيم');
  } else if (off) {
    btn.title = 'الثيم متوقف - اضغط لتشغيل ثيم العيد';
    btn.setAttribute('aria-label', 'الثيم متوقف - اضغط لتشغيل ثيم العيد');
  } else {
    btn.title = 'ثيم العيد مفعل - اضغط لتشغيل ثيم الزمالك 20';
    btn.setAttribute('aria-label', 'ثيم العيد مفعل - اضغط لتشغيل ثيم الزمالك 20');
  }
}
function fixUa07PointerEvents(logoEl){
  try {
    if(!logoEl) return;
    logoEl.style.pointerEvents = "auto";
    const svg = logoEl.querySelector("svg");
    if(svg) svg.style.pointerEvents = "auto";
  } catch {}
}


function boot(){
  ensureToggleBaseStyle();
  ensureDecorLayer();
  ensureAhlyTransparentMenuLayer();
  applyThemeState();
  let tries = 0;
  const t = setInterval(function(){
    tries++;
    const logo = document.getElementById("MNDO_UA07_LOGO3") || document.getElementById("MNDO_UA07_LOGO");
    if (logo) fixUa07PointerEvents(logo);
    if (findEnvelopeWrap()) {
      ensureToggleButton();
      updateToggleUi();
    }
    if (tries > 250) clearInterval(t);
  }, 80);
}
boot();
