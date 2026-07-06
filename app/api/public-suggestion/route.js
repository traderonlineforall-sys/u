import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

function normalizeUserId(value){
  const s = String(value || "").trim().slice(0, 160);
  return /^[a-zA-Z0-9_.:\-]{8,160}$/.test(s) ? s : "";
}

function cleanText(value, max = 2000){
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function isMissingTableOrColumn(error){
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || /Could not find|does not exist|column .* does not exist/i.test(msg);
}

async function currentBlockForUser(supabase, userId){
  if(!userId) return null;
  const now = new Date().toISOString();
  try {
    let res = await supabase
      .from("blocks")
      .select("expires_at,reason")
      .eq("user_id", userId)
      .gt("expires_at", now)
      .order("expires_at", { ascending: false })
      .limit(1);

    if(res.error && isMissingTableOrColumn(res.error)){
      res = await supabase
        .from("blocks")
        .select("blocked_until,reason")
        .eq("user_id", userId)
        .gt("blocked_until", now)
        .order("blocked_until", { ascending: false })
        .limit(1);
      if(!res.error && res.data && res.data[0]){
        return { expires_at: res.data[0].blocked_until, reason: res.data[0].reason || "" };
      }
    }

    if(res.error) return null;
    return res.data && res.data[0] ? res.data[0] : null;
  } catch {
    return null;
  }
}

export async function POST(req){
  const same = enforceSameOrigin(req);
  if(!same.ok) return j({ error: same.error }, { status: same.status || 403 });

  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });

  const body = await req.json().catch(() => ({}));
  const text = cleanText(body?.text, 2000);
  const user_id = normalizeUserId(body?.user_id);

  if(!text) return j({ error: "Missing suggestion text." }, { status: 400 });
  if(!user_id) return j({ error: "Missing user id." }, { status: 400 });

  try {
    const supabase = getServiceSupabase();
    const blocked = await currentBlockForUser(supabase, user_id);
    if(blocked){
      return j({ error: "You are blocked.", blocked_until: blocked.expires_at || null }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("suggestions")
      .insert({ text, user_id })
      .select("*");

    if(error) return j({ error: error.message || "Suggestion insert failed." }, { status: 500 });
    return j({ ok: true, data: Array.isArray(data) ? data : [] });
  } catch (err) {
    return j({ error: String(err?.message || err || "Suggestion insert failed.") }, { status: 500 });
  }
}
