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

  const user_id = normalizeUserId(body?.user_id);
  if(!user_id) return j({ error:"Missing user_id." }, { status: 400 });

  const supabase = getServiceSupabase();
  const out = await resetNicknameForUser(supabase, user_id);
  if(!out.ok) return j({ error: out.error || "Could not reset nickname." }, { status: out.status || 500 });
  return j({ ok: true, reset: true, user_id });
}
