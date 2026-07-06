import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { requireAdminPassword, makeAdminSessionToken, setAdminSessionCookie } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const so = enforceSameOrigin(req);
  if(!so.ok) return j({ error: so.error }, { status: so.status || 403 });

  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });

  const body = await req.json().catch(() => ({}));
  const chk = requireAdminPassword(body);
  if(!chk.ok) return j({ error: chk.error }, { status: 401 });

  const token = await makeAdminSessionToken();
  const res = j({ ok: true });
  return setAdminSessionCookie(res, token);
}
