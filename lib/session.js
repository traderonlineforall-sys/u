// Lightweight signed-session token (HMAC-SHA256) using Web Crypto.
// Safe for Next.js Middleware and Cloudflare Workers: no Node Buffer dependency.
// Upgrade note: the imported HMAC key is cached per secret to reduce per-request
// middleware CPU without changing the cookie format or session semantics.

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "__Host-srtool";
const MAX_TOKEN_LENGTH = 4096;
const hmacKeyCache = new Map();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlEncode(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBytes(value) {
  const b64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new Error("bad_base64");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  return base64ToBytes(padded);
}

async function importHmacKey(secret) {
  const normalized = String(secret || "");
  const cached = hmacKeyCache.get(normalized);
  if (cached) return cached;

  const keyPromise = crypto.subtle.importKey(
    "raw",
    textEncoder.encode(normalized),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  hmacKeyCache.set(normalized, keyPromise);

  try {
    return await keyPromise;
  } catch (err) {
    hmacKeyCache.delete(normalized);
    throw err;
  }
}

export function getCookieName() {
  return COOKIE_NAME;
}

export async function signSession(payload, secret) {
  const data = textEncoder.encode(JSON.stringify(payload));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return `${b64urlEncode(data)}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySession(token, secret) {
  if (!token || typeof token !== "string") return { ok: false, reason: "missing" };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "too_large" };

  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "format" };

  let dataBytes;
  let sigBytes;
  try {
    dataBytes = b64urlDecodeToBytes(parts[0]);
    sigBytes = b64urlDecodeToBytes(parts[1]);
  } catch {
    return { ok: false, reason: "bad_base64" };
  }

  let ok = false;
  try {
    const key = await importHmacKey(secret);
    ok = await crypto.subtle.verify("HMAC", key, sigBytes, dataBytes);
  } catch {
    return { ok: false, reason: "bad_sig" };
  }
  if (!ok) return { ok: false, reason: "bad_sig" };

  let payload;
  try {
    payload = JSON.parse(textDecoder.decode(dataBytes));
  } catch {
    return { ok: false, reason: "bad_json" };
  }

  if (!payload?.exp || typeof payload.exp !== "number") return { ok: false, reason: "no_exp" };
  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };

  return { ok: true, payload };
}
