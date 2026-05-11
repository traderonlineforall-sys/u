import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

const ALLOWED_TABLES = new Set(["suggestions","support_messages","support_users","blocks","announcements","suggestion_replies"]);

export async function POST(req){
  const so = enforceSameOrigin(req);
  if(!so.ok) return j({ error: so.error }, { status: so.status || 403 });
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return j({ error: chk.error }, { status: 401 });

  const table = String(body?.table || "");
  const id = body?.id;
  if(!ALLOWED_TABLES.has(table)) return j({ error:"Table not allowed." }, { status: 400 });
  if(id === undefined || id === null) return j({ error:"Missing id." }, { status: 400 });

  const supabase = getServiceSupabase();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if(error) return j({ error: error.message }, { status: 500 });
  return j({ ok: true });
}