import { randomUUID } from "node:crypto";
import { signSession, verifySession } from "../session.js";
import { cleanNickname, getNicknameProfile, isMissingTableOrColumn, normalizeUserId } from "./nickname.js";

const TABLE = "support_device_identities";
const DEVICE_COOKIE_NAME = "__Host-srdevice";
const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const DEVICE_COOKIE_MAX_AGE_MS = DEVICE_COOKIE_MAX_AGE_SECONDS * 1000;

function safeDecodeCookieValue(value){
  try { return decodeURIComponent(value || ""); }
  catch { return value || ""; }
}

function parseCookies(cookieHeader){
  const out = {};
  for(const part of String(cookieHeader || "").split(";")){
    const [key, ...rest] = part.trim().split("=");
    if(!key) continue;
    out[key] = safeDecodeCookieValue(rest.join("=") || "");
  }
  return out;
}

function identitySecret(){
  return process.env.DEVICE_IDENTITY_SECRET || process.env.SESSION_SECRET || "";
}

function deviceKeyHash(fp){
  return String(fp?.device_key_hash || fp?.component_hashes?.device_key_hash || "").trim();
}

function timingSafeEqual(a, b){
  const enc = new TextEncoder();
  const aa = enc.encode(String(a || ""));
  const bb = enc.encode(String(b || ""));
  const max = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for(let i = 0; i < max; i += 1) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}

async function readDeviceBy(supabase, column, value){
  const res = await supabase
    .from(TABLE)
    .select("device_id,user_id,device_key_hash,display_name,created_at,last_seen_at,revoked_at")
    .eq(column, value)
    .limit(1);
  if(res.error){
    if(isMissingTableOrColumn(res.error) || /support_device_identities/i.test(String(res.error.message || ""))){
      return { ok:true, missing_table:true, row:null };
    }
    return { ok:false, error:res.error.message || "Could not read trusted device identity." };
  }
  return { ok:true, row:Array.isArray(res.data) && res.data[0] ? res.data[0] : null };
}

async function activeIdentityResult(supabase, row, expectedKeyHash){
  if(!row || row.revoked_at) return { ok:true, matched:false, reason:row?.revoked_at ? "device_revoked" : "device_not_found" };
  const uid = normalizeUserId(row.user_id);
  if(!uid || !timingSafeEqual(row.device_key_hash, expectedKeyHash)){
    return { ok:true, matched:false, reason:"device_key_mismatch" };
  }

  const profile = await getNicknameProfile(supabase, uid);
  if(!profile?.ok) return { ok:false, error:profile?.error || "Could not read trusted device profile." };
  if(!profile.exists || profile.reset_required || !profile.display_name){
    return { ok:true, matched:false, reason:"profile_reset_or_missing" };
  }

  await supabase
    .from(TABLE)
    .update({ last_seen_at:new Date().toISOString(), display_name:profile.display_name })
    .eq("device_id", row.device_id)
    .is("revoked_at", null);

  return {
    ok:true,
    matched:true,
    device_id:String(row.device_id || ""),
    user_id:uid,
    display_name:cleanNickname(profile.display_name || row.display_name || ""),
  };
}

export function getTrustedDeviceCookieName(){
  return DEVICE_COOKIE_NAME;
}

export async function resolveTrustedDeviceIdentity(req, supabase, fp){
  const keyHash = deviceKeyHash(fp);
  if(!keyHash) return { ok:true, matched:false, reason:"missing_device_key" };

  const secret = identitySecret();
  if(!secret) return { ok:false, error:"DEVICE_IDENTITY_SECRET or SESSION_SECRET is not configured." };

  const cookies = parseCookies(req.headers.get("cookie") || "");
  const token = cookies[DEVICE_COOKIE_NAME] || "";
  if(token){
    const verified = await verifySession(token, secret);
    const deviceId = String(verified?.payload?.did || "");
    const tokenUid = normalizeUserId(verified?.payload?.uid || "");
    if(verified.ok && verified.payload?.role === "trusted_device" && deviceId && tokenUid){
      const byId = await readDeviceBy(supabase, "device_id", deviceId);
      if(!byId.ok || byId.missing_table) return byId;
      if(byId.row && normalizeUserId(byId.row.user_id) === tokenUid){
        const exact = await activeIdentityResult(supabase, byId.row, keyHash);
        if(exact.matched || !exact.ok) return exact;
        if(exact.reason === "device_key_mismatch"){
          // Recovery path: the signed HttpOnly trusted-device cookie is still
          // valid, but the browser-local key was regenerated or restored from
          // another browser profile. Because this route is reached only after
          // the shared login credentials were verified, safely rebind the same
          // trusted device row to the current browser key instead of blocking
          // the user or forcing a new nickname.
          const currentKey = await readDeviceBy(supabase, "device_key_hash", keyHash);
          if(!currentKey.ok || currentKey.missing_table) return currentKey;
          if(currentKey.row){
            if(currentKey.row.revoked_at){
              return { ok:false, status:403, error:"This trusted device was revoked by admin." };
            }
            if(normalizeUserId(currentKey.row.user_id) !== tokenUid){
              return {
                ok:false,
                status:409,
                error:"This browser key is already linked to another nickname. Ask admin to review the trusted-device records.",
              };
            }
            return activeIdentityResult(supabase, currentKey.row, keyHash);
          }

          const rebound = await supabase
            .from(TABLE)
            .update({ device_key_hash:keyHash, last_seen_at:new Date().toISOString() })
            .eq("device_id", deviceId)
            .eq("user_id", tokenUid)
            .is("revoked_at", null);

          if(rebound.error){
            if(String(rebound.error?.code || "") === "23505"){
              return {
                ok:false,
                status:409,
                error:"This browser key is already linked to another nickname. Ask admin to review the trusted-device records.",
              };
            }
            return { ok:false, error:rebound.error.message || "Could not rebind trusted device key." };
          }

          return activeIdentityResult(
            supabase,
            { ...byId.row, device_key_hash:keyHash, last_seen_at:new Date().toISOString() },
            keyHash
          );
        }
        if(exact.reason === "device_revoked"){
          return { ok:false, status:403, error:"This trusted device was revoked by admin." };
        }
      }
    }
  }

  // Cookie may be cleared while the browser-local random device key remains.
  // Recover only by this exact high-entropy key; never by IP/UA/fuzzy fingerprint.
  const byKey = await readDeviceBy(supabase, "device_key_hash", keyHash);
  if(!byKey.ok || byKey.missing_table) return byKey;
  const exact = await activeIdentityResult(supabase, byKey.row, keyHash);
  if(exact.reason === "device_revoked") return { ok:false, status:403, error:"This trusted device was revoked by admin." };
  return exact;
}

export async function registerTrustedDeviceIdentity(supabase, userId, displayName, fp){
  const uid = normalizeUserId(userId);
  const name = cleanNickname(displayName || "");
  const keyHash = deviceKeyHash(fp);
  if(!uid || !name || !keyHash){
    return { ok:false, status:400, error:"Missing trusted device identity fields." };
  }

  const existing = await readDeviceBy(supabase, "device_key_hash", keyHash);
  if(!existing.ok || existing.missing_table) return existing;
  if(existing.row){
    if(existing.row.revoked_at){
      return { ok:false, status:403, revoked:true, error:"This trusted device was revoked by admin." };
    }
    if(normalizeUserId(existing.row.user_id) !== uid){
      return { ok:false, status:409, error:"This trusted device is already linked to another nickname." };
    }
    const updated = await supabase
      .from(TABLE)
      .update({ display_name:name, last_seen_at:new Date().toISOString() })
      .eq("device_id", existing.row.device_id)
      .is("revoked_at", null);
    if(updated.error) return { ok:false, error:updated.error.message || "Could not refresh trusted device." };
    return { ok:true, device_id:String(existing.row.device_id), user_id:uid, display_name:name, existing:true };
  }

  const deviceId = randomUUID();
  const now = new Date().toISOString();
  const inserted = await supabase.from(TABLE).insert({
    device_id:deviceId,
    user_id:uid,
    device_key_hash:keyHash,
    display_name:name,
    created_at:now,
    last_seen_at:now,
  });
  if(inserted.error){
    if(isMissingTableOrColumn(inserted.error) || /support_device_identities/i.test(String(inserted.error.message || ""))){
      return { ok:true, missing_table:true };
    }
    return { ok:false, error:inserted.error.message || "Could not register trusted device." };
  }
  return { ok:true, device_id:deviceId, user_id:uid, display_name:name, registered:true };
}

export async function makeTrustedDeviceToken(device){
  const secret = identitySecret();
  if(!secret) throw new Error("DEVICE_IDENTITY_SECRET or SESSION_SECRET is not configured.");
  return signSession({
    role:"trusted_device",
    did:String(device?.device_id || ""),
    uid:normalizeUserId(device?.user_id || ""),
    exp:Date.now() + DEVICE_COOKIE_MAX_AGE_MS,
  }, secret);
}

export function setTrustedDeviceCookie(res, token){
  if(!token) return res;
  res.cookies.set({
    name:DEVICE_COOKIE_NAME,
    value:token,
    httpOnly:true,
    secure:true,
    sameSite:"strict",
    path:"/",
    maxAge:DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}

export function clearTrustedDeviceCookie(res){
  res.cookies.set({
    name:DEVICE_COOKIE_NAME,
    value:"",
    httpOnly:true,
    secure:true,
    sameSite:"strict",
    path:"/",
    maxAge:0,
  });
  return res;
}
