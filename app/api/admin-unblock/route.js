import { NextResponse } from "next/server";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";

export async function POST(req){
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return NextResponse.json({ error: chk.error }, { status: 401 });

  const user_id = String(body?.user_id || "");
  if(!user_id) return NextResponse.json({ error: "Invalid user_id." }, { status: 400 });

  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  // best effort: expire any active blocks
  const { error } = await supabase
    .from("blocks")
    .update({ expires_at: nowIso, blocked_until: nowIso })
    .eq("user_id", user_id);

  if(error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
