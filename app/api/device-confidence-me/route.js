import { NextResponse } from "next/server";
import { requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { cleanNickname, normalizeUserId, getNicknameProfile, isMissingTableOrColumn } from "../../../lib/server/nickname.js";

export const runtime = "nodejs";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function GET(req){
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ ok:false, authenticated:false, stage:"session", error:sess.error }, { status:sess.status || 401 });

  const payload = sess.payload || {};
  const userId = normalizeUserId(payload.uid || "");
  const sessionName = cleanNickname(payload.name || "");
  const supabase = getServiceSupabase();

  let profile = null;
  if(userId){
    const p = await getNicknameProfile(supabase, userId);
    if(p?.ok) profile = { display_name:p.display_name || "", reset_required:!!p.reset_required, exists:!!p.exists };
    else profile = { error:p?.error || "could_not_read_profile" };
  }

  let devices_available = true;
  let devices = [];
  try{
    const res = await supabase
      .from("support_user_devices")
      .select("device_hash, display_name, confidence_score, first_seen_at, last_seen_at, match_count, revoked_at, signal_summary")
      .eq("user_id", userId || "__missing__")
      .order("last_seen_at", { ascending:false })
      .limit(20);
    if(res.error) throw res.error;
    devices = Array.isArray(res.data) ? res.data : [];
  }catch(err){
    if(isMissingTableOrColumn(err)) devices_available = false;
    else return j({ ok:false, authenticated:true, stage:"devices_read", error:String(err?.message || err || "Could not read device table."), user_id:userId, session_name:sessionName, profile }, { status:500 });
  }

  const active = devices.filter((d)=>!d.revoked_at);
  const best = active[0] || null;
  return j({
    ok:true,
    authenticated:true,
    user_id:userId,
    session_name:sessionName,
    profile,
    devices_available,
    active_devices:active.length,
    total_devices:devices.length,
    best_device: best ? {
      display_name: cleanNickname(best.display_name || ""),
      confidence_score: Number(best.confidence_score || 0),
      first_seen_at: best.first_seen_at || "",
      last_seen_at: best.last_seen_at || "",
      match_count: Number(best.match_count || 0),
      device_hash_short: String(best.device_hash || "").slice(0, 12),
      signal_summary: best.signal_summary || {}
    } : null
  });
}
