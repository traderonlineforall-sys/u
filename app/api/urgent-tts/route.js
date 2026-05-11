import { NextResponse } from "next/server";
import { enforceSameOrigin, noStore } from "../../../lib/server/auth.js";

const EDGE_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_TTS_ENDPOINT = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const GOOGLE_TTS_ENDPOINT = "https://translate.google.com/translate_tts";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".", 1)[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const EDGE_AUDIO_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const MAX_TEXT_LENGTH = 1800;
const GOOGLE_TTS_CHUNK_LENGTH = 180;
const SHAPED_GOOGLE_FALLBACK_PROVIDER = "google-translate-tts-shaped-fallback";

const ARABIC_EDGE_VOICES = [
  { id: "ar-EG-SalmaNeural", label: "Salma - Egypt Female", lang: "ar-EG" },
  { id: "ar-EG-ShakirNeural", label: "Shakir - Egypt Male", lang: "ar-EG" },
  { id: "ar-SA-ZariyahNeural", label: "Zariyah - Saudi Female", lang: "ar-SA" },
  { id: "ar-SA-HamedNeural", label: "Hamed - Saudi Male", lang: "ar-SA" },
  { id: "ar-AE-FatimaNeural", label: "Fatima - UAE Female", lang: "ar-AE" },
  { id: "ar-AE-HamdanNeural", label: "Hamdan - UAE Male", lang: "ar-AE" },
  { id: "ar-JO-SanaNeural", label: "Sana - Jordan Female", lang: "ar-JO" },
  { id: "ar-JO-TaimNeural", label: "Taim - Jordan Male", lang: "ar-JO" },
  { id: "ar-KW-NouraNeural", label: "Noura - Kuwait Female", lang: "ar-KW" },
  { id: "ar-KW-FahedNeural", label: "Fahed - Kuwait Male", lang: "ar-KW" },
  { id: "ar-QA-AmalNeural", label: "Amal - Qatar Female", lang: "ar-QA" },
  { id: "ar-QA-MoazNeural", label: "Moaz - Qatar Male", lang: "ar-QA" },
  { id: "ar-BH-LailaNeural", label: "Laila - Bahrain Female", lang: "ar-BH" },
  { id: "ar-BH-AliNeural", label: "Ali - Bahrain Male", lang: "ar-BH" },
  { id: "ar-IQ-RanaNeural", label: "Rana - Iraq Female", lang: "ar-IQ" },
  { id: "ar-IQ-BasselNeural", label: "Bassel - Iraq Male", lang: "ar-IQ" },
  { id: "ar-LB-LaylaNeural", label: "Layla - Lebanon Female", lang: "ar-LB" },
  { id: "ar-LB-RamiNeural", label: "Rami - Lebanon Male", lang: "ar-LB" },
  { id: "ar-MA-MounaNeural", label: "Mouna - Morocco Female", lang: "ar-MA" },
  { id: "ar-MA-JamalNeural", label: "Jamal - Morocco Male", lang: "ar-MA" },
  { id: "ar-OM-AyshaNeural", label: "Aysha - Oman Female", lang: "ar-OM" },
  { id: "ar-OM-AbdullahNeural", label: "Abdullah - Oman Male", lang: "ar-OM" },
  { id: "ar-SY-AmanyNeural", label: "Amany - Syria Female", lang: "ar-SY" },
  { id: "ar-SY-LaithNeural", label: "Laith - Syria Male", lang: "ar-SY" },
  { id: "ar-TN-ReemNeural", label: "Reem - Tunisia Female", lang: "ar-TN" },
  { id: "ar-TN-HediNeural", label: "Hedi - Tunisia Male", lang: "ar-TN" },
  { id: "ar-YE-MaryamNeural", label: "Maryam - Yemen Female", lang: "ar-YE" },
  { id: "ar-YE-SalehNeural", label: "Saleh - Yemen Male", lang: "ar-YE" }
];

const DEFAULT_ARABIC_VOICE = "ar-EG-SalmaNeural";
const FALLBACK_ARABIC_VOICES = [
  "ar-EG-SalmaNeural",
  "ar-EG-ShakirNeural",
  "ar-SA-ZariyahNeural",
  "ar-SA-HamedNeural",
  "ar-AE-FatimaNeural",
  "ar-AE-HamdanNeural"
];
const VOICE_BY_ID = new Map(ARABIC_EDGE_VOICES.map((voice) => [voice.id, voice]));

function textResponse(message, status = 400) {
  return noStore(new NextResponse(String(message || "Bad Request"), { status }));
}

function jsonResponse(body, status = 200) {
  return noStore(NextResponse.json(body, { status }));
}

function audioResponse(audioBuf, voice, provider = "edge-tts", requestedVoice = voice) {
  return noStore(new NextResponse(audioBuf, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store",
      "x-ua07-tts-provider": provider,
      "x-ua07-tts-voice": voice,
      "x-ua07-tts-requested-voice": requestedVoice
    }
  }));
}

function normalizeVoiceId(value) {
  const requested = String(value || "").trim();
  return VOICE_BY_ID.has(requested) ? requested : DEFAULT_ARABIC_VOICE;
}

function normalizeArabicText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

function validateArabicText(text) {
  if (!text) return "Text is required";
  if (!/[\u0600-\u06FF]/.test(text)) return "Arabic text is required for urgent Arabic TTS";
  return "";
}

function escapeSsml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function makeMuid() {
  const bytes = new Uint8Array(16);
  try { crypto.getRandomValues(bytes); } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function generateSecMsGec() {
  const unixSeconds = BigInt(Math.floor(Date.now() / 1000));
  const windowsEpochSeconds = 11644473600n;
  const roundedSeconds = ((unixSeconds + windowsEpochSeconds) / 300n) * 300n;
  const windowsFiletimeTicks = roundedSeconds * 10000000n;
  const data = new TextEncoder().encode(`${windowsFiletimeTicks}${EDGE_TRUSTED_CLIENT_TOKEN}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function makeRequestId() {
  try {
    return crypto.randomUUID().replaceAll("-", "");
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 32).padEnd(32, "0");
  }
}

function edgeTimestamp() {
  return new Date().toISOString();
}

function makeSpeechConfigMessage() {
  return [
    `X-Timestamp:${edgeTimestamp()}`,
    "Content-Type:application/json; charset=utf-8",
    "Path:speech.config",
    "",
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: false,
              wordBoundaryEnabled: false
            },
            outputFormat: EDGE_AUDIO_FORMAT
          }
        }
      }
    })
  ].join("\r\n");
}

function makeSsmlMessage(text, voice) {
  const requestId = makeRequestId();
  const safeText = escapeSsml(text);
  const ssml = `<speak version='1.0' xml:lang='${voice.lang}' xmlns='http://www.w3.org/2001/10/synthesis'><voice name='${voice.id}'><prosody rate='+0%' pitch='+0Hz'>${safeText}</prosody></voice></speak>`;
  return [
    `X-RequestId:${requestId}`,
    "Content-Type:application/ssml+xml",
    `X-Timestamp:${edgeTimestamp()}`,
    "Path:ssml",
    "",
    ssml
  ].join("\r\n");
}

function makeEdgeHeaders() {
  const major = CHROMIUM_MAJOR_VERSION;
  const full = CHROMIUM_FULL_VERSION;
  return {
    "Upgrade": "websocket",
    "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-CH-UA": `" Not;A Brand";v="99", "Microsoft Edge";v="${major}", "Chromium";v="${major}"`,
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": "Windows",
    "Sec-CH-UA-Platform-Version": "10.0.0",
    "Sec-CH-UA-Arch": "x86_64",
    "Sec-CH-UA-Bitness": "64",
    "Sec-CH-UA-Full-Version": full,
    "Sec-CH-UA-Full-Version-List": `" Not;A Brand";v="99.0.0.0", "Microsoft Edge";v="${full}", "Chromium";v="${full}"`,
    "Sec-CH-UA-Model": "",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    "Cookie": `muid=${makeMuid()};`
  };
}

async function openEdgeSocket() {
  const connectionId = makeRequestId();
  const secMsGec = await generateSecMsGec();
  const url = `${EDGE_TTS_ENDPOINT}?TrustedClientToken=${EDGE_TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`;

  const response = await fetch(url, {
    headers: makeEdgeHeaders()
  });

  if (response.status !== 101 || !response.webSocket) {
    throw new Error(`edge-tts-websocket-open-failed:${response.status}`);
  }

  const socket = response.webSocket;
  socket.accept();
  return socket;
}

function getBinaryAudioPayload(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 3) return null;
  const headerLength = (bytes[0] << 8) | bytes[1];
  const offset = 2 + headerLength;
  if (offset >= bytes.length) return null;
  return bytes.slice(offset);
}

function concatAudio(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

function waitForEdgeAudio(socket) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;

    const cleanup = () => {
      try { socket.removeEventListener("message", onMessage); } catch {}
      try { socket.removeEventListener("close", onClose); } catch {}
      try { socket.removeEventListener("error", onError); } catch {}
      clearTimeout(timer);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try { socket.close(); } catch {}
      if (!chunks.length) {
        reject(new Error("edge-tts-empty-audio"));
        return;
      }
      resolve(concatAudio(chunks));
    };

    const onMessage = async (event) => {
      try {
        const data = event.data;
        if (typeof data === "string") {
          if (/Path:turn\.end/i.test(data)) finish();
          return;
        }

        let arrayBuffer;
        if (data instanceof ArrayBuffer) {
          arrayBuffer = data;
        } else if (data && typeof data.arrayBuffer === "function") {
          arrayBuffer = await data.arrayBuffer();
        } else {
          return;
        }

        const payload = getBinaryAudioPayload(arrayBuffer);
        if (payload && payload.length) chunks.push(payload);
      } catch (error) {
        if (!settled) {
          settled = true;
          cleanup();
          try { socket.close(); } catch {}
          reject(error);
        }
      }
    };

    const onClose = () => {
      if (settled) return;
      if (chunks.length) finish();
      else {
        settled = true;
        cleanup();
        reject(new Error("edge-tts-socket-closed-before-audio"));
      }
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("edge-tts-socket-error"));
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      try { socket.close(); } catch {}
      reject(new Error("edge-tts-timeout"));
    }, 9500);

    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose);
    socket.addEventListener("error", onError);
  });
}

async function synthesizeArabicWithEdge(text, voiceId) {
  const voice = VOICE_BY_ID.get(normalizeVoiceId(voiceId)) || VOICE_BY_ID.get(DEFAULT_ARABIC_VOICE);
  const socket = await openEdgeSocket();
  socket.send(makeSpeechConfigMessage());
  socket.send(makeSsmlMessage(text, voice));
  return await waitForEdgeAudio(socket);
}

async function synthesizeArabicWithEdgeRetry(text, preferredVoiceId) {
  const preferred = normalizeVoiceId(preferredVoiceId);
  const voiceIds = Array.from(new Set([preferred, ...FALLBACK_ARABIC_VOICES]));
  let lastError = null;

  for (const voiceId of voiceIds) {
    try {
      const audioBuf = await synthesizeArabicWithEdge(text, voiceId);
      return { audioBuf, voice: voiceId, provider: "edge-tts" };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  throw lastError || new Error(`edge-tts-failed-for-selected-voice:${preferred}`);
}

function splitForGoogleTts(text) {
  const words = normalizeArabicText(text).split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if ((current + " " + word).length <= GOOGLE_TTS_CHUNK_LENGTH) {
      current += " " + word;
    } else {
      chunks.push(current);
      current = word;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [normalizeArabicText(text).slice(0, GOOGLE_TTS_CHUNK_LENGTH)];
}

async function fetchGoogleTtsChunk(chunk) {
  const url = `${GOOGLE_TTS_ENDPOINT}?ie=UTF-8&client=tw-ob&tl=ar&q=${encodeURIComponent(chunk)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36`,
      "Accept": "audio/mpeg,audio/*,*/*;q=0.8",
      "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
      "Referer": "https://translate.google.com/"
    }
  });

  if (!res.ok) throw new Error(`google-tts-http-${res.status}`);
  const ct = String(res.headers.get("content-type") || "").toLowerCase();
  const audioBuf = await res.arrayBuffer();
  if (!audioBuf || audioBuf.byteLength < 128) throw new Error("google-tts-empty-audio");
  if (ct && !ct.includes("audio") && !ct.includes("mpeg") && !ct.includes("octet-stream")) {
    throw new Error(`google-tts-invalid-content-type:${ct}`);
  }
  return audioBuf;
}

async function synthesizeArabicWithGoogleFallback(text) {
  const chunks = splitForGoogleTts(text).slice(0, 12);
  const audioChunks = [];

  for (const chunk of chunks) {
    audioChunks.push(await fetchGoogleTtsChunk(chunk));
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  return concatAudio(audioChunks.map((buf) => new Uint8Array(buf)));
}

async function synthesizeArabicRobust(text, preferredVoiceId, allowGoogleFallback = false) {
  try {
    return await synthesizeArabicWithEdgeRetry(text, preferredVoiceId);
  } catch (edgeError) {
    if (!allowGoogleFallback) throw edgeError;
    const audioBuf = await synthesizeArabicWithGoogleFallback(text);
    return { audioBuf, voice: normalizeVoiceId(preferredVoiceId), provider: `${SHAPED_GOOGLE_FALLBACK_PROVIDER}; edge_error=${String(edgeError?.message || "edge failed").slice(0, 120)}` };
  }
}

export async function GET(req) {
  const url = new URL(req.url);
  const rawText = url.searchParams.get("text") || "";

  if (!rawText) {
    return jsonResponse({
      ok: true,
      provider: "edge-tts-with-shaped-google-fallback",
      default_voice: DEFAULT_ARABIC_VOICE,
      voices: ARABIC_EDGE_VOICES
    });
  }

  const text = normalizeArabicText(rawText);
  const validationError = validateArabicText(text);
  if (validationError) return textResponse(validationError, 400);

  const voice = normalizeVoiceId(url.searchParams.get("voice"));
  const allowGoogleFallback = /^(1|true|yes)$/i.test(String(url.searchParams.get("allowGoogleFallback") || ""));

  try {
    const result = await synthesizeArabicRobust(text, voice, allowGoogleFallback);
    return audioResponse(result.audioBuf, result.voice, result.provider, voice);
  } catch (error) {
    const message = String(error?.message || "TTS failed");
    return textResponse(`TTS failed: ${message}`, 502);
  }
}

export async function POST(req) {
  const sameOrigin = enforceSameOrigin(req);
  if (!sameOrigin.ok) return textResponse(sameOrigin.error, sameOrigin.status);

  const body = await req.json().catch(() => ({}));
  const text = normalizeArabicText(body?.text || "");
  const validationError = validateArabicText(text);
  if (validationError) return textResponse(validationError, 400);

  const voice = normalizeVoiceId(body?.voice || body?.urgent_voice);
  const allowGoogleFallback = body?.allowGoogleFallback === true;

  try {
    const result = await synthesizeArabicRobust(text, voice, allowGoogleFallback);
    return audioResponse(result.audioBuf, result.voice, result.provider, voice);
  } catch (error) {
    const message = String(error?.message || "TTS failed");
    return textResponse(`TTS failed: ${message}`, 502);
  }
}
