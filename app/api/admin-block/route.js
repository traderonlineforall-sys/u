import { NextResponse } from "next/server";
import { requireAdminPassword, getServiceSupabase } from "@/lib/server/admin";

export async function POST(req){
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return NextResponse.json({ error: chk.error }, { status: 401 });

  const user_id = String(body?.user_id || "");
  const minutes = Number(body?.minutes || 0);
  if(!user_id || !Number.isFinite(minutes) || minutes <= 0){
    return NextResponse.json({ error: "Invalid user_id or minutes." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const expires_at = new Date(Date.now() + minutes*60*1000).toISOString();

  // Insert a new block record (keep history) and rely on UI selecting latest.
  const { data, error } = await supabase
    .from("blocks")
    .insert([{ user_id, reason: String(body?.reason || "Blocked by admin"), expires_at }])
    .select("expires_at")
    .single();

  if(error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expires_at: data?.expires_at || expires_at });
}
