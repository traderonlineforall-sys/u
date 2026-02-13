import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

const ALLOWED_TABLES = new Set(["support_messages","suggestions"]);

export async function POST(req){
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return j({ error: chk.error }, { status: 401 });

  const table = String(body?.table || "");
  const before = body?.before; // ISO string
  if(!ALLOWED_TABLES.has(table)) return j({ error:"Table not allowed." }, { status: 400 });
  if(!before) return j({ error:"Missing before." }, { status: 400 });

  const supabase = getServiceSupabase();
  const { error } = await supabase.from(table).delete().lt("created_at", before);
  if(error) return j({ error: error.message }, { status: 500 });
  return j({ ok: true });
}