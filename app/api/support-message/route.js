import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { requireActiveNickname, cleanNickname } from "../../../lib/server/nickname.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

function normalizeUserId(value){
  const s = String(value || "").trim().slice(0, 160);
  return /^[a-zA-Z0-9_.:\-]{8,160}$/.test(s) ? s : "";
}

function cleanText(value, max){
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function normalizeRoomType(value){
  const s = String(value || "public").trim().toLowerCase();
  return s === "dm" ? "dm" : "public";
}

function normalizeRoomId(value, roomType, senderId){
  const s = String(value || "").trim().slice(0, 360);
  if(roomType === "public") return "public";
  if(!/^[a-zA-Z0-9_.:\-]+__[a-zA-Z0-9_.:\-]+$/.test(s)) return "";
  if(senderId && !s.split("__").includes(senderId)) return "";
  return s;
}

function isMissingTableOrColumn(error){
  const msg = String(error?.message || "");
  const details = String(error?.details || "");
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || /Could not find|does not exist|column .* does not exist|schema cache/i.test(msg + " " + details);
}

function normalizeInsertedRow(row, fallback){
  const r = row && typeof row === "object" ? { ...row } : {};
  r.sender_id = String(r.sender_id || r.user_id || fallback.sender_id || "");
  r.user_id = String(r.user_id || r.sender_id || fallback.user_id || "");
  r.sender_name = String(r.sender_name || r.name || fallback.sender_name || "User");
  r.message = String(r.message || fallback.message || "");
  r.room_type = String(r.room_type || fallback.room_type || "public");
  r.room_id = String(r.room_id || fallback.room_id || "public");
  r.created_at = r.created_at || new Date().toISOString();
  return r;
}

async function currentBlockForUser(supabase, userId){
  if(!userId) return null;
  const now = new Date().toISOString();
  try {
    let res = await supabase
      .from("blocks")
      .select("expires_at,reason")
      .eq("user_id", userId)
      .gt("expires_at", now)
      .order("expires_at", { ascending: false })
      .limit(1);

    if(res.error && isMissingTableOrColumn(res.error)){
      res = await supabase
        .from("blocks")
        .select("blocked_until,reason")
        .eq("user_id", userId)
        .gt("blocked_until", now)
        .order("blocked_until", { ascending: false })
        .limit(1);
      if(!res.error && res.data && res.data[0]){
        return { expires_at: res.data[0].blocked_until, reason: res.data[0].reason || "" };
      }
    }

    if(res.error) return null;
    return res.data && res.data[0] ? res.data[0] : null;
  } catch {
    return null;
  }
}

async function insertSupportMessage(supabase, basePayload){
  // New schema first, then safe legacy fallbacks. This fixes old Supabase projects
  // that do not have room_type/room_id or sender_id yet.
  const attempts = [
    {
      label: "full",
      payload: {
        sender_id: basePayload.sender_id,
        user_id: basePayload.user_id,
        sender_name: basePayload.sender_name,
        message: basePayload.message,
        room_type: basePayload.room_type,
        room_id: basePayload.room_id,
      },
    },
    {
      label: "no-room-columns",
      payload: {
        sender_id: basePayload.sender_id,
        user_id: basePayload.user_id,
        sender_name: basePayload.sender_name,
        message: basePayload.message,
      },
    },
    {
      label: "legacy-user-id",
      payload: {
        user_id: basePayload.user_id,
        sender_name: basePayload.sender_name,
        message: basePayload.message,
      },
    },
    {
      label: "legacy-name",
      payload: {
        user_id: basePayload.user_id,
        name: basePayload.sender_name,
        message: basePayload.message,
      },
    },
  ];

  let lastError = null;
  for(const attempt of attempts){
    const { data, error } = await supabase
      .from("support_messages")
      .insert(attempt.payload)
      .select("*");

    if(!error){
      const rows = Array.isArray(data) ? data.map((row) => normalizeInsertedRow(row, basePayload)) : [];
      return { data: rows, error: null, used: attempt.label };
    }

    lastError = error;
    if(!isMissingTableOrColumn(error)) break;
  }

  return { data: [], error: lastError || new Error("Message insert failed.") };
}

export async function POST(req){
  const same = enforceSameOrigin(req);
  if(!same.ok) return j({ error: same.error }, { status: same.status || 403 });

  const sess = await requireUserSession(req);
  if(!sess.ok) return j({ error: sess.error }, { status: sess.status || 401 });

  const body = await req.json().catch(() => ({}));
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : body;
  const sender_id = normalizeUserId(sess.payload?.uid);
  const user_id = sender_id;
  const requested_sender_name = cleanNickname(payload?.sender_name || payload?.display_name || "");
  const message = cleanText(payload?.message, 5000);
  const room_type = normalizeRoomType(payload?.room_type);
  const room_id = normalizeRoomId(payload?.room_id, room_type, sender_id);

  if(!sender_id) return j({ error: "Missing authenticated user identity." }, { status: 401 });
  if(!message) return j({ error: "Missing message." }, { status: 400 });
  if(!room_id) return j({ error: "Invalid room." }, { status: 400 });

  try {
    const supabase = getServiceSupabase();
    const nick = await requireActiveNickname(supabase, sender_id, requested_sender_name);
    if(!nick.ok){
      return j({
        error: nick.error || "Nickname is required.",
        nickname_required: !!nick.nickname_required,
        user_id: sender_id,
      }, { status: nick.status || 409 });
    }

    const blocked = await currentBlockForUser(supabase, sender_id);
    if(blocked){
      return j({ error: "You are blocked.", blocked_until: blocked.expires_at || null }, { status: 403 });
    }

    const basePayload = { sender_id, user_id, sender_name: nick.display_name, message, room_type, room_id };
    const { data, error, used } = await insertSupportMessage(supabase, basePayload);
    if(error) return j({ error: error.message || "Message insert failed." }, { status: 500 });
    return j({ ok: true, data, compatibility_mode: used !== "full", used_schema: used });
  } catch (err) {
    return j({ error: String(err?.message || err || "Message insert failed.") }, { status: 500 });
  }
}
