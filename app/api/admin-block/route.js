import { NextResponse } from "next/server";
import { requireAdminPassword, getServiceSupabase } from "../../../lib/server/admin.js";

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
  const body = await req.json().catch(() => ({}));
  const chk = requireAdminPassword(body);
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: 401 });

  const user_id = String(body?.user_id || "").trim();
  const minutes = Number(body?.minutes || 0);
  if (!user_id || !Number.isFinite(minutes) || minutes <= 0) {
    return NextResponse.json({ error: "Invalid user_id or minutes." }, { status: 400 });
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
        return NextResponse.json({ error: r.error.message || "Block failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, user_id, expires_at });
}
