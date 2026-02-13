import { NextResponse } from "next/server";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";

const ALLOWED_TABLES = new Set(["suggestions","support_messages","support_users","blocks","announcements","suggestion_replies"]);

export async function POST(req){
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return NextResponse.json({ error: chk.error }, { status: 401 });

  const table = String(body?.table || "");
  const id = body?.id;
  if(!ALLOWED_TABLES.has(table)) return NextResponse.json({ error:"Table not allowed." }, { status: 400 });
  if(id === undefined || id === null) return NextResponse.json({ error:"Missing id." }, { status: 400 });

  const supabase = getServiceSupabase();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if(error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
