import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { requireAdminAccess, getServiceSupabase } from "../../../lib/server/admin.js";
import { isMissingTableOrColumn } from "../../../lib/server/nickname.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

function clean(value, max = 220){
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function fmtSummary(summary){
  const s = summary && typeof summary === "object" ? summary : {};
  return {
    platform: clean(s.platform, 80),
    language: clean(s.language, 40),
    timezone: clean(s.timezone, 80),
    screen: clean(s.screen, 40),
    dpr: clean(s.dpr, 20),
    touch: clean(s.touch, 20),
    graphics: clean(s.graphics, 150),
    ip_bucket: clean(s.ip_bucket, 32),
    keyboard: clean(s.keyboard, 32),
    capabilities: clean(s.capabilities, 32),
    network: clean(s.network, 80),
    battery: clean(s.battery, 80),
    media_devices: clean(s.media_devices, 80),
  };
}

export async function POST(req){
  const same = enforceSameOrigin(req);
  if(!same.ok) return j({ error: same.error }, { status: same.status || 403 });
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });
  const body = await req.json().catch(()=> ({}));
  const admin = await requireAdminAccess(req, body);
  if(!admin.ok) return j({ error: admin.error }, { status: admin.status || 401 });

  const supabase = getServiceSupabase();

  let users = [];
  try{
    let resUsers = await supabase
      .from("support_users")
      .select("user_id, display_name, nickname_reset_required, updated_at, created_at")
      .order("display_name", { ascending:true })
      .limit(1000);
    if(resUsers.error && /nickname_reset_required|column .*does not exist|schema cache/i.test(String(resUsers.error.message || ""))){
      resUsers = await supabase
        .from("support_users")
        .select("user_id, display_name")
        .order("display_name", { ascending:true })
        .limit(1000);
    }
    if(resUsers.error) throw resUsers.error;
    users = Array.isArray(resUsers.data) ? resUsers.data : [];
  }catch(err){
    if(isMissingTableOrColumn(err)) return j({ ok:true, rows:[], devices_available:false, message:"support_users table is not configured." });
    return j({ error: String(err?.message || err || "Could not load user profiles.") }, { status:500 });
  }

  let devices = [];
  let devicesAvailable = true;
  try{
    const resDevices = await supabase
      .from("support_user_devices")
      .select("user_id, device_hash, signal_summary, confidence_score, first_seen_at, last_seen_at, match_count, revoked_at")
      .order("last_seen_at", { ascending:false })
      .limit(3000);
    if(resDevices.error) throw resDevices.error;
    devices = Array.isArray(resDevices.data) ? resDevices.data : [];
  }catch(err){
    if(isMissingTableOrColumn(err)) devicesAvailable = false;
    else return j({ error: String(err?.message || err || "Could not load device confidence data.") }, { status:500 });
  }

  const byUser = new Map();
  for(const d of devices){
    const uid = String(d.user_id || "");
    if(!uid) continue;
    const cur = byUser.get(uid) || { active:0, revoked:0, best_confidence:0, last_seen_at:"", match_count:0, device_short:"", summary:null };
    if(d.revoked_at) cur.revoked += 1;
    else cur.active += 1;
    cur.match_count += Number(d.match_count || 0);
    const conf = Number(d.confidence_score || 0);
    if(!d.revoked_at && conf >= cur.best_confidence){
      cur.best_confidence = conf;
      cur.last_seen_at = d.last_seen_at || cur.last_seen_at || "";
      cur.device_short = String(d.device_hash || "").slice(0, 12);
      cur.summary = fmtSummary(d.signal_summary || {});
    }
    if(!cur.last_seen_at || String(d.last_seen_at || "") > cur.last_seen_at) cur.last_seen_at = d.last_seen_at || cur.last_seen_at;
    byUser.set(uid, cur);
  }

  const rows = users.map((u)=>{
    const uid = String(u.user_id || "");
    const dev = byUser.get(uid) || { active:0, revoked:0, best_confidence:0, last_seen_at:"", match_count:0, device_short:"", summary:null };
    return {
      user_id: uid,
      display_name: clean(u.display_name, 80),
      nickname_reset_required: !!u.nickname_reset_required,
      updated_at: u.updated_at || "",
      created_at: u.created_at || "",
      device: dev,
    };
  });

  return j({ ok:true, rows, devices_available:devicesAvailable });
}
