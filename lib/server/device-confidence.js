import crypto from "node:crypto";
import { cleanNickname, normalizeUserId, isMissingTableOrColumn } from "./nickname.js";

const MAX_FIELD = 420;
const MAX_HASH = 128;

// Step 4.4: smoother recovery with stronger multi-signal confidence.
// Auto recovery is now allowed at 80% when there is a clear gap from any other user.
export const DEVICE_AUTO_RECOVERY_THRESHOLD = 80;
export const DEVICE_AMBIGUITY_GAP = 10;

const LEGACY_FIELDS = [
  "ip_hash",
  "ua_hash",
  "lang_hash",
  "platform_hash",
  "screen_hash",
  "timezone_hash",
  "graphics_hash",
  "canvas_hash",
  "fonts_hash",
];

const ENHANCED_FIELDS = [
  "client_hints_hash",
  "media_hash",
  "viewport_hash",
  "storage_hash",
  "audio_hash",
];

const WEIGHTS = {
  ip_hash: 10,
  ua_hash: 13,
  lang_hash: 5,
  platform_hash: 10,
  screen_hash: 10,
  timezone_hash: 6,
  graphics_hash: 14,
  canvas_hash: 8,
  fonts_hash: 6,
  client_hints_hash: 6,
  media_hash: 4,
  viewport_hash: 3,
  storage_hash: 2,
  audio_hash: 3,
};

const DEVICE_SELECT_ENHANCED = "user_id, display_name, device_hash, ip_hash, ua_hash, lang_hash, platform_hash, screen_hash, timezone_hash, graphics_hash, canvas_hash, fonts_hash, client_hints_hash, media_hash, viewport_hash, storage_hash, audio_hash, confidence_score, last_seen_at, revoked_at";
const DEVICE_SELECT_LEGACY = "user_id, display_name, device_hash, ip_hash, ua_hash, lang_hash, platform_hash, screen_hash, timezone_hash, graphics_hash, canvas_hash, fonts_hash, confidence_score, last_seen_at, revoked_at";

function s(value, max = MAX_FIELD){
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function n(value){
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : "";
}

function compactArray(value, maxItems = 20, maxLen = 80){
  return Array.isArray(value) ? value.map((x)=>s(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];
}

function stableJson(value){
  if(value === null || value === undefined) return "";
  if(Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if(typeof value === "object"){
    return `{${Object.keys(value).sort().map((k)=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function shortHash(value){
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function hmac(secret, value){
  const key = String(secret || "");
  if(!key) return "";
  return crypto.createHmac("sha256", key).update(String(value || "")).digest("hex");
}

function hmacShort(secret, value){
  const full = hmac(secret, value);
  return full ? full.slice(0, 24) : "";
}

export function getClientIp(request){
  const cfIp = request.headers.get("cf-connecting-ip");
  const realIp = request.headers.get("x-real-ip");
  const xf = request.headers.get("x-forwarded-for");
  return s(cfIp || realIp || (xf ? xf.split(",")[0].trim() : "") || "unknown", 80);
}

export function sanitizeDeviceSignals(raw = {}){
  const r = raw && typeof raw === "object" ? raw : {};
  const screen = r.screen && typeof r.screen === "object" ? r.screen : {};
  const viewport = r.viewport && typeof r.viewport === "object" ? r.viewport : {};
  const webgl = r.webgl && typeof r.webgl === "object" ? r.webgl : {};
  const clientHints = r.clientHints && typeof r.clientHints === "object" ? r.clientHints : {};
  const storage = r.storage && typeof r.storage === "object" ? r.storage : {};
  const media = r.mediaFeatures && typeof r.mediaFeatures === "object" ? r.mediaFeatures : {};
  const intl = r.intl && typeof r.intl === "object" ? r.intl : {};
  return {
    userAgent: s(r.userAgent, 420),
    language: s(r.language, 80),
    languages: compactArray(r.languages, 12, 40),
    platform: s(r.platform, 120),
    vendor: s(r.vendor, 120),
    hardwareConcurrency: n(r.hardwareConcurrency),
    deviceMemory: n(r.deviceMemory),
    maxTouchPoints: n(r.maxTouchPoints),
    cookieEnabled: r.cookieEnabled === true ? "1" : r.cookieEnabled === false ? "0" : "",
    webdriver: r.webdriver === true ? "1" : r.webdriver === false ? "0" : "",
    doNotTrack: s(r.doNotTrack, 40),
    timezone: s(r.timezone, 120),
    timezoneOffset: n(r.timezoneOffset),
    colorScheme: s(r.colorScheme, 20),
    reducedMotion: s(r.reducedMotion, 20),
    intl: {
      locale: s(intl.locale, 80),
      calendar: s(intl.calendar, 40),
      numberingSystem: s(intl.numberingSystem, 40),
      hourCycle: s(intl.hourCycle, 20),
    },
    screen: {
      width: n(screen.width),
      height: n(screen.height),
      availWidth: n(screen.availWidth),
      availHeight: n(screen.availHeight),
      colorDepth: n(screen.colorDepth),
      pixelDepth: n(screen.pixelDepth),
      devicePixelRatio: n(screen.devicePixelRatio),
      orientation: s(screen.orientation, 40),
    },
    viewport: {
      innerWidth: n(viewport.innerWidth),
      innerHeight: n(viewport.innerHeight),
      outerWidth: n(viewport.outerWidth),
      outerHeight: n(viewport.outerHeight),
      clientWidth: n(viewport.clientWidth),
      clientHeight: n(viewport.clientHeight),
      visualWidth: n(viewport.visualWidth),
      visualHeight: n(viewport.visualHeight),
      visualScale: n(viewport.visualScale),
    },
    webgl: {
      vendor: s(webgl.vendor, 160),
      renderer: s(webgl.renderer, 220),
      version: s(webgl.version, 120),
      shadingLanguageVersion: s(webgl.shadingLanguageVersion, 120),
      maxTextureSize: n(webgl.maxTextureSize),
      maxRenderbufferSize: n(webgl.maxRenderbufferSize),
      maxVertexAttribs: n(webgl.maxVertexAttribs),
      maxCombinedTextureImageUnits: n(webgl.maxCombinedTextureImageUnits),
      extensionsHash: s(webgl.extensionsHash, MAX_HASH),
      paramsHash: s(webgl.paramsHash, MAX_HASH),
    },
    clientHints: {
      brands: compactArray(clientHints.brands, 12, 80),
      fullVersionList: compactArray(clientHints.fullVersionList, 12, 120),
      mobile: clientHints.mobile === true ? "1" : clientHints.mobile === false ? "0" : "",
      platform: s(clientHints.platform, 80),
      platformVersion: s(clientHints.platformVersion, 80),
      architecture: s(clientHints.architecture, 40),
      bitness: s(clientHints.bitness, 20),
      model: s(clientHints.model, 80),
      uaFullVersion: s(clientHints.uaFullVersion, 80),
      wow64: clientHints.wow64 === true ? "1" : clientHints.wow64 === false ? "0" : "",
    },
    mediaFeatures: {
      pointer: s(media.pointer, 30),
      anyPointer: s(media.anyPointer, 30),
      hover: s(media.hover, 30),
      anyHover: s(media.anyHover, 30),
      colorGamut: s(media.colorGamut, 30),
      contrast: s(media.contrast, 30),
      forcedColors: s(media.forcedColors, 30),
      monochrome: s(media.monochrome, 30),
      update: s(media.update, 30),
      dynamicRange: s(media.dynamicRange, 30),
    },
    storage: {
      quotaBucket: s(storage.quotaBucket, 40),
      usageBucket: s(storage.usageBucket, 40),
      persisted: storage.persisted === true ? "1" : storage.persisted === false ? "0" : "",
    },
    canvasHash: s(r.canvasHash, MAX_HASH),
    audioHash: s(r.audioHash, MAX_HASH),
    fontsHash: s(r.fontsHash, MAX_HASH),
    pluginsHash: s(r.pluginsHash, MAX_HASH),
  };
}

function buildSignalStrings(request, rawSignals){
  const sig = sanitizeDeviceSignals(rawSignals);
  const reqUa = s(request.headers.get("user-agent") || "", 420);
  const acceptLang = s(request.headers.get("accept-language") || "", 200);
  const ip = getClientIp(request);
  const ua = sig.userAgent || reqUa;
  const lang = [sig.language, sig.languages.join(","), acceptLang].join("|");
  const platform = [
    sig.platform,
    sig.vendor,
    sig.hardwareConcurrency,
    sig.deviceMemory,
    sig.maxTouchPoints,
    sig.cookieEnabled,
    sig.webdriver,
    sig.doNotTrack,
    sig.colorScheme,
    sig.reducedMotion,
    stableJson(sig.intl),
  ].join("|");
  const screen = [
    sig.screen.width,
    sig.screen.height,
    sig.screen.availWidth,
    sig.screen.availHeight,
    sig.screen.colorDepth,
    sig.screen.pixelDepth,
    sig.screen.devicePixelRatio,
    sig.screen.orientation,
  ].join("|");
  const viewport = stableJson(sig.viewport);
  const timezone = [sig.timezone, sig.timezoneOffset].join("|");
  const graphics = [
    sig.webgl.vendor,
    sig.webgl.renderer,
    sig.webgl.version,
    sig.webgl.shadingLanguageVersion,
    sig.webgl.maxTextureSize,
    sig.webgl.maxRenderbufferSize,
    sig.webgl.maxVertexAttribs,
    sig.webgl.maxCombinedTextureImageUnits,
    sig.webgl.extensionsHash,
    sig.webgl.paramsHash,
  ].join("|");
  const canvas = sig.canvasHash;
  const fonts = [sig.fontsHash, sig.pluginsHash].join("|");
  const clientHints = stableJson(sig.clientHints);
  const media = stableJson(sig.mediaFeatures);
  const storage = stableJson(sig.storage);
  const audio = sig.audioHash;
  // Keep the main device_hash compatible with Step 4.3 stable components.
  const all = [ip, ua, lang, platform, screen, timezone, graphics, canvas, fonts].join("||");
  return { sig, ip, ua, lang, platform, screen, viewport, timezone, graphics, canvas, fonts, clientHints, media, storage, audio, all };
}

export function buildDeviceConfidence(request, rawSignals, secret){
  const fpSecret = String(process.env.DEVICE_FINGERPRINT_SECRET || secret || process.env.SESSION_SECRET || "");
  if(!fpSecret) return { ok:false, error:"Missing fingerprint secret." };
  const parts = buildSignalStrings(request, rawSignals);
  const component_hashes = {
    ip_hash: hmac(fpSecret, `ip|${parts.ip}`),
    ua_hash: hmac(fpSecret, `ua|${parts.ua}`),
    lang_hash: hmac(fpSecret, `lang|${parts.lang}`),
    platform_hash: hmac(fpSecret, `platform|${parts.platform}`),
    screen_hash: hmac(fpSecret, `screen|${parts.screen}`),
    timezone_hash: hmac(fpSecret, `timezone|${parts.timezone}`),
    graphics_hash: hmac(fpSecret, `graphics|${parts.graphics}`),
    canvas_hash: hmac(fpSecret, `canvas|${parts.canvas}`),
    fonts_hash: hmac(fpSecret, `fonts|${parts.fonts}`),
    client_hints_hash: hmac(fpSecret, `client-hints|${parts.clientHints}`),
    media_hash: hmac(fpSecret, `media|${parts.media}`),
    viewport_hash: hmac(fpSecret, `viewport|${parts.viewport}`),
    storage_hash: hmac(fpSecret, `storage|${parts.storage}`),
    audio_hash: hmac(fpSecret, `audio|${parts.audio}`),
  };
  const device_hash = hmac(fpSecret, `device-v3|${parts.all}`);
  const signal_summary = {
    confidence_version: "4.4",
    browser: parts.sig.userAgent ? parts.sig.userAgent.slice(0, 120) : "",
    platform: parts.sig.platform || parts.sig.clientHints.platform || "",
    language: parts.sig.language || "",
    timezone: parts.sig.timezone || "",
    screen: [parts.sig.screen.width, parts.sig.screen.height].filter(Boolean).join("x"),
    viewport: [parts.sig.viewport.innerWidth, parts.sig.viewport.innerHeight].filter(Boolean).join("x"),
    dpr: parts.sig.screen.devicePixelRatio || "",
    touch: parts.sig.maxTouchPoints || "0",
    graphics: [parts.sig.webgl.vendor, parts.sig.webgl.renderer].filter(Boolean).join(" / ").slice(0, 180),
    client_hints: [parts.sig.clientHints.platform, parts.sig.clientHints.architecture, parts.sig.clientHints.bitness].filter(Boolean).join(" / ").slice(0, 120),
    media: [parts.sig.mediaFeatures.pointer, parts.sig.mediaFeatures.hover, parts.sig.mediaFeatures.colorGamut].filter(Boolean).join(" / "),
    canvas: parts.sig.canvasHash ? shortHash(parts.sig.canvasHash) : "",
    audio: parts.sig.audioHash ? shortHash(parts.sig.audioHash) : "",
    fonts: parts.sig.fontsHash ? shortHash(parts.sig.fontsHash) : "",
    ip_bucket: hmacShort(fpSecret, `admin-ip-bucket|${parts.ip}`),
  };
  return { ok:true, device_hash, component_hashes, signal_summary };
}

function scoreCandidate(candidate = {}, componentHashes = {}){
  if(candidate.device_hash && candidate.device_hash === componentHashes.device_hash) return 100;
  let score = 0;
  for(const [field, weight] of Object.entries(WEIGHTS)){
    const a = String(candidate[field] || "");
    const b = String(componentHashes[field] || "");
    if(a && b && a === b) score += weight;
  }
  return Math.max(0, Math.min(100, score));
}

function isDeviceTableMissing(error){
  return isMissingTableOrColumn(error) || /support_user_devices/i.test(String(error?.message || ""));
}

function isEnhancedColumnMissing(error){
  return /client_hints_hash|media_hash|viewport_hash|storage_hash|audio_hash|schema cache|column .*does not exist/i.test(String(error?.message || ""));
}

async function readActiveProfile(supabase, userId){
  const uid = normalizeUserId(userId);
  if(!uid) return null;
  let res = await supabase
    .from("support_users")
    .select("user_id, display_name, nickname_reset_required")
    .eq("user_id", uid)
    .limit(1);
  if(res.error && /nickname_reset_required|column .*does not exist|schema cache/i.test(String(res.error.message || ""))){
    res = await supabase.from("support_users").select("user_id, display_name").eq("user_id", uid).limit(1);
  }
  if(res.error || !Array.isArray(res.data) || !res.data[0]) return null;
  const row = res.data[0];
  const displayName = cleanNickname(row.display_name || "");
  if(!displayName || row.nickname_reset_required) return null;
  return { user_id: uid, display_name: displayName };
}

async function queryExactDevices(supabase, fp){
  let res = await supabase
    .from("support_user_devices")
    .select(DEVICE_SELECT_ENHANCED)
    .eq("device_hash", fp.device_hash)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending:false })
    .limit(3);
  if(res.error && isEnhancedColumnMissing(res.error)){
    const legacy = await supabase
      .from("support_user_devices")
      .select(DEVICE_SELECT_LEGACY)
      .eq("device_hash", fp.device_hash)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending:false })
      .limit(3);
    return { res: legacy, enhanced:false };
  }
  return { res, enhanced:true };
}

async function queryFuzzyDevices(supabase, component, enhanced){
  const fields = enhanced ? [...LEGACY_FIELDS, ...ENHANCED_FIELDS] : LEGACY_FIELDS;
  const orParts = [];
  for(const field of fields){
    const v = String(component[field] || "");
    if(v) orParts.push(`${field}.eq.${v}`);
  }
  let q = supabase
    .from("support_user_devices")
    .select(enhanced ? DEVICE_SELECT_ENHANCED : DEVICE_SELECT_LEGACY)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending:false })
    .limit(500);
  if(orParts.length) q = q.or(orParts.join(","));
  return await q;
}

export async function findDeviceNicknameMatch(supabase, fp, options = {}){
  if(!fp?.ok || !fp.device_hash) return { ok:true, matched:false, reason:"no_fingerprint" };
  const threshold = Number(options.threshold || DEVICE_AUTO_RECOVERY_THRESHOLD);

  try{
    const component = fp.component_hashes || {};
    component.device_hash = fp.device_hash;

    const exactResult = await queryExactDevices(supabase, fp);
    let exact = exactResult.res;
    let enhanced = exactResult.enhanced;

    if(exact.error){
      if(isDeviceTableMissing(exact.error)) return { ok:true, matched:false, missing_table:true, reason:"missing_table" };
      return { ok:false, error:exact.error.message || "Could not read device locks." };
    }

    let candidates = Array.isArray(exact.data) ? exact.data : [];

    if(candidates.length === 0){
      let fuzzy = await queryFuzzyDevices(supabase, component, enhanced);
      if(fuzzy.error && enhanced && isEnhancedColumnMissing(fuzzy.error)){
        enhanced = false;
        fuzzy = await queryFuzzyDevices(supabase, component, false);
      }
      if(fuzzy.error){
        if(isDeviceTableMissing(fuzzy.error)) return { ok:true, matched:false, missing_table:true, reason:"missing_table" };
        return { ok:false, error:fuzzy.error.message || "Could not read device candidates." };
      }
      candidates = Array.isArray(fuzzy.data) ? fuzzy.data : [];
    }

    const scored = [];
    for(const c of candidates){
      const uid = normalizeUserId(c.user_id);
      if(!uid) continue;
      const score = scoreCandidate(c, component);
      if(score <= 0) continue;
      scored.push({ ...c, user_id: uid, score });
    }
    scored.sort((a,b)=> b.score - a.score || String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")));

    const best = scored[0];
    if(!best || best.score < threshold){
      return { ok:true, matched:false, reason:"low_confidence", best_score: best?.score || 0, threshold, enhanced };
    }

    const secondDifferentUser = scored.find((x)=>x.user_id !== best.user_id);
    if(secondDifferentUser && (best.score - secondDifferentUser.score) < DEVICE_AMBIGUITY_GAP){
      return { ok:true, matched:false, ambiguous:true, reason:"ambiguous", best_score:best.score, second_score:secondDifferentUser.score, threshold, enhanced };
    }

    const profile = await readActiveProfile(supabase, best.user_id);
    const displayName = profile?.display_name || cleanNickname(best.display_name || "");
    if(!profile || !displayName){
      return { ok:true, matched:false, reason:"profile_reset_or_missing", best_score:best.score, threshold, enhanced };
    }

    return { ok:true, matched:true, user_id:profile.user_id, display_name:displayName, confidence_score:best.score, device_hash:best.device_hash, enhanced };
  }catch(err){
    return { ok:false, error:String(err?.message || err || "Could not match device nickname.") };
  }
}

function baseDevicePayload(userId, displayName, fp, confidenceScore){
  const c = fp.component_hashes || {};
  const now = new Date().toISOString();
  return {
    user_id: userId,
    display_name: displayName,
    device_hash: fp.device_hash,
    ip_hash: c.ip_hash || "",
    ua_hash: c.ua_hash || "",
    lang_hash: c.lang_hash || "",
    platform_hash: c.platform_hash || "",
    screen_hash: c.screen_hash || "",
    timezone_hash: c.timezone_hash || "",
    graphics_hash: c.graphics_hash || "",
    canvas_hash: c.canvas_hash || "",
    fonts_hash: c.fonts_hash || "",
    signal_summary: fp.signal_summary || {},
    confidence_score: Math.max(0, Math.min(100, Number(confidenceScore || 100))),
    last_seen_at: now,
    revoked_at: null,
  };
}

function enhancedDevicePayload(userId, displayName, fp, confidenceScore){
  const c = fp.component_hashes || {};
  return {
    ...baseDevicePayload(userId, displayName, fp, confidenceScore),
    client_hints_hash: c.client_hints_hash || "",
    media_hash: c.media_hash || "",
    viewport_hash: c.viewport_hash || "",
    storage_hash: c.storage_hash || "",
    audio_hash: c.audio_hash || "",
  };
}

export async function recordDeviceNickname(supabase, userId, displayName, fp, confidenceScore = 100){
  const uid = normalizeUserId(userId);
  const name = cleanNickname(displayName || "");
  if(!uid || !name || !fp?.ok || !fp.device_hash) return { ok:true, skipped:true };
  try{
    let existing = await supabase
      .from("support_user_devices")
      .select("id, user_id, match_count")
      .eq("device_hash", fp.device_hash)
      .limit(1);
    if(existing.error){
      if(isDeviceTableMissing(existing.error)) return { ok:true, missing_table:true };
      return { ok:false, error:existing.error.message || "Could not read device lock." };
    }
    const row = Array.isArray(existing.data) ? existing.data[0] : null;
    const payload = enhancedDevicePayload(uid, name, fp, confidenceScore);
    const legacyPayload = baseDevicePayload(uid, name, fp, confidenceScore);
    if(row?.id){
      let updated = await supabase
        .from("support_user_devices")
        .update({ ...payload, match_count: Number(row.match_count || 0) + 1 })
        .eq("id", row.id);
      if(updated.error && isEnhancedColumnMissing(updated.error)){
        updated = await supabase
          .from("support_user_devices")
          .update({ ...legacyPayload, match_count: Number(row.match_count || 0) + 1 })
          .eq("id", row.id);
      }
      if(updated.error){
        if(isDeviceTableMissing(updated.error)) return { ok:true, missing_table:true };
        return { ok:false, error:updated.error.message || "Could not update device lock." };
      }
      return { ok:true, updated:true };
    }
    let inserted = await supabase
      .from("support_user_devices")
      .insert({ ...payload, first_seen_at: new Date().toISOString(), match_count: 1 });
    if(inserted.error && isEnhancedColumnMissing(inserted.error)){
      inserted = await supabase
        .from("support_user_devices")
        .insert({ ...legacyPayload, first_seen_at: new Date().toISOString(), match_count: 1 });
    }
    if(inserted.error){
      if(isDeviceTableMissing(inserted.error)) return { ok:true, missing_table:true };
      return { ok:false, error:inserted.error.message || "Could not save device lock." };
    }
    return { ok:true, inserted:true };
  }catch(err){
    return { ok:false, error:String(err?.message || err || "Could not save device lock.") };
  }
}

export async function touchDeviceNickname(supabase, deviceHash){
  const dh = String(deviceHash || "").trim();
  if(!dh) return { ok:true, skipped:true };
  try{
    const res = await supabase
      .from("support_user_devices")
      .update({ last_seen_at:new Date().toISOString() })
      .eq("device_hash", dh)
      .is("revoked_at", null);
    if(res.error && isDeviceTableMissing(res.error)) return { ok:true, missing_table:true };
    if(res.error) return { ok:false, error:res.error.message || "Could not touch device lock." };
    return { ok:true };
  }catch(err){
    return { ok:false, error:String(err?.message || err || "Could not touch device lock.") };
  }
}

export async function revokeDevicesForUser(supabase, userId){
  const uid = normalizeUserId(userId);
  if(!uid) return { ok:true, skipped:true };
  try{
    const res = await supabase
      .from("support_user_devices")
      .update({ revoked_at:new Date().toISOString() })
      .eq("user_id", uid)
      .is("revoked_at", null);
    if(res.error && isDeviceTableMissing(res.error)) return { ok:true, missing_table:true };
    if(res.error) return { ok:false, error:res.error.message || "Could not revoke device locks." };
    return { ok:true };
  }catch(err){
    return { ok:false, error:String(err?.message || err || "Could not revoke device locks.") };
  }
}
