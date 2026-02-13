// Lightweight signed-session token (HMAC-SHA256) using Web Crypto.
// Works in both Node (Route Handlers) and Edge (Middleware).

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "__Host-srtool";

function b64urlEncode(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  const b64 = Buffer.from(str, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf);
}

async function importHmacKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export function getCookieName() {
  return COOKIE_NAME;
}

export async function signSession(payload, secret) {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return `${b64urlEncode(data)}.${b64urlEncode(sig)}`;
}

export async function verifySession(token, secret) {
  if (!token || typeof token !== "string") return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "format" };

  const dataBytes = b64urlDecodeToBytes(parts[0]);
  const sigBytes = b64urlDecodeToBytes(parts[1]);

  const key = await importHmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, dataBytes);
  if (!ok) return { ok: false, reason: "bad_sig" };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(dataBytes).toString("utf-8"));
  } catch {
    return { ok: false, reason: "bad_json" };
  }

  if (!payload?.exp || typeof payload.exp !== "number") return { ok: false, reason: "no_exp" };
  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };

  return { ok: true, payload };
}
