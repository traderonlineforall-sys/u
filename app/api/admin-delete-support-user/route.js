import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { requireAdminAccess, getServiceSupabase } from "../../../lib/server/admin.js";
import { resetNicknameForUser, normalizeUserId } from "../../../lib/server/nickname.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const so = enforceSameOrigin(req);
  if(!so.ok) return j({ error: so.error }, { status: so.status || 403 });
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });
  const body = await req.json().catch(()=> ({}));
  const chk = await requireAdminAccess(req, body);
  if(!chk.ok) return j({ error: chk.error }, { status: chk.status || 401 });

  const rawUserIds = Array.isArray(body?.user_ids) ? body.user_ids : null;
  const user_ids = rawUserIds
    ? Array.from(new Set(rawUserIds.map((v) => normalizeUserId(v)).filter(Boolean)))
    : [];

  if(user_ids.length > 0){
    if(user_ids.length > 250) return j({ error:"Too many nicknames selected. Max 250 per request." }, { status: 400 });

    const supabase = getServiceSupabase();
    const failed = [];
    let reset_count = 0;

    for(const uid of user_ids){
      const out = await resetNicknameForUser(supabase, uid);
      if(out.ok){
        reset_count += 1;
      }else{
        failed.push({ user_id: uid, error: out.error || "Could not reset nickname." });
      }
    }

    return j({ ok: failed.length === 0, reset: true, bulk: true, reset_count, failed });
  }

  const user_id = normalizeUserId(body?.user_id);
  if(!user_id) return j({ error:"Missing user_id." }, { status: 400 });

  const supabase = getServiceSupabase();
  const out = await resetNicknameForUser(supabase, user_id);
  if(!out.ok) return j({ error: out.error || "Could not reset nickname." }, { status: out.status || 500 });
  return j({ ok: true, reset: true, user_id });
}
