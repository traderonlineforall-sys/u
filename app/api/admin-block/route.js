import { NextResponse } from "next/server";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";

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
  const reason = String(body?.reason || "Blocked by admin");

  // Some deployments keep a single active block per user (via a unique constraint),
  // while others keep history. To work on both schemas:
  // 1) Try to update the latest active row for this user (if exists).
  // 2) Otherwise insert a new row.
  const nowIso = new Date().toISOString();

  try{
    const { data: existing, error: selErr } = await supabase
      .from("blocks")
      .select("id, expires_at")
      .eq("user_id", user_id)
      .gt("expires_at", nowIso)
      .order("expires_at", { ascending: false })
      .limit(1);

    if(!selErr && Array.isArray(existing) && existing.length > 0){
      const id = existing[0].id;
      const { data: upd, error: updErr } = await supabase
        .from("blocks")
        .update({ expires_at, reason })
        .eq("id", id)
        .select("expires_at")
        .single();

      if(updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      return NextResponse.json({ expires_at: upd?.expires_at || expires_at });
    }
  }catch(_){
    // ignore and fallback to insert
  }

  const { data, error } = await supabase
    .from("blocks")
    .insert([{ user_id, reason, expires_at }])
    .select("expires_at")
    .single();

  if(error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expires_at: data?.expires_at || expires_at });
}
