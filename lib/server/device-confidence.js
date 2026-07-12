import crypto from "node:crypto";
import { cleanNickname, getNicknameProfile, normalizeUserId, isMissingTableOrColumn } from "./nickname.js";
import { logDeviceObservation } from "./device-audit.js";

const MAX_FIELD = 420;
const MAX_HASH = 128;

// Smart Device Identity v2 recovery rules.
// Exact browser-key + signed cookie remains the strongest proof. The weighted
// fingerprint is used only for strict automatic recovery or a short, signed
// list of likely nicknames after the shared login credentials are verified.
export const DEVICE_AUTO_RECOVERY_THRESHOLD = 95;
export const DEVICE_AMBIGUITY_GAP = 14;
export const DEVICE_SUGGESTION_THRESHOLD = 80;
export const DEVICE_MAX_SUGGESTIONS = 3;
export const DEVICE_MANUAL_RECOVERY_THRESHOLD = 80;
export const DEVICE_MANUAL_SELECTABLE_TOP_N = 3;
export const DEVICE_AUTO_MIN_EVIDENCE_WEIGHT = 64;
export const DEVICE_MANUAL_MIN_EVIDENCE_WEIGHT = 52;
export const DEVICE_AUTO_MIN_STRONG_GROUPS = 3;
export const DEVICE_AUTO_MIN_SUPPORTING_OBSERVATIONS = 2;
export const DEVICE_MANUAL_MIN_STRONG_GROUPS = 2;
export const DEVICE_AUTO_MAX_STABLE_CONTRADICTIONS = 0;
export const DEVICE_MANUAL_MAX_STABLE_CONTRADICTIONS = 1;

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

const BONUS_FIELDS = [
  "keyboard_hash",
  "capabilities_hash",
  "network_hash",
  "battery_hash",
  "media_devices_hash",
];

const SMART_FIELDS = [
  "hardware_profile_hash",
  "rendering_profile_hash",
  "os_family_hash",
  "browser_family_hash",
  "locale_profile_hash",
];

// Each group is normalized independently. This avoids a browser with fewer
// exposed APIs being unfairly scored as a different device and prevents noisy
// values such as IP/battery/network from dominating the decision.
const SCORE_GROUPS = [
  {
    name:"hardware",
    weight:30,
    stable:true,
    composite:"hardware_profile_hash",
    fields:[
      ["graphics_hash",0.42],
      ["screen_hash",0.26],
      ["platform_hash",0.18],
      ["media_devices_hash",0.14],
    ],
  },
  {
    name:"rendering",
    weight:20,
    stable:true,
    composite:"rendering_profile_hash",
    fields:[
      ["canvas_hash",0.30],
      ["fonts_hash",0.24],
      ["audio_hash",0.20],
      ["graphics_hash",0.26],
    ],
  },
  {
    name:"os",
    weight:16,
    stable:true,
    composite:"os_family_hash",
    fields:[
      ["platform_hash",0.45],
      ["client_hints_hash",0.40],
      ["capabilities_hash",0.15],
    ],
  },
  {
    name:"browser",
    weight:9,
    stable:false,
    composite:"browser_family_hash",
    fields:[
      ["ua_hash",0.55],
      ["capabilities_hash",0.30],
      ["client_hints_hash",0.15],
    ],
  },
  {
    name:"locale",
    weight:9,
    stable:false,
    composite:"locale_profile_hash",
    fields:[
      ["lang_hash",0.38],
      ["timezone_hash",0.34],
      ["keyboard_hash",0.28],
    ],
  },
  {
    name:"interaction",
    weight:7,
    stable:false,
    fields:[
      ["media_hash",0.48],
      ["capabilities_hash",0.32],
      ["media_devices_hash",0.20],
    ],
  },
  {
    name:"volatile",
    weight:3,
    stable:false,
    fields:[
      ["ip_hash",0.18],
      ["viewport_hash",0.24],
      ["storage_hash",0.18],
      ["network_hash",0.20],
      ["battery_hash",0.20],
    ],
  },
];

const DEVICE_SELECT_SMART = "id, user_id, display_name, device_hash, ip_hash, ua_hash, lang_hash, platform_hash, screen_hash, timezone_hash, graphics_hash, canvas_hash, fonts_hash, client_hints_hash, media_hash, viewport_hash, storage_hash, audio_hash, keyboard_hash, capabilities_hash, network_hash, battery_hash, media_devices_hash, hardware_profile_hash, rendering_profile_hash, os_family_hash, browser_family_hash, locale_profile_hash, confidence_score, match_count, first_seen_at, last_seen_at, revoked_at";
const DEVICE_SELECT_BONUS = "id, user_id, display_name, device_hash, ip_hash, ua_hash, lang_hash, platform_hash, screen_hash, timezone_hash, graphics_hash, canvas_hash, fonts_hash, client_hints_hash, media_hash, viewport_hash, storage_hash, audio_hash, keyboard_hash, capabilities_hash, network_hash, battery_hash, media_devices_hash, confidence_score, match_count, first_seen_at, last_seen_at, revoked_at";
const DEVICE_SELECT_ENHANCED = "id, user_id, display_name, device_hash, ip_hash, ua_hash, lang_hash, platform_hash, screen_hash, timezone_hash, graphics_hash, canvas_hash, fonts_hash, client_hints_hash, media_hash, viewport_hash, storage_hash, audio_hash, confidence_score, match_count, first_seen_at, last_seen_at, revoked_at";
const DEVICE_SELECT_LEGACY = "id, user_id, display_name, device_hash, ip_hash, ua_hash, lang_hash, platform_hash, screen_hash, timezone_hash, graphics_hash, canvas_hash, fonts_hash, confidence_score, match_count, first_seen_at, last_seen_at, revoked_at";

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

function isRecentlyActiveSuggestion(lastSeen){
  try{
    const t = Date.parse(lastSeen || "");
    if(!Number.isFinite(t)) return false;
    return (Date.now() - t) >= 0 && (Date.now() - t) <= 5 * 60 * 1000;
  }catch{
    return false;
  }
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

function hashSignal(secret, label, value){
  const normalized = String(value || "").trim();
  return normalized ? hmac(secret, `${label}|${normalized}`) : "";
}

function normalizeUaFamily(value){
  return s(String(value || "")
    .toLowerCase()
    .replace(/\b(version|chrome|crios|firefox|fxios|edg|edga|edgios|opr|safari|msie|rv)[\/: ]+[0-9._-]+/g, "$1/#")
    .replace(/[0-9]+(?:[._-][0-9]+)+/g, "#")
    .replace(/\s+/g, " "), 420);
}

function clientHintBrandFamily(hints = {}){
  const brands = Array.isArray(hints.brands) ? hints.brands : [];
  return brands
    .map((item)=>String(item || "").split(":")[0].trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
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
  const keyboard = r.keyboard && typeof r.keyboard === "object" ? r.keyboard : {};
  const capabilities = r.capabilities && typeof r.capabilities === "object" ? r.capabilities : {};
  const network = r.network && typeof r.network === "object" ? r.network : {};
  const battery = r.battery && typeof r.battery === "object" ? r.battery : {};
  const mediaDevices = r.mediaDevices && typeof r.mediaDevices === "object" ? r.mediaDevices : {};
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
    keyboard: {
      layoutHash: s(keyboard.layoutHash, MAX_HASH),
      layoutAvailable: keyboard.layoutAvailable === true ? "1" : keyboard.layoutAvailable === false ? "0" : "",
    },
    capabilities: {
      serviceWorker: capabilities.serviceWorker === true ? "1" : capabilities.serviceWorker === false ? "0" : "",
      webAssembly: capabilities.webAssembly === true ? "1" : capabilities.webAssembly === false ? "0" : "",
      indexedDB: capabilities.indexedDB === true ? "1" : capabilities.indexedDB === false ? "0" : "",
      localStorage: capabilities.localStorage === true ? "1" : capabilities.localStorage === false ? "0" : "",
      sessionStorage: capabilities.sessionStorage === true ? "1" : capabilities.sessionStorage === false ? "0" : "",
      notificationPermission: s(capabilities.notificationPermission, 40),
      pdfViewerEnabled: capabilities.pdfViewerEnabled === true ? "1" : capabilities.pdfViewerEnabled === false ? "0" : "",
      installedPwa: capabilities.installedPwa === true ? "1" : capabilities.installedPwa === false ? "0" : "",
      standalone: capabilities.standalone === true ? "1" : capabilities.standalone === false ? "0" : "",
      apiFlagsHash: s(capabilities.apiFlagsHash, MAX_HASH),
    },
    network: {
      effectiveType: s(network.effectiveType, 40),
      type: s(network.type, 40),
      downlinkBucket: s(network.downlinkBucket, 40),
      rttBucket: s(network.rttBucket, 40),
      saveData: network.saveData === true ? "1" : network.saveData === false ? "0" : "",
    },
    battery: {
      supported: battery.supported === true ? "1" : battery.supported === false ? "0" : "",
      charging: battery.charging === true ? "1" : battery.charging === false ? "0" : "",
      levelBucket: s(battery.levelBucket, 40),
      chargingTimeBucket: s(battery.chargingTimeBucket, 40),
      dischargingTimeBucket: s(battery.dischargingTimeBucket, 40),
    },
    mediaDevices: {
      supported: mediaDevices.supported === true ? "1" : mediaDevices.supported === false ? "0" : "",
      audioInputs: n(mediaDevices.audioInputs),
      audioOutputs: n(mediaDevices.audioOutputs),
      videoInputs: n(mediaDevices.videoInputs),
      kindsHash: s(mediaDevices.kindsHash, MAX_HASH),
    },
    canvasHash: s(r.canvasHash, MAX_HASH),
    audioHash: s(r.audioHash, MAX_HASH),
    fontsHash: s(r.fontsHash, MAX_HASH),
    pluginsHash: s(r.pluginsHash, MAX_HASH),
    deviceInstanceHash: s(r.deviceInstanceHash, MAX_HASH),
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
  const keyboard = stableJson(sig.keyboard);
  const capabilities = stableJson(sig.capabilities);
  const network = stableJson(sig.network);
  const battery = stableJson(sig.battery);
  const mediaDevices = stableJson(sig.mediaDevices);
  const deviceInstance = sig.deviceInstanceHash;
  const browserFamily = [
    normalizeUaFamily(ua),
    clientHintBrandFamily(sig.clientHints),
    sig.clientHints.mobile,
  ].join("|");
  const osFamily = [
    sig.clientHints.platform || sig.platform,
    sig.clientHints.architecture,
    sig.clientHints.bitness,
    sig.clientHints.model,
    sig.clientHints.wow64,
    sig.maxTouchPoints,
  ].join("|");
  const hardwareProfile = [
    sig.platform,
    sig.clientHints.platform,
    sig.clientHints.architecture,
    sig.clientHints.bitness,
    sig.hardwareConcurrency,
    sig.deviceMemory,
    sig.maxTouchPoints,
    sig.screen.width,
    sig.screen.height,
    sig.screen.colorDepth,
    sig.screen.devicePixelRatio,
    sig.webgl.vendor,
    sig.webgl.renderer,
    sig.webgl.maxTextureSize,
    sig.webgl.maxRenderbufferSize,
    sig.mediaDevices.audioInputs,
    sig.mediaDevices.audioOutputs,
    sig.mediaDevices.videoInputs,
  ].join("|");
  const renderingProfile = [graphics, canvas, fonts, audio].join("|");
  const localeProfile = [
    sig.language,
    sig.languages.join(","),
    sig.timezone,
    sig.timezoneOffset,
    sig.intl.locale,
    sig.intl.calendar,
    sig.intl.numberingSystem,
    sig.keyboard.layoutHash,
  ].join("|");
  // Exact observation hash intentionally includes the browser-local secret.
  // Fuzzy recovery never uses this value as the only proof.
  const all = [ua, lang, platform, screen, timezone, graphics, canvas, fonts, deviceInstance].join("||");
  return {
    sig, ip, ua, lang, platform, screen, viewport, timezone, graphics, canvas,
    fonts, clientHints, media, storage, audio, keyboard, capabilities, network,
    battery, mediaDevices, deviceInstance, browserFamily, osFamily,
    hardwareProfile, renderingProfile, localeProfile, all,
  };
}

export function buildDeviceConfidence(request, rawSignals, secret){
  const fpSecret = String(process.env.DEVICE_FINGERPRINT_SECRET || process.env.DEVICE_IDENTITY_SECRET || secret || process.env.SESSION_SECRET || "");
  if(fpSecret.length < 32) return { ok:false, error:"Missing or weak fingerprint secret." };
  const parts = buildSignalStrings(request, rawSignals);
  const component_hashes = {
    ip_hash: hashSignal(fpSecret, "ip", parts.ip),
    ua_hash: hashSignal(fpSecret, "ua", parts.ua),
    lang_hash: hashSignal(fpSecret, "lang", parts.lang),
    platform_hash: hashSignal(fpSecret, "platform", parts.platform),
    screen_hash: hashSignal(fpSecret, "screen", parts.screen),
    timezone_hash: hashSignal(fpSecret, "timezone", parts.timezone),
    graphics_hash: hashSignal(fpSecret, "graphics", parts.graphics),
    canvas_hash: hashSignal(fpSecret, "canvas", parts.canvas),
    fonts_hash: hashSignal(fpSecret, "fonts", parts.fonts),
    client_hints_hash: hashSignal(fpSecret, "client-hints", parts.clientHints),
    media_hash: hashSignal(fpSecret, "media", parts.media),
    viewport_hash: hashSignal(fpSecret, "viewport", parts.viewport),
    storage_hash: hashSignal(fpSecret, "storage", parts.storage),
    audio_hash: hashSignal(fpSecret, "audio", parts.audio),
    keyboard_hash: hashSignal(fpSecret, "keyboard", parts.keyboard),
    capabilities_hash: hashSignal(fpSecret, "capabilities", parts.capabilities),
    network_hash: hashSignal(fpSecret, "network", parts.network),
    battery_hash: hashSignal(fpSecret, "battery", parts.battery),
    media_devices_hash: hashSignal(fpSecret, "media-devices", parts.mediaDevices),
    hardware_profile_hash: hashSignal(fpSecret, "hardware-profile-v2", parts.hardwareProfile),
    rendering_profile_hash: hashSignal(fpSecret, "rendering-profile-v2", parts.renderingProfile),
    os_family_hash: hashSignal(fpSecret, "os-family-v2", parts.osFamily),
    browser_family_hash: hashSignal(fpSecret, "browser-family-v2", parts.browserFamily),
    locale_profile_hash: hashSignal(fpSecret, "locale-profile-v2", parts.localeProfile),
    // High-entropy browser-local key remains the primary silent identity proof.
    device_key_hash: parts.deviceInstance ? hashSignal(fpSecret, "device-key", parts.deviceInstance) : "",
  };
  const device_hash = hashSignal(fpSecret, "device-observation-v5", parts.all);
  const recovery_binding_hash = hashSignal(fpSecret, "recovery-binding-v2", [
    component_hashes.device_key_hash,
    component_hashes.hardware_profile_hash,
    component_hashes.os_family_hash,
    component_hashes.browser_family_hash,
  ].filter(Boolean).join("|"));
  const signal_summary = {
    confidence_version: "5.0",
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
    keyboard: parts.sig.keyboard.layoutHash ? shortHash(parts.sig.keyboard.layoutHash) : "",
    capabilities: parts.sig.capabilities.apiFlagsHash ? shortHash(parts.sig.capabilities.apiFlagsHash) : "",
    network: [parts.sig.network.effectiveType, parts.sig.network.downlinkBucket, parts.sig.network.rttBucket, parts.sig.network.saveData].filter(Boolean).join(" / "),
    battery: [parts.sig.battery.supported, parts.sig.battery.charging, parts.sig.battery.levelBucket].filter(Boolean).join(" / "),
    media_devices: [parts.sig.mediaDevices.audioInputs, parts.sig.mediaDevices.videoInputs, parts.sig.mediaDevices.audioOutputs].filter(Boolean).join(" / "),
    device_instance: parts.sig.deviceInstanceHash ? shortHash(parts.sig.deviceInstanceHash) : "",
    ip_bucket: hmacShort(fpSecret, `admin-ip-bucket|${parts.ip}`),
  };
  return { ok:true, device_hash, device_key_hash:component_hashes.device_key_hash, recovery_binding_hash, component_hashes, signal_summary };
}

function sameHash(a, b){
  const aa = String(a || "");
  const bb = String(b || "");
  return !!aa && !!bb && aa === bb;
}

function scoreGroup(candidate, componentHashes, group){
  let available = 0;
  let matched = 0;
  const matchedFields = [];
  const mismatchedFields = [];

  for(const [field, localWeight] of group.fields || []){
    const a = String(candidate[field] || "");
    const b = String(componentHashes[field] || "");
    if(!a || !b) continue;
    available += localWeight;
    if(a === b){
      matched += localWeight;
      matchedFields.push(field);
    }else{
      mismatchedFields.push(field);
    }
  }

  const compositeAvailable = !!(group.composite && candidate[group.composite] && componentHashes[group.composite]);
  const compositeMatched = compositeAvailable && sameHash(candidate[group.composite], componentHashes[group.composite]);
  let ratio = available > 0 ? matched / available : 0;
  if(compositeMatched) ratio = 1;
  else if(compositeAvailable && available === 0) ratio = 0;

  const hasEvidence = compositeAvailable || available >= 0.20;
  const strong = hasEvidence && ratio >= 0.78;
  const contradiction = !!group.stable && hasEvidence && ratio <= 0.24 && (compositeAvailable || available >= 0.50);

  return {
    name:group.name,
    weight:Number(group.weight || 0),
    ratio:Math.max(0, Math.min(1, ratio)),
    has_evidence:hasEvidence,
    strong,
    contradiction,
    composite_matched:compositeMatched,
    matched_fields:matchedFields,
    mismatched_fields:mismatchedFields,
  };
}

function scoreCandidate(candidate = {}, componentHashes = {}){
  if(candidate.device_hash && componentHashes.device_hash && candidate.device_hash === componentHashes.device_hash){
    return {
      score:100,
      base_score:100,
      evidence_weight:94,
      strong_groups:4,
      stable_contradictions:0,
      exact_observation:true,
      groups:[],
    };
  }

  const groups = SCORE_GROUPS.map((group)=>scoreGroup(candidate, componentHashes, group));
  const evidenced = groups.filter((group)=>group.has_evidence);
  const evidenceWeight = evidenced.reduce((sum, group)=>sum + group.weight, 0);
  const weightedMatch = evidenced.reduce((sum, group)=>sum + group.weight * group.ratio, 0);
  const base = evidenceWeight > 0 ? (weightedMatch / evidenceWeight) * 100 : 0;
  const stableContradictions = groups.filter((group)=>group.contradiction).length;
  const strongGroups = groups.filter((group)=>group.strong && ["hardware","rendering","os","locale"].includes(group.name)).length;
  const penalty = stableContradictions * 8;
  // Repeated observations are not independent identity proof. Recency and
  // match_count may help operators inspect records, but never raise identity
  // confidence and therefore cannot turn a past inference into truth.
  const score = Math.max(0, Math.min(100, base - penalty));

  return {
    score:Math.round(score * 10) / 10,
    base_score:Math.round(base * 10) / 10,
    evidence_weight:Math.round(evidenceWeight * 10) / 10,
    strong_groups:strongGroups,
    stable_contradictions:stableContradictions,
    exact_observation:false,
    groups,
  };
}

function aggregateByUser(rows = []){
  const map = new Map();
  for(const row of rows){
    const uid = normalizeUserId(row.user_id);
    if(!uid) continue;
    const current = map.get(uid) || { user_id:uid, observations:[] };
    current.observations.push(row);
    map.set(uid, current);
  }

  const result = [];
  for(const group of map.values()){
    group.observations.sort((a,b)=>Number(b.score || 0) - Number(a.score || 0) || String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")));
    const best = group.observations[0];
    if(!best) continue;
    const support = group.observations.filter((item)=>Number(item.score || 0) >= Math.max(55, Number(best.score || 0) - 10));
    result.push({
      ...best,
      user_id:group.user_id,
      score:Number(best.score || 0),
      observation_count:group.observations.length,
      supporting_observations:support.length,
    });
  }
  result.sort((a,b)=>Number(b.score || 0) - Number(a.score || 0) || String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")));
  return result;
}

function isDeviceTableMissing(error){
  return isMissingTableOrColumn(error) || /support_user_devices/i.test(String(error?.message || ""));
}

function isSmartColumnMissing(error){
  return /hardware_profile_hash|rendering_profile_hash|os_family_hash|browser_family_hash|locale_profile_hash|schema cache|column .*does not exist/i.test(String(error?.message || ""));
}

function isEnhancedColumnMissing(error){
  return /client_hints_hash|media_hash|viewport_hash|storage_hash|audio_hash|schema cache|column .*does not exist/i.test(String(error?.message || ""));
}

function isBonusColumnMissing(error){
  return /keyboard_hash|capabilities_hash|network_hash|battery_hash|media_devices_hash|schema cache|column .*does not exist/i.test(String(error?.message || ""));
}

async function readActiveProfile(supabase, userId){
  const uid = normalizeUserId(userId);
  if(!uid) return null;
  const profile = await getNicknameProfile(supabase, uid);
  if(
    !profile?.ok ||
    !profile.exists ||
    profile.active === false ||
    profile.reset_required ||
    !profile.display_name
  ) return null;
  return { user_id: uid, display_name: profile.display_name };
}

async function queryExactDevices(supabase, fp){
  const run = (select)=>supabase
    .from("support_user_devices")
    .select(select)
    .eq("device_hash", fp.device_hash)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending:false })
    .limit(5);

  let res = await run(DEVICE_SELECT_SMART);
  if(!res.error) return { res, smart:true, enhanced:true, bonus:true };
  if(!isSmartColumnMissing(res.error)) return { res, smart:true, enhanced:true, bonus:true };

  res = await run(DEVICE_SELECT_BONUS);
  if(!res.error) return { res, smart:false, enhanced:true, bonus:true };
  if(!isBonusColumnMissing(res.error)) return { res, smart:false, enhanced:true, bonus:true };

  res = await run(DEVICE_SELECT_ENHANCED);
  if(!res.error) return { res, smart:false, enhanced:true, bonus:false };
  if(!isEnhancedColumnMissing(res.error)) return { res, smart:false, enhanced:true, bonus:false };

  res = await run(DEVICE_SELECT_LEGACY);
  return { res, smart:false, enhanced:false, bonus:false };
}

async function queryFuzzyDevices(supabase, component, schema = {}){
  const fields = [
    ...LEGACY_FIELDS,
    ...(schema.enhanced ? ENHANCED_FIELDS : []),
    ...(schema.bonus ? BONUS_FIELDS : []),
    ...(schema.smart ? SMART_FIELDS : []),
  ];
  const orParts = [];
  for(const field of fields){
    const value = String(component[field] || "");
    if(value) orParts.push(`${field}.eq.${value}`);
  }
  const select = schema.smart
    ? DEVICE_SELECT_SMART
    : (schema.bonus ? DEVICE_SELECT_BONUS : (schema.enhanced ? DEVICE_SELECT_ENHANCED : DEVICE_SELECT_LEGACY));
  if(!orParts.length) return { data:[], error:null };

  return await supabase
    .from("support_user_devices")
    .select(select)
    .is("revoked_at", null)
    .or(orParts.join(","))
    .order("last_seen_at", { ascending:false })
    .limit(1000);
}

async function buildNicknameSuggestions(supabase, scored = [], minScore = DEVICE_SUGGESTION_THRESHOLD, maxItems = DEVICE_MAX_SUGGESTIONS){
  const suggestions = [];
  const seenUsers = new Set();
  const seenNames = new Set();

  for(const item of scored){
    if(suggestions.length >= maxItems) break;
    const uid = normalizeUserId(item.user_id);
    const score = Number(item.score || 0);
    if(!uid || score < minScore || seenUsers.has(uid)) continue;
    if(Number(item.evidence_weight || 0) < DEVICE_MANUAL_MIN_EVIDENCE_WEIGHT) continue;
    if(Number(item.strong_groups || 0) < DEVICE_MANUAL_MIN_STRONG_GROUPS) continue;
    if(Number(item.stable_contradictions || 0) > DEVICE_MANUAL_MAX_STABLE_CONTRADICTIONS) continue;

    const profile = await readActiveProfile(supabase, uid);
    const name = cleanNickname(profile?.display_name || item.display_name || "");
    const nameKey = name.toLocaleLowerCase("ar-EG");
    if(!profile || !name || seenNames.has(nameKey)) continue;

    seenUsers.add(uid);
    seenNames.add(nameKey);
    suggestions.push({
      user_id:uid,
      display_name:name,
      score:Math.round(score),
      evidence_weight:Number(item.evidence_weight || 0),
      strong_groups:Number(item.strong_groups || 0),
      stable_contradictions:Number(item.stable_contradictions || 0),
      observation_count:Number(item.observation_count || 1),
      last_seen_at:item.last_seen_at || null,
      is_online:isRecentlyActiveSuggestion(item.last_seen_at),
    });
  }

  return suggestions;
}

export async function findDeviceNicknameMatch(supabase, fp, options = {}){
  if(!fp?.ok || !fp.device_hash) return { ok:true, matched:false, reason:"no_fingerprint", suggestions:[] };
  const threshold = Number(options.threshold || DEVICE_AUTO_RECOVERY_THRESHOLD);
  const minEvidence = Number(options.minEvidence || DEVICE_AUTO_MIN_EVIDENCE_WEIGHT);
  const minStrongGroups = Number(options.minStrongGroups || DEVICE_AUTO_MIN_STRONG_GROUPS);
  const maxContradictions = Number(options.maxContradictions ?? DEVICE_AUTO_MAX_STABLE_CONTRADICTIONS);
  const allowAutoLogin = options.allowAutoLogin === true;
  const independentCredentialGroups = Math.max(0, Number(options.independentCredentialGroups || 0));
  const hasConfirmedHistory = options.hasConfirmedHistory === true;
  const circularEvidence = options.circularEvidence !== false;

  try{
    const component = { ...(fp.component_hashes || {}), device_hash:fp.device_hash };
    const exactResult = await queryExactDevices(supabase, fp);
    let schema = {
      smart:!!exactResult.smart,
      enhanced:!!exactResult.enhanced,
      bonus:!!exactResult.bonus,
    };
    let queryResult = exactResult.res;

    if(queryResult.error){
      if(isDeviceTableMissing(queryResult.error)) return { ok:true, matched:false, missing_table:true, reason:"missing_table", suggestions:[] };
      return { ok:false, error:queryResult.error.message || "Could not read device locks." };
    }

    let candidates = Array.isArray(queryResult.data) ? queryResult.data : [];
    const exactObservationFound = candidates.length > 0;

    if(!exactObservationFound){
      queryResult = await queryFuzzyDevices(supabase, component, schema);
      if(queryResult.error && schema.smart && isSmartColumnMissing(queryResult.error)){
        schema.smart = false;
        queryResult = await queryFuzzyDevices(supabase, component, schema);
      }
      if(queryResult.error && schema.bonus && isBonusColumnMissing(queryResult.error)){
        schema.bonus = false;
        queryResult = await queryFuzzyDevices(supabase, component, schema);
      }
      if(queryResult.error && schema.enhanced && isEnhancedColumnMissing(queryResult.error)){
        schema.enhanced = false;
        schema.bonus = false;
        queryResult = await queryFuzzyDevices(supabase, component, schema);
      }
      if(queryResult.error){
        if(isDeviceTableMissing(queryResult.error)) return { ok:true, matched:false, missing_table:true, reason:"missing_table", suggestions:[] };
        return { ok:false, error:queryResult.error.message || "Could not read device candidates." };
      }
      candidates = Array.isArray(queryResult.data) ? queryResult.data : [];
    }

    const scoredRows = [];
    for(const candidate of candidates){
      const uid = normalizeUserId(candidate.user_id);
      if(!uid) continue;
      const metrics = scoreCandidate(candidate, component);
      if(Number(metrics.score || 0) <= 0) continue;
      scoredRows.push({ ...candidate, ...metrics, user_id:uid });
    }
    const ranked = aggregateByUser(scoredRows);

    const suggestions = await buildNicknameSuggestions(
      supabase,
      ranked,
      Number(options.suggestionThreshold || DEVICE_SUGGESTION_THRESHOLD),
      Number(options.maxSuggestions || DEVICE_MAX_SUGGESTIONS)
    );

    const best = ranked[0];
    const second = ranked.find((item)=>item.user_id !== best?.user_id);
    const gap = best && second ? Number(best.score || 0) - Number(second.score || 0) : 100;
    const diagnostics = {
      best_score:Number(best?.score || 0),
      second_score:Number(second?.score || 0),
      ambiguity_gap:Math.round(gap * 10) / 10,
      evidence_weight:Number(best?.evidence_weight || 0),
      strong_groups:Number(best?.strong_groups || 0),
      stable_contradictions:Number(best?.stable_contradictions || 0),
      supporting_observations:Number(best?.supporting_observations || 0),
      exact_observation:!!best?.exact_observation,
      threshold,
      schema,
      suggestions,
    };

    if(!best){
      return { ok:true, matched:false, reason:"no_candidates", ...diagnostics };
    }
    if(Number(best.score || 0) < threshold){
      return { ok:true, matched:false, reason:"low_confidence", ...diagnostics };
    }
    if(Number(best.evidence_weight || 0) < minEvidence){
      return { ok:true, matched:false, reason:"insufficient_evidence", ...diagnostics };
    }
    if(!best.exact_observation && Number(best.strong_groups || 0) < minStrongGroups){
      return { ok:true, matched:false, reason:"insufficient_strong_groups", ...diagnostics };
    }
    if(!best.exact_observation && Number(best.supporting_observations || 0) < DEVICE_AUTO_MIN_SUPPORTING_OBSERVATIONS){
      return { ok:true, matched:false, reason:"needs_user_confirmation_first", ...diagnostics };
    }
    if(Number(best.stable_contradictions || 0) > maxContradictions){
      return { ok:true, matched:false, reason:"stable_signal_conflict", ...diagnostics };
    }
    if(second && gap < DEVICE_AMBIGUITY_GAP){
      return { ok:true, matched:false, ambiguous:true, reason:"ambiguous", ...diagnostics };
    }

    // Browser and fleet characteristics alone are never an automatic identity
    // proof. A future full-mode recovery implementation must explicitly supply
    // at least two independent credential-continuation groups and confirmed,
    // non-circular history before this branch can execute.
    if(!allowAutoLogin || independentCredentialGroups < 2 || !hasConfirmedHistory || circularEvidence){
      return { ok:true, matched:false, reason:"probabilistic_auto_login_disabled", ...diagnostics };
    }

    const profile = await readActiveProfile(supabase, best.user_id);
    const displayName = profile?.display_name || cleanNickname(best.display_name || "");
    if(!profile || !displayName){
      return { ok:true, matched:false, reason:"profile_reset_or_missing", ...diagnostics };
    }

    return {
      ok:true,
      matched:true,
      user_id:profile.user_id,
      display_name:displayName,
      confidence_score:Number(best.score || 0),
      device_hash:best.device_hash,
      recovery_method:best.exact_observation ? "exact_observation" : "smart_fingerprint_v2",
      ...diagnostics,
    };
  }catch(err){
    return { ok:false, error:String(err?.message || err || "Could not match device nickname.") };
  }
}

export async function verifyDeviceNicknameChoice(supabase, fp, selectedUserId, options = {}){
  const uid = normalizeUserId(selectedUserId);
  if(!uid) return { ok:true, matched:false, reason:"missing_choice" };

  const manualThreshold = Math.max(1, Number(options.minScore || DEVICE_MANUAL_RECOVERY_THRESHOLD));
  const selectableTopN = Math.max(1, Math.min(3, Number(options.selectableTopN || DEVICE_MANUAL_SELECTABLE_TOP_N)));
  const minEvidence = Math.max(1, Number(options.minEvidence || DEVICE_MANUAL_MIN_EVIDENCE_WEIGHT));
  const minStrongGroups = Math.max(1, Number(options.minStrongGroups || DEVICE_MANUAL_MIN_STRONG_GROUPS));

  const result = await findDeviceNicknameMatch(supabase, fp, {
    threshold:101,
    minEvidence,
    minStrongGroups,
    suggestionThreshold:1,
    maxSuggestions:selectableTopN,
    maxContradictions:DEVICE_MANUAL_MAX_STABLE_CONTRADICTIONS,
  });
  if(!result.ok) return result;

  const ranked = (Array.isArray(result.suggestions) ? result.suggestions : [])
    .map((item)=>({ ...item, user_id:normalizeUserId(item.user_id), score:Number(item.score || 0) }))
    .filter((item)=>item.user_id)
    .sort((a,b)=>b.score - a.score)
    .slice(0, selectableTopN);
  const chosenIndex = ranked.findIndex((item)=>item.user_id === uid);
  const chosen = chosenIndex >= 0 ? ranked[chosenIndex] : null;

  if(!chosen){
    return { ok:true, matched:false, reason:"choice_not_in_signed_candidates", suggestions:ranked };
  }
  if(Number(chosen.score || 0) < manualThreshold){
    return { ok:true, matched:false, reason:"choice_score_too_low", selected_score:Number(chosen.score || 0), manual_threshold:manualThreshold, suggestions:ranked };
  }
  if(Number(chosen.evidence_weight || 0) < minEvidence){
    return { ok:true, matched:false, reason:"choice_evidence_too_low", suggestions:ranked };
  }
  if(Number(chosen.strong_groups || 0) < minStrongGroups){
    return { ok:true, matched:false, reason:"choice_strong_groups_too_low", suggestions:ranked };
  }
  if(Number(chosen.stable_contradictions || 0) > DEVICE_MANUAL_MAX_STABLE_CONTRADICTIONS){
    return { ok:true, matched:false, reason:"choice_has_stable_conflict", suggestions:ranked };
  }

  return {
    ok:true,
    matched:true,
    user_id:chosen.user_id,
    display_name:chosen.display_name,
    confidence_score:Number(chosen.score || 0),
    device_hash:fp.device_hash,
    selected_by_user:true,
    selected_rank:chosenIndex + 1,
    recovery_method:"smart_suggestion_v2",
    suggestions:ranked,
  };
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

function bonusDevicePayload(userId, displayName, fp, confidenceScore){
  const c = fp.component_hashes || {};
  return {
    ...enhancedDevicePayload(userId, displayName, fp, confidenceScore),
    keyboard_hash: c.keyboard_hash || "",
    capabilities_hash: c.capabilities_hash || "",
    network_hash: c.network_hash || "",
    battery_hash: c.battery_hash || "",
    media_devices_hash: c.media_devices_hash || "",
  };
}

function smartDevicePayload(userId, displayName, fp, confidenceScore){
  const c = fp.component_hashes || {};
  return {
    ...bonusDevicePayload(userId, displayName, fp, confidenceScore),
    hardware_profile_hash:c.hardware_profile_hash || "",
    rendering_profile_hash:c.rendering_profile_hash || "",
    os_family_hash:c.os_family_hash || "",
    browser_family_hash:c.browser_family_hash || "",
    locale_profile_hash:c.locale_profile_hash || "",
  };
}

export async function recordDeviceNickname(supabase, userId, displayName, fp, confidenceScore = 100, options = {}){
  const uid = normalizeUserId(userId);
  const name = cleanNickname(displayName || "");
  if(!uid || !name || !fp?.ok || !fp.device_hash) return { ok:true, skipped:true };
  try{
    const canStrengthen = options.canStrengthen === true && [
      "verified_device_credential",
      "verified_local_device_secret",
      "independent_admin_confirmation",
      "managed_device_attestation",
    ].includes(String(options.source || ""));

    const observation = await logDeviceObservation(supabase, {
      device_id:options.device_id,
      user_id:uid,
      source:options.source || "unverified_session",
      truth_level:canStrengthen ? "verified_device" : (options.truth_level || "derived_decision"),
      evidence_groups:Array.isArray(options.evidence_groups) ? options.evidence_groups : [],
      evidence_lineage:options.evidence_lineage || {},
      decision_id:options.decision_id,
      can_strengthen:canStrengthen,
      shadow_only:options.shadow_only === true,
    });
    if(!observation.ok || (canStrengthen && observation.missing_table)){
      return { ok:false, status:503, error:observation.error || "Device observation audit migration is required." };
    }

    if(!canStrengthen){
      return { ok:true, skipped:true, reason:"non_independent_observation" };
    }

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
    const smartPayload = smartDevicePayload(uid, name, fp, confidenceScore);
    const bonusPayload = bonusDevicePayload(uid, name, fp, confidenceScore);
    const enhancedPayload = enhancedDevicePayload(uid, name, fp, confidenceScore);
    const legacyPayload = baseDevicePayload(uid, name, fp, confidenceScore);
    if(row?.id){
      if(normalizeUserId(row.user_id) && normalizeUserId(row.user_id) !== uid){
        return { ok:false, status:409, error:"This exact device observation is already linked to another nickname." };
      }
      let updated = await supabase
        .from("support_user_devices")
        .update({ ...smartPayload, match_count: Number(row.match_count || 0) + 1 })
        .eq("id", row.id);
      if(updated.error && isSmartColumnMissing(updated.error)){
        updated = await supabase
          .from("support_user_devices")
          .update({ ...bonusPayload, match_count: Number(row.match_count || 0) + 1 })
          .eq("id", row.id);
      }
      if(updated.error && isBonusColumnMissing(updated.error)){
        updated = await supabase
          .from("support_user_devices")
          .update({ ...enhancedPayload, match_count: Number(row.match_count || 0) + 1 })
          .eq("id", row.id);
      }
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
      .insert({ ...smartPayload, first_seen_at: new Date().toISOString(), match_count: 1 });
    if(inserted.error && isSmartColumnMissing(inserted.error)){
      inserted = await supabase
        .from("support_user_devices")
        .insert({ ...bonusPayload, first_seen_at: new Date().toISOString(), match_count: 1 });
    }
    if(inserted.error && isBonusColumnMissing(inserted.error)){
      inserted = await supabase
        .from("support_user_devices")
        .insert({ ...enhancedPayload, first_seen_at: new Date().toISOString(), match_count: 1 });
    }
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
