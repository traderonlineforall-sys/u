import { NextResponse } from "next/server";
import { requireAdminPassword, getServiceSupabase } from "@/lib/server/admin";

const ALLOWED_TABLES = new Set(["support_messages","suggestions"]);

export async function POST(req){
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return NextResponse.json({ error: chk.error }, { status: 401 });

  const table = String(body?.table || "");
  const before = body?.before; // ISO string
  if(!ALLOWED_TABLES.has(table)) return NextResponse.json({ error:"Table not allowed." }, { status: 400 });
  if(!before) return NextResponse.json({ error:"Missing before." }, { status: 400 });

  const supabase = getServiceSupabase();
  const { error } = await supabase.from(table).delete().lt("created_at", before);
  if(error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
