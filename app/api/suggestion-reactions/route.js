import { NextResponse } from "next/server";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { enforceSameOrigin, noStore } from "../../../lib/server/auth.js";

const TABLE = "suggestion_reactions";
const ALLOWED_REACTIONS = new Set(["like", "love", "angry"]);

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

function normalizeId(value){
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function normalizeUserId(value){
  const s = String(value || "").trim().slice(0, 160);
  return /^[a-zA-Z0-9_.:\-]{8,160}$/.test(s) ? s : "";
}

function normalizeReaction(value){
  const s = String(value || "").trim();
  return ALLOWED_REACTIONS.has(s) ? s : "";
}

function isMissingTableError(error){
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || /relation .*suggestion_reactions.* does not exist/i.test(msg) || /Could not find the table/i.test(msg);
}

function summarizeRows(rows = [], userId = ""){
  const out = Object.create(null);
  for (const row of rows) {
    const sid = String(row?.suggestion_id || "");
    const reaction = normalizeReaction(row?.reaction);
    if (!sid || !reaction) continue;
    if (!out[sid]) out[sid] = { counts: { like: 0, love: 0, angry: 0 }, mine: "" };
    out[sid].counts[reaction] = (out[sid].counts[reaction] || 0) + 1;
    if (userId && String(row?.user_id || "") === userId) out[sid].mine = reaction;
  }
  return out;
}

async function listReactions(supabase, suggestionIds, userId){
  let q = supabase.from(TABLE).select("suggestion_id,user_id,reaction");
  if (suggestionIds.length) q = q.in("suggestion_id", suggestionIds);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return summarizeRows(Array.isArray(data) ? data : [], userId);
}

export async function POST(req){
  const sameOrigin = enforceSameOrigin(req);
  if (!sameOrigin.ok) return j({ error: sameOrigin.error }, { status: sameOrigin.status });

  const body = await req.json().catch(()=> ({}));
  const action = String(body?.action || "list").trim();
  const userId = normalizeUserId(body?.user_id);
  const supabase = getServiceSupabase();

  try {
    if (action === "list") {
      const ids = Array.isArray(body?.suggestion_ids) ? body.suggestion_ids.map(normalizeId).filter(Boolean).slice(0, 300) : [];
      const summary = await listReactions(supabase, ids, userId);
      return j({ ok: true, reactions: summary });
    }

    if (action === "toggle") {
      const suggestionId = normalizeId(body?.suggestion_id);
      const reaction = normalizeReaction(body?.reaction);
      if (!suggestionId) return j({ error: "Missing suggestion_id" }, { status: 400 });
      if (!userId) return j({ error: "Missing user_id" }, { status: 400 });
      if (!reaction) return j({ error: "Invalid reaction" }, { status: 400 });

      const existing = await supabase
        .from(TABLE)
        .select("id,reaction")
        .eq("suggestion_id", suggestionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (existing.error && existing.error.code !== "PGRST116") throw existing.error;

      const current = existing.data || null;
      if (current?.id && current.reaction === reaction) {
        const del = await supabase.from(TABLE).delete().eq("id", current.id);
        if (del.error) throw del.error;
      } else {
        const del = await supabase.from(TABLE).delete().eq("suggestion_id", suggestionId).eq("user_id", userId);
        if (del.error) throw del.error;
        const ins = await supabase.from(TABLE).insert({ suggestion_id: suggestionId, user_id: userId, reaction });
        if (ins.error) throw ins.error;
      }

      const summary = await listReactions(supabase, [suggestionId], userId);
      return j({ ok: true, reactions: summary });
    }

    return j({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (isMissingTableError(error)) {
      return j({ ok: false, missing_table: true, error: "suggestion_reactions table is missing" }, { status: 200 });
    }
    return j({ error: String(error?.message || "Suggestion reaction failed") }, { status: 500 });
  }
}
