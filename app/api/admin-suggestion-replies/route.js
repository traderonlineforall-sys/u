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

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("suggestion_replies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if(error) return j({ error: error.message }, { status: 500 });
  return j({ ok: true, replies: Array.isArray(data) ? data : [] });
}
