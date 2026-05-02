import { NextResponse } from "next/server";
import { noStore } from "../../../lib/server/auth.js";

function textResponse(message, status = 400) {
  return noStore(new NextResponse(String(message || "Bad Request"), { status }));
}

export async function POST(req) {
  const enabled = String(process.env.UA07_URGENT_TTS_SERVER_FALLBACK || "").toLowerCase() === "true";
  if (!enabled) return textResponse("Disabled", 404);

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return textResponse("Server TTS key missing", 503);

  const body = await req.json().catch(() => ({}));
  const text = String(body?.text || "").trim();
  if (!text) return textResponse("Text is required", 400);

  const model = process.env.UA07_URGENT_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = process.env.UA07_URGENT_TTS_VOICE || "alloy";
  const format = String(process.env.UA07_URGENT_TTS_FORMAT || "mp3").toLowerCase() === "wav" ? "wav" : "mp3";
  const responseFormat = format === "wav" ? "wav" : "mp3";
  const mimeType = format === "wav" ? "audio/wav" : "audio/mpeg";

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
      format: responseFormat
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
      "cache-control": "no-store"
    }
  }));
}
