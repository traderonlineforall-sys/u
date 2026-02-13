import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return j({ error: chk.error }, { status: 401 });

  const user_id = String(body?.user_id || "");
  if(!user_id) return j({ error:"Missing user_id." }, { status: 400 });

  const supabase = getServiceSupabase();
  const { error } = await supabase.from("support_users").delete().eq("user_id", user_id);
  if(error) return j({ error: error.message }, { status: 500 });
  return j({ ok: true });
}