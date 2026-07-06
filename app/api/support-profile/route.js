import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { ensureNicknameForUser, normalizeUserId, cleanNickname } from "../../../lib/server/nickname.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const same = enforceSameOrigin(req);
  if(!same.ok) return j({ error: same.error }, { status: same.status || 403 });

  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });

  const body = await req.json().catch(() => ({}));
  const user_id = normalizeUserId(body?.user_id || sess.payload?.uid);
  const requestedName = cleanNickname(body?.display_name || body?.nickname || "");

  if(!user_id) return j({ error: "Missing user id." }, { status: 400 });

  try {
    const supabase = getServiceSupabase();
    const out = await ensureNicknameForUser(supabase, user_id, requestedName);
    if(!out.ok){
      return j({
        error: out.error || "Nickname is required.",
        nickname_required: !!out.nickname_required,
        user_id,
      }, { status: out.status || 409 });
    }
    return j({ ok: true, user_id, display_name: out.display_name || requestedName });
  } catch (err) {
    return j({ error: String(err?.message || err || "Profile update failed.") }, { status: 500 });
  }
}
