import { verifySession, getCookieName } from "../session.js";
import { getServiceSupabase } from "./admin.js";
import { validateUserSession } from "./session-registry.js";

function safeDecodeCookieValue(value){
  try { return decodeURIComponent(value || ""); }
  catch { return value || ""; }
}

function normalizeHost(value){
  return String(value || "").split(",")[0].trim().toLowerCase();
}

function parseCookies(cookieHeader){
  const out = {};
  if(!cookieHeader) return out;
  const parts = cookieHeader.split(";");
  for(const p of parts){
    const [k, ...rest] = p.trim().split("=");
    if(!k) continue;
    out[k] = safeDecodeCookieValue(rest.join("=") || "");
  }
  return out;
}

export async function readSignedUserSession(req){
  const secret = process.env.SESSION_SECRET || "";
  if(!secret) return { ok:false, status:503, error:"Server not configured (missing SESSION_SECRET)." };
  const cookies = parseCookies(req.headers.get("cookie") || "");
  const token = cookies[getCookieName()] || "";
  const v = await verifySession(token, secret);
  if(
    !v.ok ||
    v.payload?.role !== "user" ||
    Number(v.payload?.session_version || 0) !== 2 ||
    typeof v.payload?.uid !== "string" ||
    typeof v.payload?.sid !== "string"
  ) return { ok:false, status:401, error:"Not authenticated." };
  return { ok:true, payload:v.payload };
}

export async function requireUserSession(req){
  const signed = await readSignedUserSession(req);
  if(!signed.ok) return signed;
  let registry;
  try{
    registry = await validateUserSession(getServiceSupabase(), signed.payload);
  }catch{
    return { ok:false, status:503, error:"Could not validate authenticated session." };
  }
  if(!registry.ok) return registry;
  return signed;
}

export function enforceSameOrigin(req){
  // Best-effort CSRF mitigation for state-changing browser requests.
  const method = (req.method || "GET").toUpperCase();
  if(method === "GET" || method === "HEAD" || method === "OPTIONS") return { ok:true };

  const secFetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if(secFetchSite === "cross-site") {
    return { ok:false, status:403, error:"Cross-site request blocked." };
  }

  const origin = req.headers.get("origin");
  const host = normalizeHost(req.headers.get("x-forwarded-host") || req.headers.get("host"));
  if(!host) return { ok:false, status:400, error:"Missing Host header." };
  if(!origin) return { ok:true }; // allow non-browser clients
  try{
    const o = new URL(origin);
    if(normalizeHost(o.host) !== host) return { ok:false, status:403, error:"Cross-site request blocked." };
  }catch{
    return { ok:false, status:400, error:"Bad Origin header." };
  }
  return { ok:true };
}

function addVary(res, value){
  const current = res.headers.get("Vary") || "";
  const parts = new Set(current.split(",").map((v) => v.trim()).filter(Boolean));
  parts.add(value);
  res.headers.set("Vary", Array.from(parts).join(", "));
}

export function noStore(res){
  // Keep authenticated/API responses private and safe across Cloudflare/browser caches.
  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  addVary(res, "Cookie");
  addVary(res, "Origin");
  return res;
}
