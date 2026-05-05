import { NextResponse } from "next/server";
import { noStore } from "../../../lib/server/auth.js";

const MAX_URGENT_TTS_CHARS = 900;
const ALLOWED_FORMATS = new Set(["mp3", "wav"]);
const ALLOWED_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar"
]);

function textResponse(message, status = 400) {
  return noStore(new NextResponse(String(message || "Bad Request"), { status }));
}

function cleanText(input) {
  return String(input || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_URGENT_TTS_CHARS);
}

function getEnvFlag(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  const normalized = String(raw).trim().toLowerCase();
  if (["0", "false", "off", "no", "disabled"].includes(normalized)) return false;
  if (["1", "true", "on", "yes", "enabled"].includes(normalized)) return true;
  return defaultValue;
}

function getVoice() {
  const requested = String(process.env.UA07_URGENT_TTS_VOICE || "marin").trim().toLowerCase();
  return ALLOWED_VOICES.has(requested) ? requested : "marin";
}

function getFormat() {
  const requested = String(process.env.UA07_URGENT_TTS_FORMAT || "mp3").trim().toLowerCase();
  return ALLOWED_FORMATS.has(requested) ? requested : "mp3";
}

export async function POST(req) {
  if (!getEnvFlag("UA07_URGENT_TTS_ENABLED", true)) {
    return textResponse("Disabled", 404);
  }

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return textResponse("Server TTS key missing", 503);

  const body = await req.json().catch(() => ({}));
  const text = cleanText(body?.text);
  if (!text) return textResponse("Text is required", 400);

  const model = String(process.env.UA07_URGENT_TTS_MODEL || "gpt-4o-mini-tts").trim() || "gpt-4o-mini-tts";
  const voice = getVoice();
  const responseFormat = getFormat();
  const mimeType = responseFormat === "wav" ? "audio/wav" : "audio/mpeg";
  const instructions = String(process.env.UA07_URGENT_TTS_INSTRUCTIONS ||
    "Read this urgent admin message naturally and clearly. If the text contains Arabic and English together, pronounce each language naturally without translating it. Use a calm human support-announcement tone."
  ).slice(0, 4096);

  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      instructions,
      response_format: responseFormat
    })
  });

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    return textResponse(errText || "Upstream TTS failed", 502);
  }

  const audioBuf = await upstream.arrayBuffer();
  return noStore(new NextResponse(audioBuf, {
    status: 200,
    headers: {
      "content-type": mimeType,
      "cache-control": "no-store, max-age=0"
    }
  }));
}
