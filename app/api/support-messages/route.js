import { NextResponse } from "next/server";
import { requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

function clampLimit(value, fallback = 300){
  const n = Number(value);
  if(!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(n)));
}

function normalizeRoomType(value){
  const s = String(value || "public").trim().toLowerCase();
  return s === "dm" ? "dm" : "public";
}

function normalizeText(value, fallback = ""){
  return String(value == null ? fallback : value);
}

function normalizeUserId(value){
  const s = String(value || "").trim().slice(0, 160);
  return /^[a-zA-Z0-9_.:\-]{8,160}$/.test(s) ? s : "";
}

function dmParticipants(roomId){
  const parts = String(roomId || "").split("__");
  if(parts.length !== 2) return [];
  const ids = parts.map(normalizeUserId);
  return ids.every(Boolean) && ids[0] !== ids[1] ? ids : [];
}

function canAccessDm(roomId, userId){
  return dmParticipants(roomId).includes(userId);
}

function isMissingTableOrColumn(error){
  const msg = String(error?.message || "");
  const details = String(error?.details || "");
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || /Could not find|does not exist|column .* does not exist|schema cache/i.test(msg + " " + details);
}

function normalizeRow(row){
  const r = row && typeof row === "object" ? { ...row } : {};
  const userId = normalizeText(r.user_id || r.sender_id || "");
  const senderId = normalizeText(r.sender_id || r.user_id || userId);
  const senderName = normalizeText(r.sender_name || r.name || r.display_name || "User");
  return {
    ...r,
    user_id: userId || senderId,
    sender_id: senderId || userId,
    sender_name: senderName || "User",
    message: normalizeText(r.message || r.text || ""),
    room_type: normalizeText(r.room_type || "public"),
    room_id: normalizeText(r.room_id || "public"),
    created_at: r.created_at || new Date().toISOString(),
  };
}

function isExplicitDmRow(row){
  const r = normalizeRow(row);
  const roomType = String(r.room_type || "public").trim().toLowerCase();
  const roomId = String(r.room_id || "public").trim();
  return roomType === "dm" || (!!roomId && roomId !== "public" && roomId.includes("__"));
}

function isPublicLikeRow(row){
  return !isExplicitDmRow(row);
}

async function selectRows(supabase, { roomType, roomId, limit, recentOnly }){
  const trySelects = [
    "*",
    "id,user_id,sender_id,sender_name,message,room_type,room_id,created_at",
    "id,user_id,sender_name,message,created_at",
    "id,user_id,name,message,created_at",
  ];

  let lastError = null;
  for(const columns of trySelects){
    try{
      let query = supabase
        .from("support_messages")
        .select(columns)
        // Always pull newest rows first. For the room view we reverse below so
        // messages still display old-to-new, but the latest messages are included.
        .order("created_at", { ascending: false })
        .limit(limit);

      if(!recentOnly && roomType === "dm"){
        query = query.eq("room_type", "dm").eq("room_id", roomId);
      }

      const { data, error } = await query;
      if(!error){
        let rows = (Array.isArray(data) ? data : []).map(normalizeRow);
        if(!recentOnly && roomType === "public"){
          // Public support must include legacy rows and admin-visible rows without
          // room columns. Only exclude explicit DM rows.
          rows = rows.filter(isPublicLikeRow);
        }
        if(!recentOnly && roomType === "dm"){
          rows = rows.filter((r) => String(r.room_type || "") === "dm" && String(r.room_id || "") === String(roomId || ""));
        }
        if(!recentOnly){
          rows = rows.reverse();
        }
        return { rows, error: null };
      }
      lastError = error;
      if(!isMissingTableOrColumn(error)) break;
    }catch(err){
      lastError = err;
      if(!isMissingTableOrColumn(err)) break;
    }
  }
  return { rows: [], error: lastError };
}

export async function GET(req){
  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });
  const userId = normalizeUserId(sess.payload?.uid);
  if(!userId) return j({ error:"Missing authenticated user identity." }, { status:401 });

  const url = new URL(req.url);
  const mode = String(url.searchParams.get("mode") || "messages");
  const limit = clampLimit(url.searchParams.get("limit"), mode === "recent" ? 500 : 300);
  const roomType = normalizeRoomType(url.searchParams.get("room_type"));
  const roomId = String(url.searchParams.get("room_id") || (roomType === "public" ? "public" : "")).trim();

  if(mode !== "recent" && roomType === "dm" && !roomId){
    return j({ error: "Missing room id." }, { status: 400 });
  }
  if(mode !== "recent" && roomType === "dm" && !canAccessDm(roomId, userId)){
    return j({ error:"You are not a participant in this private room." }, { status:403 });
  }

  try{
    const supabase = getServiceSupabase();
    const { rows, error } = await selectRows(supabase, {
      roomType,
      roomId,
      limit,
      recentOnly: mode === "recent",
    });
    if(error) return j({ error: error.message || "Could not load support messages." }, { status: 500 });
    const visibleRows = mode === "recent"
      ? rows.filter((row) => isPublicLikeRow(row) || canAccessDm(row?.room_id, userId))
      : rows;
    return j({ ok: true, rows:visibleRows });
  }catch(err){
    return j({ error: String(err?.message || err || "Could not load support messages.") }, { status: 500 });
  }
}
