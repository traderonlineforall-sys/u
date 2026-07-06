import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

function normalizeUserId(value){
  const s = String(value || "").trim().slice(0, 160);
  return /^[a-zA-Z0-9_.:\-]{8,160}$/.test(s) ? s : "";
}

function cleanName(value){
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, 60);
}

function isMissingTableError(error){
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || /support_users.*does not exist|Could not find the table/i.test(msg);
}

export async function POST(req){
  const same = enforceSameOrigin(req);
  if(!same.ok) return j({ error: same.error }, { status: same.status || 403 });

  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });

  const body = await req.json().catch(() => ({}));
  const user_id = normalizeUserId(body?.user_id);
  const display_name = cleanName(body?.display_name);

  if(!user_id) return j({ error: "Missing user id." }, { status: 400 });
  if(!display_name) return j({ error: "Missing display name." }, { status: 400 });

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("support_users")
      .upsert({ user_id, display_name }, { onConflict: "user_id" });

    if(error){
      if(isMissingTableError(error)) return j({ ok: true, missing_table: true });
      return j({ error: error.message || "Profile update failed." }, { status: 500 });
    }

    return j({ ok: true });
  } catch (err) {
    return j({ error: String(err?.message || err || "Profile update failed.") }, { status: 500 });
  }
}
