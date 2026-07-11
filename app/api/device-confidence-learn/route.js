import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { buildDeviceConfidence, recordDeviceNickname } from "../../../lib/server/device-confidence.js";
import { normalizeUserId, getNicknameProfile } from "../../../lib/server/nickname.js";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16384;
const textEncoder = new TextEncoder();

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const same = enforceSameOrigin(req);
  if(!same.ok) return j({ ok:false, error:same.error }, { status:same.status || 403 });

  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ ok:false, error:sess.error }, { status:sess.status || 401 });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if(Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES){
    return j({ ok:false, error:"Request body too large" }, { status:413 });
  }

  let body = {};
  try{
    const rawBody = await req.text();
    if(textEncoder.encode(rawBody).byteLength > MAX_BODY_BYTES){
      return j({ ok:false, error:"Request body too large" }, { status:413 });
    }
    body = JSON.parse(rawBody);
  }catch{
    return j({ ok:false, error:"Invalid request body." }, { status:400 });
  }

  const payload = sess.payload || {};
  const userId = normalizeUserId(payload.uid || "");

  if(!userId){
    return j({ ok:false, error:"Missing authenticated user identity." }, { status:400 });
  }

  const supabase = getServiceSupabase();
  const profile = await getNicknameProfile(supabase, userId);
  if(!profile?.ok || !profile.exists || profile.active === false || profile.reset_required || !profile.display_name){
    return j({ ok:false, error:"Active user profile is required." }, { status:409 });
  }
  const displayName = profile.display_name;

  const fp = buildDeviceConfidence(req, body.device_fingerprint || {}, process.env.SESSION_SECRET || "");
  if(!fp?.ok){
    return j({ ok:true, learned:false, reason:"fingerprint_unavailable" });
  }

  // A session created from an inference or user selection must never feed back
  // as independent proof. Only a session whose signed provenance explicitly
  // allows strengthening may update the legacy verified observation store.
  const canStrengthen = payload.can_strengthen === true;
  const assurance = String(payload.assurance || "derived_session");
  const source = assurance === "verified_credential"
    ? "verified_device_credential"
    : (assurance === "credential_continuation" ? "verified_local_device_secret" : "derived_session");
  const saved = await recordDeviceNickname(supabase, userId, displayName, fp, 100, {
    decision_id:payload.decision_id,
    source,
    truth_level:canStrengthen ? "verified_device" : "derived_decision",
    canStrengthen,
    evidence_groups:canStrengthen ? ["server_session_provenance", "device_credential"] : [],
    evidence_lineage:{ session_decision_id:payload.decision_id || null, assurance },
  });
  if(!saved?.ok){
    return j({ ok:false, error:saved?.error || "Could not learn device." }, { status:500 });
  }

  return j({
    ok:true,
    learned:canStrengthen && !saved.skipped,
    trusted_device:canStrengthen,
    missing_table:!!saved.missing_table,
  });
}
