import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const same = enforceSameOrigin(req);
  if(!same.ok) return j({ error: same.error }, { status: same.status || 403 });
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });

  const body = await req.json().catch(()=> ({}));
  const id = Number(body?.id);
  const user_id = String(body?.user_id || "").trim();

  if(!Number.isFinite(id) || id <= 0) {
    return j({ error: "Missing or invalid message id." }, { status: 400 });
  }
  if(!user_id) {
    return j({ error: "Missing user id." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();

    const { data: row, error: findError } = await supabase
      .from("support_messages")
      .select("id, sender_id")
      .eq("id", id)
      .maybeSingle();

    if(findError) return j({ error: findError.message }, { status: 500 });
    if(!row) return j({ error: "Message not found." }, { status: 404 });
    if(String(row.sender_id || "") !== user_id) {
      return j({ error: "You can only delete your own messages." }, { status: 403 });
    }

    const { error: delError } = await supabase
      .from("support_messages")
      .delete()
      .eq("id", id)
      .eq("sender_id", user_id);

    if(delError) return j({ error: delError.message }, { status: 500 });
    return j({ ok: true, id });
  } catch (err) {
    return j({ error: String(err?.message || err || "Delete failed") }, { status: 500 });
  }
}
