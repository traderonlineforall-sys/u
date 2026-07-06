import { createClient } from "@supabase/supabase-js";
import { signSession, verifySession } from "../session.js";

const ADMIN_COOKIE_NAME = "__Host-sradmin";
const ADMIN_SESSION_MAX_AGE_SECONDS = 30 * 60; // 30 minutes
const ADMIN_SESSION_MAX_AGE_MS = ADMIN_SESSION_MAX_AGE_SECONDS * 1000;

let serviceClientCache = null;
let serviceClientCacheKey = "";

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aa = enc.encode(String(a || ""));
  const bb = enc.encode(String(b || ""));
  const max = Math.max(aa.length, bb.length);

  if (max === 0) return true;

  let diff = aa.length ^ bb.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (aa[i] || 0) ^ (bb[i] || 0);
  }
  return diff === 0;
}

function parseCookies(cookieHeader){
  const out = {};
  if(!cookieHeader) return out;
  for(const part of cookieHeader.split(";")){
    const [k, ...rest] = part.trim().split("=");
    if(!k) continue;
    try { out[k] = decodeURIComponent(rest.join("=") || ""); }
    catch { out[k] = rest.join("=") || ""; }
  }
  return out;
}

function getAdminPassword(){
  return process.env.ADMIN_PASSWORD || "";
}

function getAdminSessionSecret(){
  return process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || "";
}

export function getAdminCookieName(){
  return ADMIN_COOKIE_NAME;
}

export function requireAdminPassword(body) {
  const provided = String(body?.admin_password || "");
  const expected = getAdminPassword();
  if (!expected) return { ok: false, error: "ADMIN_PASSWORD is not configured on server." };
  if (!provided) return { ok: false, error: "Missing admin password." };
  if (!timingSafeEqual(provided, expected)) return { ok: false, error: "Invalid admin password." };
  return { ok: true };
}

export async function makeAdminSessionToken(){
  const secret = getAdminSessionSecret();
  if(!secret) throw new Error("ADMIN_SESSION_SECRET or SESSION_SECRET is not configured on server.");
  return signSession({ role: "admin", exp: Date.now() + ADMIN_SESSION_MAX_AGE_MS }, secret);
}

export async function requireAdminSession(req){
  const secret = getAdminSessionSecret();
  if(!secret) return { ok:false, status:503, error:"ADMIN_SESSION_SECRET or SESSION_SECRET is not configured on server." };
  const cookies = parseCookies(req.headers.get("cookie") || "");
  const token = cookies[ADMIN_COOKIE_NAME] || "";
  const v = await verifySession(token, secret);
  if(!v.ok || v.payload?.role !== "admin") return { ok:false, status:401, error:"Admin session required." };
  return { ok:true, payload:v.payload };
}

export async function requireAdminAccess(req, body){
  const session = await requireAdminSession(req);
  if(session.ok) return session;

  // Backward compatibility for old static files: still allow a direct password,
  // but updated clients should use /api/admin-login and the HttpOnly cookie.
  const password = requireAdminPassword(body);
  if(password.ok) return { ok:true, legacy_password:true };
  return { ok:false, status:401, error:password.error || session.error || "Admin access denied." };
}

export function setAdminSessionCookie(res, token){
  res.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

export function clearAdminSessionCookie(res){
  res.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  }

  // Reuse the service-role client inside the warm Cloudflare Worker isolate.
  // This avoids rebuilding the Supabase client object on every API call while
  // preserving the same server-only auth behavior.
  const cacheKey = `${url}\n${key}`;
  if (serviceClientCache && serviceClientCacheKey === cacheKey) return serviceClientCache;

  serviceClientCache = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-client-info": "sr-tool-cloudflare" },
    },
  });
  serviceClientCacheKey = cacheKey;
  return serviceClientCache;
}
