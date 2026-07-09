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
const LEGACY_THEME_HREF = "ua07-20-theme.css?v=ua07legacy9-main-hover-only";
const AHLY_THEME_LINK_ID = "ahlyPremiumThemeLink";
const AHLY_THEME_HREF = "ahly-premium-theme.css?v=ahly-v14-professional-hover-restore1";
const EGYPT_THEME_LINK_ID = "egyptWorldCupThemeLink";
const EGYPT_THEME_HREF = "egypt-worldcup-theme.css?v=egyptwc-layer-v11-professional-hover";
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

function forceThemeToggleVisible(){
  try {
    const logo = document.getElementById("MNDO_UA07_LOGO3") || document.getElementById("MNDO_UA07_LOGO");
    const wrap = document.getElementById("UA07_SECRET_ENVELOPE_WRAP");
    const btn = document.getElementById(TOGGLE_BTN_ID);
    const env = document.getElementById("UA07_SECRET_ENVELOPE");
    if (logo) {
      logo.style.overflow = "visible";
      logo.style.pointerEvents = "auto";
    }
    if (wrap) {
      wrap.hidden = false;
      wrap.removeAttribute("hidden");
      wrap.setAttribute("aria-hidden", "false");
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.justifyContent = "center";
      wrap.style.gap = "6px";
      wrap.style.opacity = "1";
      wrap.style.visibility = "visible";
      wrap.style.pointerEvents = "auto";
      wrap.style.overflow = "visible";
      wrap.style.zIndex = "2147482000";
    }
    [env, btn].forEach(function(el){
      if (!el) return;
      el.hidden = false;
      el.removeAttribute("hidden");
      el.style.opacity = "1";
      el.style.visibility = "visible";
      el.style.pointerEvents = "auto";
    });
    if (btn) btn.style.display = "inline-flex";
  } catch {}
}

function ensureToggleBaseStyle(){
  if (document.getElementById("EID_TOGGLE_BASE_STYLE")) return;
  const style = document.createElement("style");
  style.id = "EID_TOGGLE_BASE_STYLE";
  style.textContent = `
    #MNDO_UA07_LOGO3 {
      overflow: visible !important;
    }
    #UA07_SECRET_ENVELOPE_WRAP {
      position: static !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
      overflow: visible !important;
      z-index: 2147482000 !important;
      flex: 0 0 auto !important;
    }
    #UA07_SECRET_ENVELOPE,
    #EID_TOGGLE_BTN {
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
      flex: 0 0 auto !important;
    }
    #UA07_SECRET_ENVELOPE { display: grid !important; place-items: center !important; }
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



function ensureProfessionalMenuHoverLayer(){
  if (document.getElementById('MNDO_PROFESSIONAL_MENU_HOVER_LAYER')) return;
  const css = `
/* ===== MNDO professional menu hover layer v2 =====
   Ahly/Egypt keep the approved professional hover.
   Zamalek dropdown panels are intentionally NOT touched here; Zamalek gets only
   a static main-button hover in ua07-20-theme.css so its dropdown shading stays as accepted.
   The stopped/off theme gets the requested blue menu/dropdown shading.
   Visual-only: colors/backgrounds/borders/shadows/text effects; no layout or logic touched.
*/
html.egypt-worldcup-theme-live {
  --mndo-menu-text: #f5d57d;
  --mndo-menu-hover-text: #fff7d5;
  --mndo-menu-hover-bg: linear-gradient(180deg, rgba(255,246,211,.16), rgba(255,246,211,.035) 36%, rgba(92,0,0,.36) 100%), radial-gradient(120% 170% at 14% 0%, rgba(255,218,118,.20), rgba(255,218,118,0) 48%), radial-gradient(120% 180% at 100% 0%, rgba(206,14,45,.26), rgba(206,14,45,0) 58%), linear-gradient(90deg, rgba(76,0,0,.66), rgba(18,0,0,.42) 55%, rgba(5,0,0,.30));
  --mndo-menu-hover-bg-color: rgba(35,0,0,.56);
  --mndo-menu-hover-border: rgba(255,226,145,.42);
  --mndo-menu-hover-glow: rgba(255,218,118,.28);
  --mndo-menu-hover-accent: rgba(255,218,118,.46);
  --mndo-panel-bg: linear-gradient(180deg, rgba(255,246,211,.075), rgba(255,246,211,.016) 34%, rgba(0,0,0,.02)), radial-gradient(160% 120% at 12% 0%, rgba(255,218,118,.10), rgba(255,218,118,0) 48%), radial-gradient(150% 135% at 100% 6%, rgba(170,0,0,.20), rgba(170,0,0,0) 58%), linear-gradient(180deg, rgba(20,0,0,.88), rgba(38,0,0,.78) 57%, rgba(5,0,0,.90));
  --mndo-panel-bg-color: rgba(18,0,0,.86);
  --mndo-panel-border: rgba(255,226,145,.33);
  --mndo-row-border: rgba(255,226,145,.10);
  --mndo-row-hover-bg: linear-gradient(180deg, rgba(255,246,211,.10), rgba(255,246,211,.025)), radial-gradient(125% 150% at 8% 0%, rgba(255,218,118,.18), rgba(255,218,118,0) 48%), linear-gradient(90deg, rgba(116,0,0,.58), rgba(35,0,0,.34) 58%, rgba(3,0,0,.18));
  --mndo-row-hover-bg-color: rgba(58,0,0,.46);
}
html.ahly-premium-theme-live {
  --mndo-menu-text: rgba(255,235,184,.98);
  --mndo-menu-hover-text: #fff3bf;
  --mndo-menu-hover-bg: linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.030) 34%, rgba(96,0,0,.42) 100%), radial-gradient(120% 165% at 14% 0%, rgba(255,214,112,.18), rgba(255,214,112,0) 48%), radial-gradient(126% 180% at 100% 0%, rgba(230,0,0,.28), rgba(230,0,0,0) 58%), linear-gradient(90deg, rgba(108,0,0,.68), rgba(15,15,19,.46) 58%, rgba(0,0,0,.30));
  --mndo-menu-hover-bg-color: rgba(38,0,0,.58);
  --mndo-menu-hover-border: rgba(255,220,130,.42);
  --mndo-menu-hover-glow: rgba(255,214,112,.27);
  --mndo-menu-hover-accent: rgba(255,214,112,.48);
  --mndo-panel-bg: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.014) 34%, rgba(0,0,0,.02)), radial-gradient(155% 125% at 12% 0%, rgba(255,214,112,.10), rgba(255,214,112,0) 48%), radial-gradient(155% 140% at 100% 6%, rgba(175,0,0,.22), rgba(175,0,0,0) 58%), linear-gradient(180deg, rgba(12,12,17,.88), rgba(20,4,7,.78) 56%, rgba(42,0,0,.89));
  --mndo-panel-bg-color: rgba(8,8,12,.88);
  --mndo-panel-border: rgba(255,220,130,.31);
  --mndo-row-border: rgba(255,214,112,.10);
  --mndo-row-hover-bg: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.024)), radial-gradient(130% 150% at 8% 0%, rgba(255,214,112,.17), rgba(255,214,112,0) 48%), linear-gradient(90deg, rgba(126,0,0,.58), rgba(22,18,20,.36) 58%, rgba(0,0,0,.18));
  --mndo-row-hover-bg-color: rgba(58,0,0,.48);
}
html.sr-theme-off-live {
  --mndo-menu-text: rgba(238,245,255,.98);
  --mndo-menu-hover-text: #ffffff;
  --mndo-menu-hover-bg: linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.030) 34%, rgba(20,64,148,.42) 100%), radial-gradient(120% 165% at 14% 0%, rgba(120,190,255,.22), rgba(120,190,255,0) 48%), radial-gradient(126% 180% at 100% 0%, rgba(35,120,255,.30), rgba(35,120,255,0) 58%), linear-gradient(90deg, rgba(13,49,118,.68), rgba(8,18,45,.48) 58%, rgba(0,0,0,.30));
  --mndo-menu-hover-bg-color: rgba(8,32,88,.60);
  --mndo-menu-hover-border: rgba(128,194,255,.42);
  --mndo-menu-hover-glow: rgba(78,160,255,.30);
  --mndo-menu-hover-accent: rgba(128,194,255,.52);
  --mndo-panel-bg: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.014) 34%, rgba(0,0,0,.02)), radial-gradient(155% 125% at 12% 0%, rgba(120,190,255,.13), rgba(120,190,255,0) 48%), radial-gradient(155% 140% at 100% 6%, rgba(35,120,255,.24), rgba(35,120,255,0) 58%), linear-gradient(180deg, rgba(4,10,26,.90), rgba(8,20,52,.82) 56%, rgba(2,5,16,.92));
  --mndo-panel-bg-color: rgba(4,10,26,.90);
  --mndo-panel-border: rgba(128,194,255,.32);
  --mndo-row-border: rgba(128,194,255,.10);
  --mndo-row-hover-bg: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.024)), radial-gradient(130% 150% at 8% 0%, rgba(120,190,255,.19), rgba(120,190,255,0) 48%), linear-gradient(90deg, rgba(19,73,168,.58), rgba(7,20,56,.40) 58%, rgba(0,0,0,.18));
  --mndo-row-hover-bg-color: rgba(12,50,132,.50);
}
html.egypt-worldcup-theme-live body .dropdown .dropbtn,
html.egypt-worldcup-theme-live body .navbar a,
html.egypt-worldcup-theme-live body #singlelink,
html.ahly-premium-theme-live body .dropdown .dropbtn,
html.ahly-premium-theme-live body .navbar a,
html.ahly-premium-theme-live body #singlelink,
html.sr-theme-off-live body .dropdown .dropbtn,
html.sr-theme-off-live body .navbar a,
html.sr-theme-off-live body #singlelink {
  color: var(--mndo-menu-text) !important;
  -webkit-text-fill-color: var(--mndo-menu-text) !important;
}
html.egypt-worldcup-theme-live body .dropdown .dropbtn,
html.egypt-worldcup-theme-live body .navbar a,
html.egypt-worldcup-theme-live body #singlelink,
html.egypt-worldcup-theme-live body .dropdown-content a,
html.egypt-worldcup-theme-live body .sub-dropdown-content a,
html.egypt-worldcup-theme-live body .sub-dropdown > a,
html.ahly-premium-theme-live body .dropdown .dropbtn,
html.ahly-premium-theme-live body .navbar a,
html.ahly-premium-theme-live body #singlelink,
html.ahly-premium-theme-live body .dropdown-content a,
html.ahly-premium-theme-live body .sub-dropdown-content a,
html.ahly-premium-theme-live body .sub-dropdown > a,
html.sr-theme-off-live body .dropdown .dropbtn,
html.sr-theme-off-live body .navbar a,
html.sr-theme-off-live body #singlelink,
html.sr-theme-off-live body .dropdown-content a,
html.sr-theme-off-live body .sub-dropdown-content a,
html.sr-theme-off-live body .sub-dropdown > a {
  transition: color .16s ease, background .16s ease, border-color .16s ease, box-shadow .16s ease, text-shadow .16s ease, filter .16s ease !important;
}
html.egypt-worldcup-theme-live body .dropdown:hover .dropbtn,
html.egypt-worldcup-theme-live body .dropdown:focus-within .dropbtn,
html.egypt-worldcup-theme-live body .dropdown.open .dropbtn,
html.egypt-worldcup-theme-live body .dropdown.active .dropbtn,
html.egypt-worldcup-theme-live body .navbar a:hover,
html.egypt-worldcup-theme-live body .navbar a:focus,
html.egypt-worldcup-theme-live body #singlelink:hover,
html.egypt-worldcup-theme-live body #singlelink:focus,
html.ahly-premium-theme-live body .dropdown:hover .dropbtn,
html.ahly-premium-theme-live body .dropdown:focus-within .dropbtn,
html.ahly-premium-theme-live body .dropdown.open .dropbtn,
html.ahly-premium-theme-live body .dropdown.active .dropbtn,
html.ahly-premium-theme-live body .navbar a:hover,
html.ahly-premium-theme-live body .navbar a:focus,
html.ahly-premium-theme-live body #singlelink:hover,
html.ahly-premium-theme-live body #singlelink:focus,
html.sr-theme-off-live body .dropdown:hover .dropbtn,
html.sr-theme-off-live body .dropdown:focus-within .dropbtn,
html.sr-theme-off-live body .dropdown.open .dropbtn,
html.sr-theme-off-live body .dropdown.active .dropbtn,
html.sr-theme-off-live body .navbar a:hover,
html.sr-theme-off-live body .navbar a:focus,
html.sr-theme-off-live body #singlelink:hover,
html.sr-theme-off-live body #singlelink:focus {
  color: var(--mndo-menu-hover-text) !important;
  -webkit-text-fill-color: var(--mndo-menu-hover-text) !important;
  background: var(--mndo-menu-hover-bg) !important;
  background-color: var(--mndo-menu-hover-bg-color) !important;
  border-color: var(--mndo-menu-hover-border) !important;
  text-shadow: 0 1px 2px rgba(0,0,0,1), 0 0 12px var(--mndo-menu-hover-glow) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.15), inset 0 -1px 0 var(--mndo-menu-hover-border), inset 2px 0 0 var(--mndo-menu-hover-accent), 0 8px 20px rgba(0,0,0,.31), 0 0 17px var(--mndo-menu-hover-glow) !important;
  filter: none !important;
}
html.egypt-worldcup-theme-live body .dropdown-content,
html.egypt-worldcup-theme-live body .sub-dropdown-content,
html.egypt-worldcup-theme-live body .search-results,
html.egypt-worldcup-theme-live body #searchResults,
html.ahly-premium-theme-live body .dropdown-content,
html.ahly-premium-theme-live body .sub-dropdown-content,
html.ahly-premium-theme-live body .search-results,
html.ahly-premium-theme-live body #searchResults,
html.sr-theme-off-live body .dropdown-content,
html.sr-theme-off-live body .sub-dropdown-content,
html.sr-theme-off-live body .search-results,
html.sr-theme-off-live body #searchResults {
  background: var(--mndo-panel-bg) !important;
  background-color: var(--mndo-panel-bg-color) !important;
  border-color: var(--mndo-panel-border) !important;
  color: var(--mndo-menu-text) !important;
  -webkit-text-fill-color: var(--mndo-menu-text) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.11), inset 0 0 0 1px rgba(255,255,255,.025), 0 18px 42px rgba(0,0,0,.60), 0 0 21px var(--mndo-menu-hover-glow) !important;
  backdrop-filter: blur(10px) saturate(1.16) contrast(1.03) !important;
  -webkit-backdrop-filter: blur(10px) saturate(1.16) contrast(1.03) !important;
}
html.egypt-worldcup-theme-live body .sub-dropdown,
html.egypt-worldcup-theme-live body .sub-dropdown[style],
html.egypt-worldcup-theme-live body .dropdown-content a,
html.egypt-worldcup-theme-live body .sub-dropdown-content a,
html.egypt-worldcup-theme-live body .sub-dropdown > a,
html.ahly-premium-theme-live body .sub-dropdown,
html.ahly-premium-theme-live body .sub-dropdown[style],
html.ahly-premium-theme-live body .dropdown-content a,
html.ahly-premium-theme-live body .sub-dropdown-content a,
html.ahly-premium-theme-live body .sub-dropdown > a,
html.sr-theme-off-live body .sub-dropdown,
html.sr-theme-off-live body .sub-dropdown[style],
html.sr-theme-off-live body .dropdown-content a,
html.sr-theme-off-live body .sub-dropdown-content a,
html.sr-theme-off-live body .sub-dropdown > a {
  color: var(--mndo-menu-text) !important;
  -webkit-text-fill-color: var(--mndo-menu-text) !important;
  background: transparent !important;
  background-color: transparent !important;
  border-color: var(--mndo-row-border) !important;
  box-shadow: inset 0 -1px 0 rgba(255,255,255,.035) !important;
}
html.egypt-worldcup-theme-live body .sub-dropdown:hover,
html.egypt-worldcup-theme-live body .sub-dropdown:hover[style],
html.egypt-worldcup-theme-live body .dropdown-content a:hover,
html.egypt-worldcup-theme-live body .dropdown-content a:focus,
html.egypt-worldcup-theme-live body .sub-dropdown-content a:hover,
html.egypt-worldcup-theme-live body .sub-dropdown-content a:focus,
html.egypt-worldcup-theme-live body .sub-dropdown:hover > a,
html.ahly-premium-theme-live body .sub-dropdown:hover,
html.ahly-premium-theme-live body .sub-dropdown:hover[style],
html.ahly-premium-theme-live body .dropdown-content a:hover,
html.ahly-premium-theme-live body .dropdown-content a:focus,
html.ahly-premium-theme-live body .sub-dropdown-content a:hover,
html.ahly-premium-theme-live body .sub-dropdown-content a:focus,
html.ahly-premium-theme-live body .sub-dropdown:hover > a,
html.sr-theme-off-live body .sub-dropdown:hover,
html.sr-theme-off-live body .sub-dropdown:hover[style],
html.sr-theme-off-live body .dropdown-content a:hover,
html.sr-theme-off-live body .dropdown-content a:focus,
html.sr-theme-off-live body .sub-dropdown-content a:hover,
html.sr-theme-off-live body .sub-dropdown-content a:focus,
html.sr-theme-off-live body .sub-dropdown:hover > a {
  color: var(--mndo-menu-hover-text) !important;
  -webkit-text-fill-color: var(--mndo-menu-hover-text) !important;
  background: var(--mndo-row-hover-bg) !important;
  background-color: var(--mndo-row-hover-bg-color) !important;
  border-color: var(--mndo-panel-border) !important;
  text-shadow: 0 1px 2px rgba(0,0,0,1), 0 0 10px var(--mndo-menu-hover-glow) !important;
  box-shadow: inset 2px 0 0 var(--mndo-menu-hover-accent), inset 0 1px 0 rgba(255,255,255,.10), inset 0 -1px 0 var(--mndo-panel-border), 0 6px 16px rgba(0,0,0,.25) !important;
  filter: none !important;
}
/* ===== END MNDO professional menu hover layer v2 ===== */
  `;
  const style = document.createElement('style');
  style.id = 'MNDO_PROFESSIONAL_MENU_HOVER_LAYER';
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
  ensureProfessionalMenuHoverLayer();
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
  document.documentElement.classList.toggle('sr-theme-off-live', mode === THEME_OFF);
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
  if(btn) {
    forceThemeToggleVisible();
    return btn;
  }

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
  forceThemeToggleVisible();
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
  forceThemeToggleVisible();
}
function fixUa07PointerEvents(logoEl){
  try {
    if(!logoEl) return;
    logoEl.style.pointerEvents = "auto";
    const svg = logoEl.querySelector("svg");
    if(svg) svg.style.pointerEvents = "auto";
  } catch {}
}


function ensureAhlyProfessionalRestoreLayer(){
  if (document.getElementById('MNDO_AHLY_PROFESSIONAL_RESTORE_LAYER')) return;
  const css = `
/* ===== MNDO Ahly professional restore from approved package =====
   Source: professional-hover-menu-themes-egypt-ahly-zamalek.zip
   Ahly-only visual restore. No logic, no SR data, no layout order changes.
*/
/* ===== Ahly transparent menu choices v13 - actual separate layer =====
   This block mirrors the no-theme menu-choice transparency and overrides the
   older inline Ahly V9 layer. Visual only: no layout, display, spacing, sizing,
   ordering, positioning, links, IDs, or tool logic are changed.
*/
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
/* ===== END Ahly transparent menu choices v13 ===== */

/* Ahly hover/menu finish from approved professional package */
html.ahly-premium-theme-live {
  --mndo-menu-text: rgba(255,235,184,.98);
  --mndo-menu-hover-text: #fff3bf;
  --mndo-menu-hover-bg: linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.030) 34%, rgba(96,0,0,.42) 100%), radial-gradient(120% 165% at 14% 0%, rgba(255,214,112,.18), rgba(255,214,112,0) 48%), radial-gradient(126% 180% at 100% 0%, rgba(230,0,0,.28), rgba(230,0,0,0) 58%), linear-gradient(90deg, rgba(108,0,0,.68), rgba(15,15,19,.46) 58%, rgba(0,0,0,.30));
  --mndo-menu-hover-bg-color: rgba(38,0,0,.58);
  --mndo-menu-hover-border: rgba(255,220,130,.42);
  --mndo-menu-hover-glow: rgba(255,214,112,.27);
  --mndo-menu-hover-accent: rgba(255,214,112,.48);
  --mndo-panel-bg: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.014) 34%, rgba(0,0,0,.02)), radial-gradient(155% 125% at 12% 0%, rgba(255,214,112,.10), rgba(255,214,112,0) 48%), radial-gradient(155% 140% at 100% 6%, rgba(175,0,0,.22), rgba(175,0,0,0) 58%), linear-gradient(180deg, rgba(12,12,17,.88), rgba(20,4,7,.78) 56%, rgba(42,0,0,.89));
  --mndo-panel-bg-color: rgba(8,8,12,.88);
  --mndo-panel-border: rgba(255,220,130,.31);
  --mndo-row-border: rgba(255,214,112,.10);
  --mndo-row-hover-bg: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.024)), radial-gradient(130% 150% at 8% 0%, rgba(255,214,112,.17), rgba(255,214,112,0) 48%), linear-gradient(90deg, rgba(126,0,0,.58), rgba(22,18,20,.36) 58%, rgba(0,0,0,.18));
  --mndo-row-hover-bg-color: rgba(58,0,0,.48);
}
html.ahly-premium-theme-live body .dropdown .dropbtn,
html.ahly-premium-theme-live body .navbar a,
html.ahly-premium-theme-live body #singlelink {
  color: var(--mndo-menu-text) !important;
  -webkit-text-fill-color: var(--mndo-menu-text) !important;
}
html.ahly-premium-theme-live body .dropdown .dropbtn,
html.ahly-premium-theme-live body .navbar a,
html.ahly-premium-theme-live body #singlelink,
html.ahly-premium-theme-live body .dropdown-content a,
html.ahly-premium-theme-live body .sub-dropdown-content a,
html.ahly-premium-theme-live body .sub-dropdown > a {
  transition: color .16s ease, background .16s ease, border-color .16s ease, box-shadow .16s ease, text-shadow .16s ease, filter .16s ease !important;
}
html.ahly-premium-theme-live body .dropdown:hover .dropbtn,
html.ahly-premium-theme-live body .dropdown:focus-within .dropbtn,
html.ahly-premium-theme-live body .dropdown.open .dropbtn,
html.ahly-premium-theme-live body .dropdown.active .dropbtn,
html.ahly-premium-theme-live body .navbar a:hover,
html.ahly-premium-theme-live body .navbar a:focus,
html.ahly-premium-theme-live body #singlelink:hover,
html.ahly-premium-theme-live body #singlelink:focus {
  color: var(--mndo-menu-hover-text) !important;
  -webkit-text-fill-color: var(--mndo-menu-hover-text) !important;
  background: var(--mndo-menu-hover-bg) !important;
  background-color: var(--mndo-menu-hover-bg-color) !important;
  border-color: var(--mndo-menu-hover-border) !important;
  text-shadow: 0 1px 2px rgba(0,0,0,1), 0 0 12px var(--mndo-menu-hover-glow) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.15), inset 0 -1px 0 var(--mndo-menu-hover-border), inset 2px 0 0 var(--mndo-menu-hover-accent), 0 8px 20px rgba(0,0,0,.31), 0 0 17px var(--mndo-menu-hover-glow) !important;
  filter: none !important;
}
html.ahly-premium-theme-live body .dropdown-content,
html.ahly-premium-theme-live body .sub-dropdown-content,
html.ahly-premium-theme-live body .search-results,
html.ahly-premium-theme-live body #searchResults {
  background: var(--mndo-panel-bg) !important;
  background-color: var(--mndo-panel-bg-color) !important;
  border-color: var(--mndo-panel-border) !important;
  color: var(--mndo-menu-text) !important;
  -webkit-text-fill-color: var(--mndo-menu-text) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.11), inset 0 0 0 1px rgba(255,255,255,.025), 0 18px 42px rgba(0,0,0,.60), 0 0 21px var(--mndo-menu-hover-glow) !important;
  backdrop-filter: blur(10px) saturate(1.16) contrast(1.03) !important;
  -webkit-backdrop-filter: blur(10px) saturate(1.16) contrast(1.03) !important;
}
html.ahly-premium-theme-live body .sub-dropdown,
html.ahly-premium-theme-live body .sub-dropdown[style],
html.ahly-premium-theme-live body .dropdown-content a,
html.ahly-premium-theme-live body .sub-dropdown-content a,
html.ahly-premium-theme-live body .sub-dropdown > a {
  color: var(--mndo-menu-text) !important;
  -webkit-text-fill-color: var(--mndo-menu-text) !important;
  background: transparent !important;
  background-color: transparent !important;
  border-color: var(--mndo-row-border) !important;
  box-shadow: inset 0 -1px 0 rgba(255,255,255,.035) !important;
}
html.ahly-premium-theme-live body .sub-dropdown:hover,
html.ahly-premium-theme-live body .sub-dropdown:hover[style],
html.ahly-premium-theme-live body .dropdown-content a:hover,
html.ahly-premium-theme-live body .dropdown-content a:focus,
html.ahly-premium-theme-live body .sub-dropdown-content a:hover,
html.ahly-premium-theme-live body .sub-dropdown-content a:focus,
html.ahly-premium-theme-live body .sub-dropdown:hover > a {
  color: var(--mndo-menu-hover-text) !important;
  -webkit-text-fill-color: var(--mndo-menu-hover-text) !important;
  background: var(--mndo-row-hover-bg) !important;
  background-color: var(--mndo-row-hover-bg-color) !important;
  border-color: var(--mndo-panel-border) !important;
  text-shadow: 0 1px 2px rgba(0,0,0,1), 0 0 10px var(--mndo-menu-hover-glow) !important;
  box-shadow: inset 2px 0 0 var(--mndo-menu-hover-accent), inset 0 1px 0 rgba(255,255,255,.10), inset 0 -1px 0 var(--mndo-panel-border), 0 6px 16px rgba(0,0,0,.25) !important;
  filter: none !important;
}
/* ===== END MNDO Ahly professional restore ===== */
  `;
  const style = document.createElement('style');
  style.id = 'MNDO_AHLY_PROFESSIONAL_RESTORE_LAYER';
  style.textContent = css;
  document.head.appendChild(style);
}

function boot(){
  ensureToggleBaseStyle();
  ensureDecorLayer();
  ensureAhlyTransparentMenuLayer();
  ensureProfessionalMenuHoverLayer();
  ensureAhlyProfessionalRestoreLayer();
  applyThemeState();
  ensureToggleButton();
  updateToggleUi();
  forceThemeToggleVisible();
  let tries = 0;
  const t = setInterval(function(){
    tries++;
    const logo = document.getElementById("MNDO_UA07_LOGO3") || document.getElementById("MNDO_UA07_LOGO");
    if (logo) fixUa07PointerEvents(logo);
    if (findEnvelopeWrap()) {
      ensureToggleButton();
      updateToggleUi();
      forceThemeToggleVisible();
    }
    if (tries > 250) clearInterval(t);
  }, 80);
}
boot();
