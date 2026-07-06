import { NextResponse } from "next/server";
import { enforceSameOrigin, noStore } from "../../../lib/server/auth.js";
import { clearAdminSessionCookie } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const so = enforceSameOrigin(req);
  if(!so.ok) return j({ error: so.error }, { status: so.status || 403 });
  return clearAdminSessionCookie(j({ ok: true }));
}
