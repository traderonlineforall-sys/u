import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { requireAdminAccess, getServiceSupabase } from "../../../lib/server/admin.js";

function j(body, init) {
  return noStore(NextResponse.json(body, init));
}

const ALLOWED_TABLES = new Set(["support_messages", "suggestions"]);
const MAX_IDS_PER_REQUEST = 500;

export async function POST(req) {
  const so = enforceSameOrigin(req);
  if (!so.ok) return j({ error: so.error }, { status: so.status || 403 });

  const sess = await requireUserSession(req);
  if (!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });

  const body = await req.json().catch(() => ({}));
  const chk = await requireAdminAccess(req, body);
  if (!chk.ok) return j({ error: chk.error }, { status: chk.status || 401 });

  const table = String(body?.table || "");
  if (!ALLOWED_TABLES.has(table)) return j({ error: "Table not allowed." }, { status: 400 });

  const supabase = getServiceSupabase();

  const ids = Array.isArray(body?.ids)
    ? body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (ids.length > 0) {
    const uniqueIds = Array.from(new Set(ids)).slice(0, MAX_IDS_PER_REQUEST);
    const { error } = await supabase.from(table).delete().in("id", uniqueIds);
    if (error) return j({ error: error.message }, { status: 500 });
    return j({ ok: true, deleted_ids: uniqueIds });
  }

  const before = body?.before; // ISO string legacy cleanup mode
  if (!before) return j({ error: "Missing ids or before." }, { status: 400 });

  const parsedDate = new Date(before);
  if (Number.isNaN(parsedDate.getTime())) return j({ error: "Invalid before date." }, { status: 400 });

  const { error } = await supabase.from(table).delete().lt("created_at", parsedDate.toISOString());
  if (error) return j({ error: error.message }, { status: 500 });
  return j({ ok: true, before: parsedDate.toISOString() });
}
