import { createClient } from "@supabase/supabase-js";

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

export function requireAdminPassword(body) {
  const provided = String(body?.admin_password || "");
  const expected = process.env.ADMIN_PASSWORD || "";
  // Allow fallback to BASIC_AUTH_PASS to reduce config pain.
  const fallback = process.env.BASIC_AUTH_PASS || "";
  const exp = expected || fallback;
  if (!exp) return { ok: false, error: "Admin password is not configured on server." };
  if (!provided) return { ok: false, error: "Missing admin password." };
  if (!timingSafeEqual(provided, exp)) return { ok: false, error: "Invalid admin password." };
  return { ok: true };
}

export function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
