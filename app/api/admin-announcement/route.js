import { NextResponse } from "next/server";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";

function parseAnnouncementText(raw){
  const text = String(raw || "");
  let envelope_text = "";
  let urgent_text = "";
  let urgent_enabled = false;

  // New format: JSON
  try{
    const obj = JSON.parse(text);
    if(obj && typeof obj === "object"){
      envelope_text = String(obj.envelope || obj.envelope_text || "");
      urgent_text = String(obj.urgent || obj.urgent_text || "");
      urgent_enabled = !!(obj.urgent_enabled);
      return { text, envelope_text, urgent_text, urgent_enabled };
    }
  }catch(_){}

  // Legacy format: prefix
  const prefix = "URGENT_TICKER::";
  if(text.startsWith(prefix)){
    urgent_enabled = true;
    urgent_text = text.slice(prefix.length).trim();
    return { text, envelope_text, urgent_text, urgent_enabled };
  }

  // Legacy format: plain text = envelope
  envelope_text = text;
  return { text, envelope_text, urgent_text, urgent_enabled };
}

export async function GET(){
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if(error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = Array.isArray(data) && data[0] ? data[0] : null;

  const parsed = parseAnnouncementText(row?.text || "");
  return NextResponse.json({
    text: parsed.text,
    envelope_text: parsed.envelope_text,
    urgent_text: parsed.urgent_text,
    urgent_enabled: parsed.urgent_enabled,
    created_at: row?.created_at || null
  });
}

export async function POST(req){
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return NextResponse.json({ error: chk.error }, { status: 401 });

  // Accept both the old {text} and the new fields.
  const envelope_text = String(body?.envelope_text ?? "");
  const urgent_text = String(body?.urgent_text ?? "");
  const urgent_enabled = !!body?.urgent_enabled;

  let text = String(body?.text ?? "");

  // If any new-field is provided, store as JSON for backward compatibility.
  if(envelope_text || urgent_text || urgent_enabled){
    text = JSON.stringify({
      envelope: envelope_text,
      urgent: urgent_text,
      urgent_enabled
    });
  }

  text = String(text || "").trim();
  if(!text){
    return NextResponse.json({ error: "Announcement text is empty." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .insert([{ text }])
    .select("text, created_at")
    .single();

  if(error) return NextResponse.json({ error: error.message }, { status: 500 });

  const parsed = parseAnnouncementText(data?.text || text);
  return NextResponse.json({
    text: parsed.text,
    envelope_text: parsed.envelope_text,
    urgent_text: parsed.urgent_text,
    urgent_enabled: parsed.urgent_enabled,
    created_at: data?.created_at || null
  });
}
