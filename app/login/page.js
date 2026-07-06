"use client";

import { useEffect, useMemo, useState } from "react";

const ID_KEY = "sr_tool_user_id";
const NAME_KEY = "sr_tool_user_name";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5;

function safeLocalGet(key){ try { return localStorage.getItem(key) || ""; } catch { return ""; } }
function safeLocalSet(key, value){ try { localStorage.setItem(key, value); } catch {} }
function safeSessionSet(key, value){ try { sessionStorage.setItem(key, value); } catch {} }
function safeCookieGet(name){
  try {
    const prefix = `${name}=`;
    for (const part of String(document.cookie || "").split(/;\s*/)) {
      if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
    }
  } catch {}
  return "";
}
function safeCookieSet(name, value){
  try { document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`; } catch {}
}
function normalizeId(value){
  const s = String(value || "").trim();
  return /^[a-zA-Z0-9_.:-]{12,}$/.test(s) ? s : "";
}
function createUserId(){
  try { if (crypto?.randomUUID) return `uid_${crypto.randomUUID()}`; } catch {}
  return `uid_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}
function getStableUserId(){
  let id = normalizeId(safeLocalGet(ID_KEY)) || normalizeId(safeCookieGet(ID_KEY));
  if(!id) id = createUserId();
  safeLocalSet(ID_KEY, id);
  safeSessionSet(ID_KEY, id);
  safeCookieSet(ID_KEY, id);
  return id;
}
function cleanNickname(value){
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}
function getStoredNickname(){ return cleanNickname(safeLocalGet(NAME_KEY) || safeCookieGet(NAME_KEY)); }
function setStoredNickname(name){
  const v = cleanNickname(name);
  if(!v) return;
  safeLocalSet(NAME_KEY, v);
  safeSessionSet(NAME_KEY, v);
  safeCookieSet(NAME_KEY, v);
}
function nicknameError(value){
  const v = cleanNickname(value);
  if(v.length < 2) return "اكتب كنية خيالية من حرفين على الأقل.";
  if(/[<>\\{}[\]`]/.test(v)) return "الكنية تحتوي على رموز غير مسموحة.";
  if(/@/.test(v) || /https?:\/\//i.test(v)) return "لا تكتب بريد إلكتروني أو رابط. اكتب كنية خيالية فقط.";
  if(/\+?\d[\d\s().-]{7,}/.test(v)) return "لا تكتب رقم تليفون. اكتب كنية خيالية فقط.";
  return "";
}



async function sha256Hex(value){
  try{
    const bytes = new TextEncoder().encode(String(value || ""));
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buf)).map((b)=>b.toString(16).padStart(2,"0")).join("");
  }catch{
    let h = 2166136261;
    const str = String(value || "");
    for(let i=0; i<str.length; i+=1){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
}

function bucketNumber(value, bucket){
  const n = Number(value || 0);
  if(!Number.isFinite(n) || n <= 0) return "";
  const b = Number(bucket || 1);
  return String(Math.round(n / b) * b);
}

async function getCanvasHash(){
  try{
    const c = document.createElement("canvas");
    c.width = 320; c.height = 110;
    const ctx = c.getContext("2d");
    if(!ctx) return "";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#f60";
    ctx.fillRect(5, 5, 95, 33);
    ctx.fillStyle = "#069";
    ctx.font = "16px Arial";
    ctx.fillText("SR Tool بصمة الجهاز 4.4", 12, 14);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.font = "18px Times New Roman";
    ctx.fillText("عقرب الصحراء", 16, 48);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgb(255,0,255)"; ctx.beginPath(); ctx.arc(205, 55, 28, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(20,40,90,0.8)"; ctx.strokeRect(245, 18, 45, 55);
    return await sha256Hex(c.toDataURL());
  }catch{ return ""; }
}

async function getAudioHash(){
  try{
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if(!Ctx) return "";
    const ctx = new Ctx(1, 44100, 44100);
    const osc = ctx.createOscillator();
    const comp = ctx.createDynamicsCompressor();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 10000;
    comp.threshold.value = -50;
    comp.knee.value = 40;
    comp.ratio.value = 12;
    comp.attack.value = 0;
    comp.release.value = 0.25;
    gain.gain.value = 0.05;
    osc.connect(comp); comp.connect(gain); gain.connect(ctx.destination);
    osc.start(0);
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);
    let sample = "";
    for(let i=4500; i<5000 && i<data.length; i+=7) sample += Math.abs(data[i]).toFixed(7) + ",";
    return await sha256Hex(sample);
  }catch{ return ""; }
}

async function getFontsHash(){
  try{
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if(!ctx) return "";
    const fonts = ["Arial","Tahoma","Times New Roman","Courier New","Verdana","Georgia","Segoe UI","Roboto","Open Sans","Calibri","Cambria","Noto Sans Arabic","Trebuchet MS","Impact","Lucida Console"];
    const txt = "SR Tool عقرب الصحراء 0123456789";
    const widths = fonts.map((font)=>{
      ctx.font = `16px ${font}, monospace`;
      return `${font}:${Math.round(ctx.measureText(txt).width * 100) / 100}`;
    }).join("|");
    return await sha256Hex(widths);
  }catch{ return ""; }
}

async function getWebglInfo(){
  try{
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if(!gl) return {};
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const ext = gl.getSupportedExtensions?.() || [];
    const params = [
      gl.getParameter(gl.VERSION),
      gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    ].join("|");
    return {
      vendor: String(vendor || ""),
      renderer: String(renderer || ""),
      version: String(gl.getParameter(gl.VERSION) || ""),
      shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || ""),
      maxTextureSize: String(gl.getParameter(gl.MAX_TEXTURE_SIZE) || ""),
      maxRenderbufferSize: String(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || ""),
      maxVertexAttribs: String(gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || ""),
      maxCombinedTextureImageUnits: String(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) || ""),
      extensionsHash: await sha256Hex(ext.sort().join("|")),
      paramsHash: await sha256Hex(params),
    };
  }catch{ return {}; }
}

async function getClientHints(){
  try{
    const ua = navigator.userAgentData;
    if(!ua) return {};
    const base = {
      brands: Array.isArray(ua.brands) ? ua.brands.map((b)=>`${b.brand}:${b.version}`) : [],
      mobile: !!ua.mobile,
      platform: ua.platform || "",
    };
    if(typeof ua.getHighEntropyValues === "function"){
      const high = await ua.getHighEntropyValues(["architecture","bitness","model","platformVersion","uaFullVersion","fullVersionList","wow64"]);
      return {
        ...base,
        architecture: high.architecture || "",
        bitness: high.bitness || "",
        model: high.model || "",
        platformVersion: high.platformVersion || "",
        uaFullVersion: high.uaFullVersion || "",
        fullVersionList: Array.isArray(high.fullVersionList) ? high.fullVersionList.map((b)=>`${b.brand}:${b.version}`) : [],
        wow64: !!high.wow64,
      };
    }
    return base;
  }catch{ return {}; }
}

function getMediaFeatures(){
  const q = (query, yes="yes", no="no")=>{ try { return matchMedia(query).matches ? yes : no; } catch { return ""; } };
  return {
    pointer: q("(pointer: fine)", "fine", q("(pointer: coarse)", "coarse", "none")),
    anyPointer: q("(any-pointer: fine)", "fine", q("(any-pointer: coarse)", "coarse", "none")),
    hover: q("(hover: hover)", "hover", "none"),
    anyHover: q("(any-hover: hover)", "hover", "none"),
    colorGamut: q("(color-gamut: rec2020)", "rec2020", q("(color-gamut: p3)", "p3", q("(color-gamut: srgb)", "srgb", ""))),
    contrast: q("(prefers-contrast: more)", "more", q("(prefers-contrast: less)", "less", "no-preference")),
    forcedColors: q("(forced-colors: active)", "active", "none"),
    monochrome: q("(monochrome)", "yes", "no"),
    update: q("(update: fast)", "fast", q("(update: slow)", "slow", "none")),
    dynamicRange: q("(dynamic-range: high)", "high", "standard"),
  };
}

async function getStorageInfo(){
  try{
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : {};
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return {
      quotaBucket: bucketNumber(est.quota || 0, 1024 * 1024 * 128),
      usageBucket: bucketNumber(est.usage || 0, 1024 * 1024 * 16),
      persisted: !!persisted,
    };
  }catch{ return {}; }
}

function getIntlInfo(){
  try{
    const ro = Intl.DateTimeFormat().resolvedOptions() || {};
    return { locale: ro.locale || "", calendar: ro.calendar || "", numberingSystem: ro.numberingSystem || "", hourCycle: ro.hourCycle || "" };
  }catch{ return {}; }
}

async function collectDeviceFingerprint(){
  const nav = navigator || {};
  const scr = screen || {};
  const tz = (()=>{ try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
  const plugins = (()=>{
    try { return Array.from(nav.plugins || []).map((p)=>`${p.name}:${p.filename}:${p.description}`).slice(0, 50).join("|"); } catch { return ""; }
  })();
  const colorScheme = (()=>{ try { return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return ""; } })();
  const reducedMotion = (()=>{ try { return matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference"; } catch { return ""; } })();
  const vv = window.visualViewport || {};
  const [canvasHash, audioHash, fontsHash, webgl, pluginsHash, clientHints, storage] = await Promise.all([
    getCanvasHash(),
    getAudioHash(),
    getFontsHash(),
    getWebglInfo(),
    sha256Hex(plugins),
    getClientHints(),
    getStorageInfo(),
  ]);
  return {
    userAgent: nav.userAgent || "",
    language: nav.language || "",
    languages: Array.isArray(nav.languages) ? nav.languages.slice(0, 12) : [],
    platform: nav.platform || "",
    vendor: nav.vendor || "",
    hardwareConcurrency: nav.hardwareConcurrency || "",
    deviceMemory: nav.deviceMemory || "",
    maxTouchPoints: nav.maxTouchPoints || "",
    cookieEnabled: nav.cookieEnabled,
    webdriver: !!nav.webdriver,
    doNotTrack: nav.doNotTrack || window.doNotTrack || "",
    timezone: tz,
    timezoneOffset: new Date().getTimezoneOffset(),
    colorScheme,
    reducedMotion,
    intl: getIntlInfo(),
    screen: {
      width: scr.width || "",
      height: scr.height || "",
      availWidth: scr.availWidth || "",
      availHeight: scr.availHeight || "",
      colorDepth: scr.colorDepth || "",
      pixelDepth: scr.pixelDepth || "",
      devicePixelRatio: window.devicePixelRatio || "",
      orientation: scr.orientation?.type || "",
    },
    viewport: {
      innerWidth: window.innerWidth || "",
      innerHeight: window.innerHeight || "",
      outerWidth: window.outerWidth || "",
      outerHeight: window.outerHeight || "",
      clientWidth: document.documentElement?.clientWidth || "",
      clientHeight: document.documentElement?.clientHeight || "",
      visualWidth: vv.width || "",
      visualHeight: vv.height || "",
      visualScale: vv.scale || "",
    },
    webgl,
    clientHints,
    mediaFeatures: getMediaFeatures(),
    storage,
    canvasHash,
    audioHash,
    fontsHash,
    pluginsHash,
  };
}



export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [storedNickname, setStoredNicknameState] = useState("");
  const [userId, setUserId] = useState("");
  const [nicknameRequired, setNicknameRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [agreeHint, setAgreeHint] = useState("");
  const [nicknamePromptReason, setNicknamePromptReason] = useState("");

  useEffect(() => {
    const uid = getStableUserId();
    const nick = getStoredNickname();
    const forcedNickname = new URLSearchParams(window.location.search).has("nickname");
    setUserId(uid);
    setStoredNicknameState(nick);
    setNickname(nick || "");
    // لا نعرض خانة الكنية افتراضيًا.
    // لو الجهاز متعلّم، السيرفر سيستعيد الكنية تلقائيًا حتى بعد Clear Cookies.
    // لو السيرفر احتاج كنية فعلًا، سيرجع nickname_required ونظهر الخانة وقتها فقط.
    setNicknameRequired(forcedNickname);
  }, []);

  const nickErr = useMemo(() => (nicknameRequired && cleanNickname(nickname)) ? nicknameError(nickname) : "", [nickname, nicknameRequired]);
  const canSubmit = useMemo(() => username.trim() && password && (!nicknameRequired || !nickErr), [username, password, nicknameRequired, nickErr]);
  const canProceed = useMemo(() => canSubmit && agreed, [canSubmit, agreed]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setAgreeHint("");

    if (!agreed) {
      setAgreeHint("يرجى وضع علامة ✓ للموافقة قبل تسجيل الدخول.");
      return;
    }
    if (nicknameRequired && cleanNickname(nickname) && nickErr) {
      setErr(nickErr);
      return;
    }

    const uid = userId || getStableUserId();
    const chosenNickname = cleanNickname(nicknameRequired ? nickname : (storedNickname || nickname));

    setBusy(true);
    try {
      const device_fingerprint = await collectDeviceFingerprint();
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          user_id: uid,
          nickname: chosenNickname,
          nickname_from_storage: !!(!nicknameRequired && storedNickname),
          device_fingerprint,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.nickname_required) {
          setNicknameRequired(true);
          setNicknamePromptReason(data?.device_confidence?.best_score
            ? `لم أجد ثقة كافية لاستعادة كنيتك تلقائيًا. اكتب كنية خيالية جديدة. أقرب تطابق: ${data.device_confidence.best_score}%`
            : "هذه أول مرة لهذا الجهاز أو قام الأدمن بطلب إعادة اختيار الكنية. اكتب كنية خيالية فقط.");
          setNickname("");
          setStoredNicknameState("");
          try { localStorage.removeItem(NAME_KEY); } catch {}
          try { document.cookie = `${NAME_KEY}=; path=/; max-age=0; samesite=lax`; } catch {}
        }
        throw new Error(data?.error || "Login failed");
      }

      if (data?.user_id) {
        safeLocalSet(ID_KEY, data.user_id);
        safeSessionSet(ID_KEY, data.user_id);
        safeCookieSet(ID_KEY, data.user_id);
      }
      if (data?.display_name) setStoredNickname(data.display_name);

      window.location.replace("/");
    } catch (e2) {
      setErr(e2?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <div style={styles.logo} aria-hidden />
          <div>
            <div style={styles.title}>SR Tool</div>
            <div style={styles.sub}>Sign in to access the internal dashboard</div>
          </div>
        </div>

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.label}>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              style={styles.input}
              placeholder="Enter username"
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              style={styles.input}
              placeholder="Enter password"
            />
          </label>

          {nicknameRequired ? (
            <div style={styles.nicknameBox} dir="rtl">
              <label style={styles.nicknameLabel}>
                كنيتك داخل التول <span style={styles.required}>*</span>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  autoComplete="off"
                  maxLength={40}
                  style={{ ...styles.input, ...styles.nicknameInput }}
                  placeholder="مثال: عقرب الصحراء"
                />
              </label>
              <div style={styles.nicknameHint}>{nicknamePromptReason || "اكتب كنية خيالية فقط ولا تكتب اسمك الحقيقي. لن تظهر هذه الخانة مرة أخرى إلا إذا كان الجهاز جديدًا أو قام الأدمن بعمل Reset nickname."}</div>
              {nickErr ? <div style={styles.nickError}>{nickErr}</div> : null}
            </div>
          ) : storedNickname ? (
            <div style={styles.nicknameSaved} dir="rtl">
              كنيتك الحالية داخل التول: <b>{storedNickname}</b>
            </div>
          ) : (
            <div style={styles.nicknameRecovering} dir="rtl">
              سيتم استعادة كنيتك تلقائيًا من الجهاز إن كانت مسجلة. لن نطلب كنية جديدة إلا عند الحاجة.
            </div>
          )}

          {err ? <div style={styles.error}>{err}</div> : null}

          <button type="submit"
            disabled={!canSubmit || busy}
            aria-disabled={!canProceed || busy}
            onClick={(e) => {
              if (!agreed) {
                e.preventDefault();
                setAgreeHint("يرجى وضع علامة ✓ للموافقة قبل تسجيل الدخول.");
              }
            }}
            style={{
              ...styles.btn,
              ...((!canProceed || busy) ? styles.btnDisabled : null),
              ...(busy ? styles.btnBusy : null),
            }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <div style={styles.consentBox} dir="rtl">
            <label style={styles.consentLabel}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  setAgreeHint("");
                }}
                style={styles.checkbox}
              />
              <span style={styles.consentText}>
                أقرّ وأوافق على استخدام هذه الأداة بناءً على مسؤوليتي الشخصية.
              </span>
            </label>
            {agreeHint ? <div style={styles.agreeHint}>{agreeHint}</div> : null}
          </div>
        </form>
      </div>

      <div style={styles.footer}>
        Protected by a server-side session cookie (HttpOnly/Secure/SameSite).
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "linear-gradient(135deg, #0b1020 0%, #0f172a 50%, #111827 100%)",
    color: "white",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  },
  card: {
    width: "100%",
    maxWidth: 460,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)",
  },
  brandRow: { display: "flex", gap: 14, alignItems: "center", marginBottom: 14 },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "linear-gradient(135deg, #22c55e 0%, #3b82f6 100%)",
  },
  title: { fontSize: 22, fontWeight: 700, lineHeight: 1.2 },
  sub: { fontSize: 13, opacity: 0.85, marginTop: 2 },
  form: { display: "grid", gap: 12, marginTop: 14 },
  label: { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 },
  input: {
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    padding: "0 12px",
    outline: "none",
  },
  nicknameBox: {
    display: "grid",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(34,197,94,0.35)",
    background: "linear-gradient(135deg, rgba(34,197,94,0.13), rgba(59,130,246,0.09))",
  },
  nicknameLabel: { display: "grid", gap: 7, fontSize: 13, fontWeight: 800 },
  nicknameInput: { textAlign: "right", fontWeight: 700, letterSpacing: 0 },
  nicknameHint: { fontSize: 12, lineHeight: 1.5, opacity: 0.86 },
  nicknameSaved: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.22)",
    fontSize: 13,
  },
  nicknameRecovering: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(59,130,246,0.10)",
    border: "1px solid rgba(59,130,246,0.22)",
    fontSize: 13,
    lineHeight: 1.5,
  },
  required: { color: "#fca5a5" },
  nickError: { fontSize: 12, color: "#fecaca" },
  btn: {
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.14)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 6,
  },
  btnDisabled: { opacity: 0.45, cursor: "not-allowed" },
  btnBusy: { opacity: 0.75, cursor: "not-allowed" },
  error: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(239,68,68,0.18)",
    border: "1px solid rgba(239,68,68,0.35)",
    fontSize: 13,
  },
  consentBox: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  consentLabel: { display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" },
  checkbox: { marginTop: 2, width: 16, height: 16, accentColor: "#22c55e" },
  consentText: { fontSize: 13, lineHeight: 1.45 },
  agreeHint: { marginTop: 8, fontSize: 12, color: "#fde68a" },
  hint: { fontSize: 12, opacity: 0.8, marginTop: 8, lineHeight: 1.4 },
  footer: { marginTop: 18, fontSize: 12, opacity: 0.7, textAlign: "center" },
};
