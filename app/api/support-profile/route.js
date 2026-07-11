import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { getNicknameProfile, normalizeUserId } from "../../../lib/server/nickname.js";

function j(body, init) {
  return noStore(NextResponse.json(body, init));
}

async function currentProfile(req) {
  const sess = await requireUserSession(req);
  if (!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });
  const userId = normalizeUserId(sess.payload?.uid);
  if (!userId) return j({ error: "Not authenticated." }, { status: 401 });

  const profile = await getNicknameProfile(getServiceSupabase(), userId);
  if (!profile?.ok || !profile.exists || profile.active === false || profile.reset_required || !profile.display_name) {
    return j({ error: "Active user profile is required." }, { status: 409 });
  }

  // This compatibility endpoint is available only after an authenticated
  // session exists. Its server-derived actor id is never accepted as login or
  // ownership evidence by any write route.
  return j({ ok: true, user_id: userId, display_name: profile.display_name });
}

export async function GET(req) {
  return currentProfile(req);
}

export async function POST(req) {
  const same = enforceSameOrigin(req);
  if (!same.ok) return j({ error: same.error }, { status: same.status || 403 });
  // Nicknames are managed in the database/admin workflow. Browser input can no
  // longer create, replace, or reset identity presentation data.
  return currentProfile(req);
}
