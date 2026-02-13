/*
  Ramadan Theme Toggle (Safe + Non-invasive)
  ----------------------------------------
  User request:
  - Return UA07 / envelope / AHT / Tags to their ORIGINAL layout (no forced stacking).
  - Make "رمضان كريم" a REAL button (one click) that toggles the Ramadan theme
    on/off and can be re-enabled again.

  Design principles:
  - Do NOT move DOM elements (no "HUD stack") — keep the original tool layout.
  - Only enable/disable the Ramadan stylesheet link.
  - Keep admin 5-click on UA07 logo working (fix pointer-events).
*/

const LS_THEME_OFF = "sr_ramadan_theme_off"; // 1 => off
const TOGGLE_BTN_ID = "RAMADAN_TOGGLE_BTN";

function getThemeLink() {
  return (
    document.getElementById("ramadanThemeLink") ||
    document.querySelector('link[href$="ramadan-theme.css"], link[href*="ramadan-theme.css"]')
  );
}

function isThemeOff() {
  try {
    return localStorage.getItem(LS_THEME_OFF) === "1";
  } catch {
    return false;
  }
}

function setThemeOff(v) {
  try {
    localStorage.setItem(LS_THEME_OFF, v ? "1" : "0");
  } catch {}
}

function applyThemeState() {
  const link = getThemeLink();
  if (!link) return;
  link.disabled = isThemeOff();
  updateToggleUi();
}

function findEnvelopeWrap() {
  return document.getElementById("UA07_SECRET_ENVELOPE_WRAP");
}

function ensureToggleButton() {
  const wrap = findEnvelopeWrap();
  if (!wrap) return null;

  let btn = document.getElementById(TOGGLE_BTN_ID);
  if (btn) return btn;

  btn = document.createElement("button");
  btn.id = TOGGLE_BTN_ID;
  btn.type = "button";
  btn.className = "ramadan-toggle-btn";
  btn.textContent = "رمضان كريم";
  btn.title = "Toggle Ramadan theme";

  // IMPORTANT: don't let it count as UA07 logo clicks (admin hidden trigger).
  btn.addEventListener("click", (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch {}
    const nowOff = !isThemeOff() ? true : false;
    setThemeOff(nowOff);
    applyThemeState();
  });

  // Place it INSIDE the envelope row, next to the online "lamp".
  // Requested: keep it "جنب النقطه" (next to the online indicator)
  // Order: [Online lamp+count] [Ramadan button] [Envelope]
  try {
    const pill = document.getElementById("UA07_ONLINE_COUNT");
    const env  = document.getElementById("UA07_SECRET_ENVELOPE");
    if (pill && pill.parentNode === wrap) {
      // Insert right after the pill (before the envelope)
      wrap.insertBefore(btn, pill.nextSibling || env || null);
    } else if (env && env.parentNode === wrap) {
      // If pill isn't there yet, insert before the envelope
      wrap.insertBefore(btn, env);
    } else {
      wrap.appendChild(btn);
    }
  } catch {
    try { wrap.appendChild(btn); } catch {}
  }

  return btn;
}

function updateToggleUi() {
  const btn = document.getElementById(TOGGLE_BTN_ID);
  if (!btn) return;
  const off = isThemeOff();
  btn.classList.toggle("is-off", off);
  btn.setAttribute("aria-pressed", off ? "false" : "true");
}

function fixUa07PointerEvents(logoEl) {
  // Some legacy CSS sets pointer-events:none on the UA07 logo wrapper.
  // Ensure admin 5-click and other interactions remain possible.
  try {
    if (!logoEl) return;
    logoEl.style.pointerEvents = "auto";
    const svg = logoEl.querySelector("svg");
    if (svg) svg.style.pointerEvents = "auto";
  } catch {}
}

function boot() {
  applyThemeState();

  let tries = 0;
  const t = setInterval(() => {
    tries++;
    const logo = document.getElementById("MNDO_UA07_LOGO3") || document.getElementById("MNDO_UA07_LOGO");
    if (logo) fixUa07PointerEvents(logo);
    // Wait until the envelope wrap exists, then inject the toggle button.
    if (findEnvelopeWrap()) {
      ensureToggleButton();
      updateToggleUi();
    }

    // Stop after a while; UA07 is injected early by app.js usually.
    if (tries > 250) clearInterval(t);
  }, 80);
}

boot();
