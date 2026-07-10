import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { requireActiveNickname, cleanNickname } from "../../../lib/server/nickname.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

function normalizeId(value){
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function normalizeUserId(value){
  const s = String(value || "").trim().slice(0, 160);
  return /^[a-zA-Z0-9_.:\-]{8,160}$/.test(s) ? s : "";
}

function cleanText(value, max = 1200){
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function cleanName(value){
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, 60);
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
  const suggestion_id = normalizeId(body?.suggestion_id);
  const text = cleanText(body?.text, 1200);
  const user_id = normalizeUserId(sess.payload?.uid);
  const requestedName = cleanNickname(body?.name || body?.display_name || "");

  if(!suggestion_id) return j({ error: "Missing suggestion id." }, { status: 400 });
  if(!text) return j({ error: "Missing reply text." }, { status: 400 });
  if(!user_id) return j({ error: "Missing authenticated user identity." }, { status: 401 });

  try {
    const supabase = getServiceSupabase();
    const nick = await requireActiveNickname(supabase, user_id, requestedName);
    if(!nick.ok){
      return j({
        error: nick.error || "Nickname is required.",
        nickname_required: !!nick.nickname_required,
        user_id,
      }, { status: nick.status || 409 });
    }

    const blocked = await currentBlockForUser(supabase, user_id);
    if(blocked){
      return j({ error: "You are blocked.", blocked_until: blocked.expires_at || null }, { status: 403 });
    }

    let payload = { suggestion_id, text, user_id, name: nick.display_name };
    let result = await supabase.from("suggestion_replies").insert(payload).select("*");

    // Compatibility with older schemas that do not have a `name` column.
    if(result.error && isMissingTableOrColumn(result.error) && /name/i.test(String(result.error.message || ""))){
      payload = { suggestion_id, text, user_id };
      result = await supabase.from("suggestion_replies").insert(payload).select("*");
    }

    if(result.error) return j({ error: result.error.message || "Reply insert failed." }, { status: 500 });
    return j({ ok: true, data: Array.isArray(result.data) ? result.data : [] });
  } catch (err) {
    return j({ error: String(err?.message || err || "Reply insert failed.") }, { status: 500 });
  }
}
