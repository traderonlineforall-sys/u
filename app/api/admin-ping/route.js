import { NextResponse } from "next/server";
import { requireAdminPassword } from "../../../lib/server/admin.js";

export async function POST(req){
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return NextResponse.json({ error: chk.error }, { status: 401 });
  return NextResponse.json({ ok: true });
}
