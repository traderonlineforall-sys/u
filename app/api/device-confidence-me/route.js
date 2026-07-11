import { NextResponse } from "next/server";
import { requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { getNicknameProfile, normalizeUserId } from "../../../lib/server/nickname.js";

export const runtime = "nodejs";

function j(body, init) {
  return noStore(NextResponse.json(body, init));
}

export async function GET(req) {
  const session = await requireUserSession(req);
  if (!session.ok) {
    return j({ ok: false, authenticated: false, error: session.error }, { status: session.status || 401 });
  }

  const userId = normalizeUserId(session.payload?.uid);
  const profile = await getNicknameProfile(getServiceSupabase(), userId);
  if (!profile?.ok || !profile.exists || profile.active === false || profile.reset_required || !profile.display_name) {
    return j({ ok: false, authenticated: false, error: "Active user profile is required." }, { status: 409 });
  }

  // This endpoint deliberately exposes no internal id, fingerprint, score,
  // evidence, or device row. It only refreshes current presentation data.
  return j({ ok: true, authenticated: true, display_name: profile.display_name });
}
