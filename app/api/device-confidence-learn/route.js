import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { buildDeviceConfidence, recordDeviceNickname } from "../../../lib/server/device-confidence.js";
import { cleanNickname, normalizeUserId, getNicknameProfile } from "../../../lib/server/nickname.js";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16384;

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const same = enforceSameOrigin(req);
  if(!same.ok) return j({ ok:false, learned:false, error:same.error }, { status:same.status || 403 });

  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ ok:false, learned:false, error:sess.error }, { status:sess.status || 401 });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if(Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES){
    return j({ ok:false, learned:false, error:"Request body too large" }, { status:413 });
  }

  let body = {};
  try{ body = await req.json(); }catch{}

  const payload = sess.payload || {};
  const userId = normalizeUserId(payload.uid || "");
  let displayName = cleanNickname(payload.name || "");

  if(!userId){
    return j({ ok:false, learned:false, error:"Missing authenticated user identity." }, { status:400 });
  }

  const supabase = getServiceSupabase();

  // Use the signed session as source of truth. If the token does not carry
  // the display name for any legacy reason, read the server profile.
  if(!displayName){
    const profile = await getNicknameProfile(supabase, userId);
    if(profile?.ok && !profile.reset_required) displayName = cleanNickname(profile.display_name || "");
  }

  if(!displayName){
    return j({ ok:true, learned:false, reason:"missing_nickname" });
  }

  const fp = buildDeviceConfidence(req, body.device_fingerprint || {}, process.env.SESSION_SECRET || "");
  if(!fp?.ok){
    return j({ ok:true, learned:false, reason:"fingerprint_unavailable" });
  }

  const saved = await recordDeviceNickname(supabase, userId, displayName, fp, 100);
  if(!saved?.ok){
    return j({ ok:false, learned:false, error:saved?.error || "Could not learn device." }, { status:500 });
  }

  return j({ ok:true, learned:true, missing_table:!!saved.missing_table, user_id:userId, display_name:displayName });
}
