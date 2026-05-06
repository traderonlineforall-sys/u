import { NextResponse } from "next/server";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";
import { noStore } from "../../../lib/server/auth.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return j({ error: chk.error }, { status: 401 });

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("suggestion_replies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if(error) return j({ error: error.message }, { status: 500 });
  return j({ ok: true, replies: Array.isArray(data) ? data : [] });
}
