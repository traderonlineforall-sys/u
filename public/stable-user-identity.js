const ID_KEY = "sr_tool_user_id";
const NAME_KEY = "sr_tool_user_name";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5; // 5 years

function safeLocalGet(key){
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}
function safeLocalSet(key, value){
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function safeSessionGet(key){
  try { return sessionStorage.getItem(key) || ""; } catch { return ""; }
}
function safeSessionSet(key, value){
  try { sessionStorage.setItem(key, value); return true; } catch { return false; }
}
function safeCookieGet(name){
  try {
    const parts = String(document.cookie || "").split(/;\s*/);
    const prefix = `${name}=`;
    for (const part of parts) {
      if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
    }
  } catch {}
  return "";
}
function safeCookieSet(name, value){
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
    return true;
  } catch { return false; }
}

function normalizeId(v){
  const s = String(v || "").trim();
  return /^[a-zA-Z0-9_.:-]{12,}$/.test(s) ? s : "";
}

function simpleHash(input = ""){
  let h = 2166136261;
  const s = String(input || "");
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function buildDeviceFallbackId(){
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const nav = window.navigator || {};
    const scr = window.screen || {};
    const seed = [
      nav.userAgent || "",
      nav.language || "",
      Array.isArray(nav.languages) ? nav.languages.join(",") : "",
      nav.platform || "",
      nav.hardwareConcurrency || "",
      scr.width || "",
      scr.height || "",
      scr.colorDepth || "",
      window.devicePixelRatio || "",
      tz,
      new Date().getTimezoneOffset(),
      location.host || ""
    ].join("|");
    return `uid_dev_${simpleHash(seed)}_${simpleHash(seed + "|v2")}`;
  } catch {
    return `uid_dev_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;
  }
}

function createFreshId(){
  try {
    if (crypto?.randomUUID) return `uid_${crypto.randomUUID()}`;
  } catch {}
  return `uid_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}_${simpleHash(navigator?.userAgent || "")}`;
}

export function getStableUserId(){
  const localId = normalizeId(safeLocalGet(ID_KEY));
  const sessionId = normalizeId(safeSessionGet(ID_KEY));
  const cookieId = normalizeId(safeCookieGet(ID_KEY));

  let id = localId || sessionId || cookieId;

  if (!id) {
    // Strong persistence path first; deterministic device fallback second.
    id = createFreshId();
    if (!normalizeId(id)) id = buildDeviceFallbackId();
  }

  safeLocalSet(ID_KEY, id);
  safeSessionSet(ID_KEY, id);
  safeCookieSet(ID_KEY, id);
  return id;
}

export function getStoredUserName(){
  return String(safeLocalGet(NAME_KEY) || safeCookieGet(NAME_KEY) || "").trim();
}

export function setStoredUserName(name){
  const v = String(name || "").trim();
  if (!v) {
    try { localStorage.removeItem(NAME_KEY); } catch {}
    try { sessionStorage.removeItem(NAME_KEY); } catch {}
    try { document.cookie = `${NAME_KEY}=; path=/; max-age=0; samesite=lax`; } catch {}
    return;
  }
  safeLocalSet(NAME_KEY, v);
  safeSessionSet(NAME_KEY, v);
  safeCookieSet(NAME_KEY, v);
}

export function aliasForUserId(uid = "") {
  const s = String(uid || "");
  if (!s) return "User";
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  const n = (Math.abs(h) % 9000) + 1000;
  return `User-${n}`;
}

export function getStablePresenceLabel(){
  const name = getStoredUserName();
  return name || aliasForUserId(getStableUserId());
}
