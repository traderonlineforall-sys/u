import { NextResponse } from "next/server";
import { requireAdminPassword, getServiceSupabase } from "@/lib/server/admin";

export async function GET(){
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  if(error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = Array.isArray(data) && data[0] ? data[0] : null;
  return NextResponse.json({ text: row?.text || "", created_at: row?.created_at || null });
}

export async function POST(req){
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return NextResponse.json({ error: chk.error }, { status: 401 });

  const text = String(body?.text || "");
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .insert([{ text }])
    .select("text, created_at")
    .single();

  if(error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ text: data?.text || text, created_at: data?.created_at || null });
}
