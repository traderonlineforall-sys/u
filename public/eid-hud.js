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
            <stop offset="0%" stop-color="#fff3bf"></stop>
            <stop offset="45%" stop-color="#f5d574"></stop>
            <stop offset="100%" stop-color="#ff98d5"></stop>
          </linearGradient>
          <linearGradient id="eidGemStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fff8d4"></stop>
            <stop offset="100%" stop-color="#f4b7ff"></stop>
          </linearGradient>
        </defs>
        <path d="M38.7 10.2c-8.4 1.8-14.4 9.2-14.4 18 0 9.8 8.2 17.8 18.1 17.8 2.1 0 4.2-.4 6.1-1-2.8 2.9-6.9 4.8-11.5 4.8-9.9 0-18-8-18-17.9 0-7.8 5-14.7 12.4-17 .1 0 .2-.1.3-.1 2.2-.7 4.6-.9 7-.6z" fill="url(#eidGemGradient)"></path>
        <path d="M44.9 18.2l1.8 4.4 4.4 1.8-4.4 1.8-1.8 4.4-1.8-4.4-4.4-1.8 4.4-1.8 1.8-4.4zm-20 15.1l1.2 2.9 2.9 1.2-2.9 1.2-1.2 2.9-1.2-2.9-2.9-1.2 2.9-1.2 1.2-2.9z" fill="url(#eidGemGradient)"></path>
        <circle cx="32" cy="32" r="29" fill="none" stroke="url(#eidGemStroke)" stroke-width="1.6" opacity=".65"></circle>
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
