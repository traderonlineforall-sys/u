import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

function parseAnnouncementText(raw){
  const text = String(raw || "");
  let envelope_text = "";
  let urgent_text = "";
  let urgent_enabled = false;
  let urgent_voice = "ar-EG-SalmaNeural";

  // New format: JSON
  try{
    const obj = JSON.parse(text);
    if(obj && typeof obj === "object"){
      envelope_text = String(obj.envelope || obj.envelope_text || "");
      urgent_text = String(obj.urgent || obj.urgent_text || "");
      urgent_enabled = !!(obj.urgent_enabled);
      urgent_voice = String(obj.urgent_voice || "ar-EG-SalmaNeural");
      return { text, envelope_text, urgent_text, urgent_enabled, urgent_voice };
    }
  }catch(_){}

  // Legacy format: prefix
  const prefix = "URGENT_TICKER::";
  if(text.startsWith(prefix)){
    urgent_enabled = true;
    urgent_text = text.slice(prefix.length).trim();
    return { text, envelope_text, urgent_text, urgent_enabled, urgent_voice };
  }

  // Legacy format: plain text = envelope
  envelope_text = text;
  return { text, envelope_text, urgent_text, urgent_enabled, urgent_voice };
}

export async function GET(){
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if(error) return j({ error: error.message }, { status: 500 });
  const row = Array.isArray(data) && data[0] ? data[0] : null;

  const parsed = parseAnnouncementText(row?.text || "");
  return j({
    text: parsed.text,
    envelope_text: parsed.envelope_text,
    urgent_text: parsed.urgent_text,
    urgent_enabled: parsed.urgent_enabled,
    urgent_voice: parsed.urgent_voice || "ar-EG-SalmaNeural",
    created_at: row?.created_at || null
  });
}

export async function POST(req){
  const so = enforceSameOrigin(req);
  if(!so.ok) return j({ error: so.error }, { status: so.status || 403 });
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });
  const body = await req.json().catch(()=> ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return j({ error: chk.error }, { status: 401 });

  // Accept both the old {text} and the new fields.
  const envelope_text = String(body?.envelope_text ?? "");
  const urgent_text = String(body?.urgent_text ?? "");
  const urgent_enabled = !!body?.urgent_enabled;
  const urgent_voice = String(body?.urgent_voice || "ar-EG-SalmaNeural").trim() || "ar-EG-SalmaNeural";

  let text = String(body?.text ?? "");

  // If any new-field is provided, store as JSON for backward compatibility.
  if(envelope_text || urgent_text || urgent_enabled){
    text = JSON.stringify({
      envelope: envelope_text,
      urgent: urgent_text,
      urgent_enabled,
      urgent_voice
    });
  }

  text = String(text || "").trim();
  if(!text){
    return j({ error: "Announcement text is empty." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .insert([{ text }])
    .select("text, created_at")
    .single();

  if(error) return j({ error: error.message }, { status: 500 });

  const parsed = parseAnnouncementText(data?.text || text);
  return j({
    text: parsed.text,
    envelope_text: parsed.envelope_text,
    urgent_text: parsed.urgent_text,
    urgent_enabled: parsed.urgent_enabled,
    urgent_voice: parsed.urgent_voice || "ar-EG-SalmaNeural",
    created_at: data?.created_at || null
  });
}