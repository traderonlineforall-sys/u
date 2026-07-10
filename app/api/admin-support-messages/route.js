import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase, requireAdminAccess } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const same = enforceSameOrigin(req);
  if(!same.ok) return j({ error:same.error }, { status:same.status || 403 });
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error:sess.error }, { status:sess.status || 401 });
  const body = await req.json().catch(() => ({}));
  const admin = await requireAdminAccess(req, body);
  if(!admin.ok) return j({ error:admin.error }, { status:admin.status || 401 });

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending:false })
    .limit(500);
  if(error) return j({ error:error.message || "Could not load support messages." }, { status:500 });
  return j({ ok:true, rows:Array.isArray(data) ? data : [] });
}
