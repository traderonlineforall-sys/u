import { NextResponse } from "next/server";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";

const TABLE = "suggestion_item_reactions";
const ALLOWED_TYPES = new Set(["suggestion", "reply"]);
const PUBLIC_REACTIONS = new Set(["like", "love", "angry", "laugh", "sad", "dislike"]);
const STORAGE_REACTIONS = new Set(["like", "love", "angry", "laugh", "sad", "slipper", "dislike"]);

function j(body, init){ return noStore(NextResponse.json(body, init)); }
function normalizeId(value){ const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; }
function normalizeUserId(value){ const s = String(value || "").trim().slice(0, 160); return /^[a-zA-Z0-9_.:\-]{8,160}$/.test(s) ? s : ""; }
function normalizeType(value){ const s = String(value || "").trim(); return ALLOWED_TYPES.has(s) ? s : ""; }
function publicReaction(value){ const s = String(value || "").trim(); if (s === "slipper") return "dislike"; return PUBLIC_REACTIONS.has(s) ? s : ""; }
function storageReaction(value){ const s = String(value || "").trim(); if (s === "dislike") return "slipper"; return STORAGE_REACTIONS.has(s) ? s : ""; }
function isMissingTableError(error){ const msg = String(error?.message || ""); const code = String(error?.code || ""); return code === "42P01" || /relation .*suggestion_item_reactions.* does not exist/i.test(msg) || /Could not find the table/i.test(msg); }
function emptyCounts(){ return { like: 0, love: 0, angry: 0, laugh: 0, sad: 0, dislike: 0 }; }
function emptyUsers(){ return { like: [], love: [], angry: [], laugh: [], sad: [], dislike: [] }; }
function targetKey(type, id){ return `${type}:${id}`; }

async function loadUserNames(supabase, userIds){
  const ids = Array.from(new Set((userIds || []).map((x) => String(x || "").trim()).filter(Boolean))).slice(0, 1000);
  const map = new Map();
  ids.forEach((id) => map.set(id, id.slice(0, 10)));
  if (!ids.length) return map;
  try {
    const { data, error } = await supabase.from("support_users").select("user_id,display_name").in("user_id", ids).limit(1000);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const id = String(row?.user_id || "").trim();
        const name = String(row?.display_name || "").trim();
        if (id && name) map.set(id, name.slice(0, 60));
      }
    }
  } catch {}
  return map;
}

async function summarize(rows = [], userId = "", supabase){
  const names = await loadUserNames(supabase, rows.map((r) => r?.user_id));
  const out = Object.create(null);
  for (const row of rows) {
    const type = normalizeType(row?.target_type);
    const id = normalizeId(row?.target_id);
    const reaction = publicReaction(row?.reaction);
    const reactingUserId = String(row?.user_id || "").trim();
    if (!type || !id || !reaction || !reactingUserId) continue;
    const key = targetKey(type, id);
    if (!out[key]) out[key] = { counts: emptyCounts(), mine: "", users: emptyUsers() };
    out[key].counts[reaction] = (out[key].counts[reaction] || 0) + 1;
    const displayName = names.get(reactingUserId) || reactingUserId.slice(0, 10);
    if (!out[key].users[reaction].includes(displayName)) out[key].users[reaction].push(displayName);
    if (userId && reactingUserId === userId) out[key].mine = reaction;
  }
  return out;
}

function normalizeTargets(value){
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value.slice(0, 500)) {
    const type = normalizeType(item?.target_type || item?.type);
    const id = normalizeId(item?.target_id || item?.id);
    if (!type || !id) continue;
    const key = targetKey(type, id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, id });
  }
  return out;
}

async function listReactions(supabase, targets, userId){
  if (!targets.length) return Object.create(null);
  const ids = Array.from(new Set(targets.map((t) => t.id)));
  const wanted = new Set(targets.map((t) => targetKey(t.type, t.id)));
  const { data, error } = await supabase.from(TABLE).select("target_type,target_id,user_id,reaction").in("target_id", ids).limit(10000);
  if (error) throw error;
  const filtered = (Array.isArray(data) ? data : []).filter((row) => {
    const type = normalizeType(row?.target_type);
    const id = normalizeId(row?.target_id);
    return type && id && wanted.has(targetKey(type, id));
  });
  return summarize(filtered, userId, supabase);
}

export async function POST(req){
  const sameOrigin = enforceSameOrigin(req);
  if (!sameOrigin.ok) return j({ error: sameOrigin.error }, { status: sameOrigin.status });
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "list").trim();
  const userId = normalizeUserId(body?.user_id);
  const supabase = getServiceSupabase();
  try {
    if (action === "list") {
      const targets = normalizeTargets(body?.targets);
      const summary = await listReactions(supabase, targets, userId);
      return j({ ok: true, reactions: summary });
    }
    if (action === "toggle") {
      const targetType = normalizeType(body?.target_type);
      const targetId = normalizeId(body?.target_id);
      const publicKey = publicReaction(body?.reaction);
      const dbKey = storageReaction(publicKey);
      if (!targetType) return j({ error: "Missing target_type" }, { status: 400 });
      if (!targetId) return j({ error: "Missing target_id" }, { status: 400 });
      if (!userId) return j({ error: "Missing user_id" }, { status: 400 });
      if (!publicKey || !dbKey) return j({ error: "Invalid reaction" }, { status: 400 });
      const existing = await supabase.from(TABLE).select("id,reaction").eq("target_type", targetType).eq("target_id", targetId).eq("user_id", userId).maybeSingle();
      if (existing.error && existing.error.code !== "PGRST116") throw existing.error;
      const current = existing.data || null;
      if (current?.id && publicReaction(current.reaction) === publicKey) {
        const del = await supabase.from(TABLE).delete().eq("id", current.id);
        if (del.error) throw del.error;
      } else {
        const del = await supabase.from(TABLE).delete().eq("target_type", targetType).eq("target_id", targetId).eq("user_id", userId);
        if (del.error) throw del.error;
        const ins = await supabase.from(TABLE).insert({ target_type: targetType, target_id: targetId, user_id: userId, reaction: dbKey });
        if (ins.error) throw ins.error;
      }
      const summary = await listReactions(supabase, [{ type: targetType, id: targetId }], userId);
      return j({ ok: true, reactions: summary });
    }
    return j({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (isMissingTableError(error)) return j({ ok: false, missing_table: true, error: "suggestion_item_reactions table is missing" }, { status: 200 });
    return j({ error: String(error?.message || "Suggestion item reaction failed") }, { status: 500 });
  }
}
