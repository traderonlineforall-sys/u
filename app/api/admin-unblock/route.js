import { NextResponse } from "next/server";
import { requireAdminAccess, getServiceSupabase } from "../../../lib/server/admin.js";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";

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

  const user_id = String(body?.user_id || "");
  if(!user_id) return j({ error: "Invalid user_id." }, { status: 400 });

  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();

  async function tryExpire(payload) {
    return await supabase.from("blocks").update(payload).eq("user_id", user_id);
  }

  // Compatible with legacy schemas that may expose either expires_at or blocked_until.
  let r = await tryExpire({ expires_at: nowIso, blocked_until: nowIso });
  if (r.error) {
    r = await tryExpire({ expires_at: nowIso });
    if (r.error) r = await tryExpire({ blocked_until: nowIso });
  }

  if(r.error) return j({ error: r.error.message }, { status: 500 });
  return j({ ok: true });
}
