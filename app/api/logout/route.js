import { NextResponse } from "next/server";
import { enforceSameOrigin, noStore } from "../../../lib/server/auth.js";
import { getCookieName } from "../../../lib/session.js";

function j(body, init){ return noStore(NextResponse.json(body, init)); }

export const runtime = "nodejs";

export async function POST() {
  const so = enforceSameOrigin(request);
  if(!so.ok) return j({ error: so.error }, { status: so.status || 403 });
  const res = j({ ok: true });
  res.cookies.set({
    name: getCookieName(),
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}