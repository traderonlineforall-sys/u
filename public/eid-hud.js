/*
  Eid Theme Toggle (Premium / Safe)
  ---------------------------------
  - Keeps the original tool layout intact.
  - Uses an icon-only luxury toggle instead of visible text.
  - Only enables/disables the Eid stylesheet.
  - Preserves existing hidden admin/UA07 interactions.
*/
const LS_THEME_OFF = "sr_eid_theme_off";
const TOGGLE_BTN_ID = "EID_TOGGLE_BTN";

function getThemeLink(){
  return document.getElementById("eidThemeLink") || document.querySelector('link[href$="eid-theme.css"], link[href*="eid-theme.css"]');
}
function isThemeOff(){
  try { return localStorage.getItem(LS_THEME_OFF) === "1"; } catch { return false; }
}
function setThemeOff(v){
  try { localStorage.setItem(LS_THEME_OFF, v ? "1" : "0"); } catch {}
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
  const link = getThemeLink();
  if(link) link.disabled = isThemeOff();
  document.documentElement.classList.toggle('eid-theme-live', !isThemeOff());
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
    setThemeOff(!isThemeOff());
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
  const off = isThemeOff();
  btn.classList.toggle("is-off", off);
  btn.setAttribute("aria-pressed", off ? "false" : "true");
  btn.title = off ? 'تشغيل ثيم العيد' : 'إيقاف ثيم العيد';
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
  ensureDecorLayer();
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
