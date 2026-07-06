import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { requireAdminAccess, getServiceSupabase } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

/**
 * Admin block:
 * - Compatible with different legacy schemas:
 *   - blocks.expires_at (timestamp)
 *   - blocks.blocked_until (timestamp)
 * - Strategy:
 *   1) Delete existing rows for the user (keeps it simple & schema-agnostic).
 *   2) Insert a new row, trying a payload that includes both fields, then fallback.
 */
export async function POST(req) {
  const so = enforceSameOrigin(req);
  if(!so.ok) return j({ error: so.error }, { status: so.status || 403 });
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });
  const body = await req.json().catch(() => ({}));
  const chk = await requireAdminAccess(req, body);
  if (!chk.ok) return j({ error: chk.error }, { status: chk.status || 401 });

  const user_id = String(body?.user_id || "").trim();
  const minutes = Number(body?.minutes || 0);
  if (!user_id || !Number.isFinite(minutes) || minutes <= 0) {
    return j({ error: "Invalid user_id or minutes." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const expires_at = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const reason = String(body?.reason || "").slice(0, 200) || "Blocked by admin";

  // Cleanup previous blocks for that user (works for both history & single-row schemas)
  await supabase.from("blocks").delete().eq("user_id", user_id);

  async function tryInsert(payload) {
    const { data, error } = await supabase
      .from("blocks")
      .insert([payload])
      .select("*")
      .single();
    return { data, error };
  }

  // Try: both columns
  let r = await tryInsert({ user_id, expires_at, blocked_until: expires_at, reason });

  // Fallbacks based on which column exists
  if (r.error) {
    const msg = String(r.error.message || "");
    // If blocked_until doesn't exist -> retry without it
    r = await tryInsert({ user_id, expires_at, reason });
    if (r.error) {
      // If expires_at doesn't exist -> retry blocked_until only
      r = await tryInsert({ user_id, blocked_until: expires_at, reason });
      if (r.error) {
        return j({ error: r.error.message || "Block failed" }, { status: 500 });
      }
    }
  }

  return j({ ok: true, user_id, expires_at });
}