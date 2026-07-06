import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { buildDeviceConfidence, recordDeviceNickname } from "../../../lib/server/device-confidence.js";
import { cleanNickname, normalizeUserId, getNicknameProfile } from "../../../lib/server/nickname.js";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 20000;

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const same = enforceSameOrigin(req);
  if(!same.ok) return j({ ok:false, learned:false, stage:"same_origin", error:same.error }, { status:same.status || 403 });

  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ ok:false, learned:false, stage:"session", error:sess.error }, { status:sess.status || 401 });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if(Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES){
    return j({ ok:false, learned:false, stage:"body_size", error:"Request body too large" }, { status:413 });
  }

  let body = {};
  try{ body = await req.json(); }catch{}

  const payload = sess.payload || {};
  const userId = normalizeUserId(payload.uid || "");
  let displayName = cleanNickname(payload.name || "");

  if(!userId){
    return j({ ok:false, learned:false, stage:"identity", error:"Missing authenticated user identity." }, { status:400 });
  }

  const supabase = getServiceSupabase();

  if(!displayName){
    const profile = await getNicknameProfile(supabase, userId);
    if(profile?.ok && !profile.reset_required) displayName = cleanNickname(profile.display_name || "");
    if(profile?.ok && profile.reset_required){
      return j({ ok:true, learned:false, stage:"profile", reason:"nickname_reset_required", user_id:userId });
    }
  }

  if(!displayName){
    return j({ ok:true, learned:false, stage:"profile", reason:"missing_nickname", user_id:userId });
  }

  const fp = buildDeviceConfidence(req, body.device_fingerprint || {}, process.env.DEVICE_FINGERPRINT_SECRET || process.env.SESSION_SECRET || "");
  if(!fp?.ok){
    return j({ ok:true, learned:false, stage:"fingerprint", reason:"fingerprint_unavailable", error:fp?.error || "missing_fingerprint" });
  }

  const saved = await recordDeviceNickname(supabase, userId, displayName, fp, 100);
  if(!saved?.ok){
    return j({ ok:false, learned:false, stage:"supabase_save", error:saved?.error || "Could not learn device." }, { status:500 });
  }
  if(saved.missing_table){
    return j({ ok:true, learned:false, stage:"supabase_save", reason:"missing_table", missing_table:true, user_id:userId, display_name:displayName });
  }

  return j({
    ok:true,
    learned:true,
    stage:"saved",
    action: saved.inserted ? "inserted" : saved.updated ? "updated" : "saved",
    user_id:userId,
    display_name:displayName,
    signal_summary: fp.signal_summary || {},
    device_hash_short: String(fp.device_hash || "").slice(0, 12)
  });
}
