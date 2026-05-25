import { NextResponse } from "next/server";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
export const dynamic = "force-dynamic";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const so = enforceSameOrigin(req);
  if(!so.ok) return j({ error: so.error }, { status: so.status || 403 });
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });

  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return j({ error: chk.error }, { status: 401 });

  const user_id = String(body?.user_id || "");
  if(!user_id) return j({ error: "Invalid user_id." }, { status: 400 });

  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  // best effort: expire any active blocks
  const { error } = await supabase
    .from("blocks")
    .update({ expires_at: nowIso, blocked_until: nowIso })
    .eq("user_id", user_id);

  if(error) return j({ error: error.message }, { status: 500 });
  return j({ ok: true });
}
