import crypto from "node:crypto";
import { cleanNickname, normalizeUserId, isMissingTableOrColumn } from "./nickname.js";

const MAX_FIELD = 320;
const MAX_HASH = 96;
export const DEVICE_AUTO_RECOVERY_THRESHOLD = 88;
export const DEVICE_AMBIGUITY_GAP = 8;

const WEIGHTS = {
  ip_hash: 14,
  ua_hash: 18,
  lang_hash: 6,
  platform_hash: 12,
  screen_hash: 12,
  timezone_hash: 8,
  graphics_hash: 18,
  canvas_hash: 8,
  fonts_hash: 4,
};

function s(value, max = MAX_FIELD){
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function n(value){
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : "";
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
  const webgl = r.webgl && typeof r.webgl === "object" ? r.webgl : {};
  return {
    userAgent: s(r.userAgent, 420),
    language: s(r.language, 80),
    languages: Array.isArray(r.languages) ? r.languages.map((x)=>s(x, 40)).filter(Boolean).slice(0, 12) : [],
    platform: s(r.platform, 120),
    vendor: s(r.vendor, 120),
    hardwareConcurrency: n(r.hardwareConcurrency),
    deviceMemory: n(r.deviceMemory),
    maxTouchPoints: n(r.maxTouchPoints),
    cookieEnabled: r.cookieEnabled === true ? "1" : r.cookieEnabled === false ? "0" : "",
    doNotTrack: s(r.doNotTrack, 40),
    timezone: s(r.timezone, 120),
    timezoneOffset: n(r.timezoneOffset),
    colorScheme: s(r.colorScheme, 20),
    reducedMotion: s(r.reducedMotion, 20),
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
    webgl: {
      vendor: s(webgl.vendor, 160),
      renderer: s(webgl.renderer, 220),
      version: s(webgl.version, 120),
      shadingLanguageVersion: s(webgl.shadingLanguageVersion, 120),
      maxTextureSize: n(webgl.maxTextureSize),
      extensionsHash: s(webgl.extensionsHash, MAX_HASH),
      paramsHash: s(webgl.paramsHash, MAX_HASH),
    },
    canvasHash: s(r.canvasHash, MAX_HASH),
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
    sig.doNotTrack,
    sig.colorScheme,
    sig.reducedMotion,
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
  const timezone = [sig.timezone, sig.timezoneOffset].join("|");
  const graphics = [
    sig.webgl.vendor,
    sig.webgl.renderer,
    sig.webgl.version,
    sig.webgl.shadingLanguageVersion,
    sig.webgl.maxTextureSize,
    sig.webgl.extensionsHash,
    sig.webgl.paramsHash,
  ].join("|");
  const canvas = sig.canvasHash;
  const fonts = [sig.fontsHash, sig.pluginsHash].join("|");
  const all = [ip, ua, lang, platform, screen, timezone, graphics, canvas, fonts].join("||");
  return { sig, ip, ua, lang, platform, screen, timezone, graphics, canvas, fonts, all };
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
  };
  const device_hash = hmac(fpSecret, `device-v3|${parts.all}`);
  const signal_summary = {
    browser: parts.sig.userAgent ? parts.sig.userAgent.slice(0, 120) : "",
    platform: parts.sig.platform || "",
    language: parts.sig.language || "",
    timezone: parts.sig.timezone || "",
    screen: [parts.sig.screen.width, parts.sig.screen.height].filter(Boolean).join("x"),
    dpr: parts.sig.screen.devicePixelRatio || "",
    touch: parts.sig.maxTouchPoints || "0",
    graphics: [parts.sig.webgl.vendor, parts.sig.webgl.renderer].filter(Boolean).join(" / ").slice(0, 180),
    canvas: parts.sig.canvasHash ? shortHash(parts.sig.canvasHash) : "",
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

export async function findDeviceNicknameMatch(supabase, fp, options = {}){
  if(!fp?.ok || !fp.device_hash) return { ok:true, matched:false, reason:"no_fingerprint" };
  const threshold = Number(options.threshold || DEVICE_AUTO_RECOVERY_THRESHOLD);

  try{
    const component = fp.component_hashes || {};
    component.device_hash = fp.device_hash;

    let exact = await supabase
      .from("support_user_devices")
      .select("user_id, display_name, device_hash, ip_hash, ua_hash, lang_hash, platform_hash, screen_hash, timezone_hash, graphics_hash, canvas_hash, fonts_hash, confidence_score, last_seen_at, revoked_at")
      .eq("device_hash", fp.device_hash)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending:false })
      .limit(3);

    if(exact.error){
      if(isDeviceTableMissing(exact.error)) return { ok:true, matched:false, missing_table:true, reason:"missing_table" };
      return { ok:false, error:exact.error.message || "Could not read device locks." };
    }

    let candidates = Array.isArray(exact.data) ? exact.data : [];

    if(candidates.length === 0){
      const orParts = [];
      for(const field of Object.keys(WEIGHTS)){
        const v = String(component[field] || "");
        if(v) orParts.push(`${field}.eq.${v}`);
      }
      let q = supabase
        .from("support_user_devices")
        .select("user_id, display_name, device_hash, ip_hash, ua_hash, lang_hash, platform_hash, screen_hash, timezone_hash, graphics_hash, canvas_hash, fonts_hash, confidence_score, last_seen_at, revoked_at")
        .is("revoked_at", null)
        .order("last_seen_at", { ascending:false })
        .limit(500);
      if(orParts.length) q = q.or(orParts.join(","));
      const fuzzy = await q;
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
      return { ok:true, matched:false, reason:"low_confidence", best_score: best?.score || 0 };
    }

    const secondDifferentUser = scored.find((x)=>x.user_id !== best.user_id);
    if(secondDifferentUser && (best.score - secondDifferentUser.score) < DEVICE_AMBIGUITY_GAP){
      return { ok:true, matched:false, ambiguous:true, reason:"ambiguous", best_score:best.score, second_score:secondDifferentUser.score };
    }

    const profile = await readActiveProfile(supabase, best.user_id);
    const displayName = profile?.display_name || cleanNickname(best.display_name || "");
    if(!profile || !displayName){
      return { ok:true, matched:false, reason:"profile_reset_or_missing", best_score:best.score };
    }

    return { ok:true, matched:true, user_id:profile.user_id, display_name:displayName, confidence_score:best.score, device_hash:best.device_hash };
  }catch(err){
    return { ok:false, error:String(err?.message || err || "Could not match device nickname.") };
  }
}

export async function recordDeviceNickname(supabase, userId, displayName, fp, confidenceScore = 100){
  const uid = normalizeUserId(userId);
  const name = cleanNickname(displayName || "");
  if(!uid || !name || !fp?.ok || !fp.device_hash) return { ok:true, skipped:true };
  const c = fp.component_hashes || {};
  const now = new Date().toISOString();
  const payload = {
    user_id: uid,
    display_name: name,
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
    if(row?.id){
      const updated = await supabase
        .from("support_user_devices")
        .update({ ...payload, match_count: Number(row.match_count || 0) + 1 })
        .eq("id", row.id);
      if(updated.error){
        if(isDeviceTableMissing(updated.error)) return { ok:true, missing_table:true };
        return { ok:false, error:updated.error.message || "Could not update device lock." };
      }
      return { ok:true, updated:true };
    }
    const inserted = await supabase
      .from("support_user_devices")
      .insert({ ...payload, first_seen_at: now, match_count: 1 });
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
