/*
  Eid Theme Toggle (Safe + Non-invasive)
  -------------------------------------
  - Keeps the original tool layout intact.
  - Only enables/disables the Eid stylesheet.
  - Preserves existing hidden admin/UA07 interactions.
*/
const LS_THEME_OFF = "sr_eid_theme_off";
const TOGGLE_BTN_ID = "EID_TOGGLE_BTN";
function getThemeLink(){
  return document.getElementById("eidThemeLink") || document.querySelector('link[href$="eid-theme.css"], link[href*="eid-theme.css"]');
}
function isThemeOff(){ try { return localStorage.getItem(LS_THEME_OFF) === "1"; } catch { return false; } }
function setThemeOff(v){ try { localStorage.setItem(LS_THEME_OFF, v ? "1" : "0"); } catch {} }
function applyThemeState(){ const link = getThemeLink(); if(!link) return; link.disabled = isThemeOff(); updateToggleUi(); }
function findEnvelopeWrap(){ return document.getElementById("UA07_SECRET_ENVELOPE_WRAP"); }
function ensureToggleButton(){
  const wrap = findEnvelopeWrap(); if(!wrap) return null;
  let btn = document.getElementById(TOGGLE_BTN_ID); if(btn) return btn;
  btn = document.createElement("button");
  btn.id = TOGGLE_BTN_ID; btn.type = "button"; btn.className = "eid-toggle-btn";
  btn.textContent = "عيد مبارك"; btn.title = "Toggle Eid theme";
  btn.addEventListener("click", function(e){ try { e.preventDefault(); e.stopPropagation(); } catch {} setThemeOff(!isThemeOff()); applyThemeState(); });
  try {
    const pill = document.getElementById("UA07_ONLINE_COUNT");
    const env = document.getElementById("UA07_SECRET_ENVELOPE");
    if (pill && pill.parentNode === wrap) wrap.insertBefore(btn, pill.nextSibling || env || null);
    else if (env && env.parentNode === wrap) wrap.insertBefore(btn, env);
    else wrap.appendChild(btn);
  } catch { try { wrap.appendChild(btn); } catch {} }
  return btn;
}
function updateToggleUi(){ const btn = document.getElementById(TOGGLE_BTN_ID); if(!btn) return; const off = isThemeOff(); btn.classList.toggle("is-off", off); btn.setAttribute("aria-pressed", off ? "false" : "true"); }
function fixUa07PointerEvents(logoEl){ try { if(!logoEl) return; logoEl.style.pointerEvents = "auto"; const svg = logoEl.querySelector("svg"); if(svg) svg.style.pointerEvents = "auto"; } catch {} }
function boot(){
  applyThemeState();
  let tries = 0;
  const t = setInterval(function(){
    tries++;
    const logo = document.getElementById("MNDO_UA07_LOGO3") || document.getElementById("MNDO_UA07_LOGO");
    if (logo) fixUa07PointerEvents(logo);
    if (findEnvelopeWrap()) { ensureToggleButton(); updateToggleUi(); }
    if (tries > 250) clearInterval(t);
  }, 80);
}
boot();
