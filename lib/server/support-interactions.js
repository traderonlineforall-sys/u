const REACTION_KEYS = new Set(["like", "love", "laugh", "angry", "sad", "dislike"]);

export function normalizeSupportMessageId(value){
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function normalizeSupportUserId(value){
  const s = String(value || "").trim().slice(0, 160);
  return /^[a-zA-Z0-9_.:\-]{8,160}$/.test(s) ? s : "";
}

export function normalizeSupportReaction(value){
  const s = String(value || "").trim().toLowerCase();
  return REACTION_KEYS.has(s) ? s : "";
}

export function isMissingSupportInteractionSchema(error){
  const code = String(error?.code || "");
  const text = `${String(error?.message || "")} ${String(error?.details || "")}`;
  return code === "42P01" || code === "42703" ||
    /support_message_(reactions|reads)|relation .* does not exist|column .* does not exist|schema cache/i.test(text);
}

function aliasForUserId(value){
  const s = String(value || "");
  let h = 0;
  for(let i = 0; i < s.length; i += 1){
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return `User-${(Math.abs(h) % 9000) + 1000}`;
}

function normalizeMessageRow(row){
  const r = row && typeof row === "object" ? row : {};
  const senderId = normalizeSupportUserId(r.sender_id || r.user_id);
  const rawRoomType = String(r.room_type || "public").trim().toLowerCase();
  const roomId = String(r.room_id || (rawRoomType === "dm" ? "" : "public")).trim();
  const explicitDm = rawRoomType === "dm" || (!!roomId && roomId !== "public" && roomId.includes("__"));
  const roomType = explicitDm ? "dm" : "public";
  return {
    id: normalizeSupportMessageId(r.id),
    sender_id: senderId,
    room_type: roomType,
    room_id: roomId,
  };
}

export function canAccessSupportMessage(row, userId){
  const uid = normalizeSupportUserId(userId);
  const r = normalizeMessageRow(row);
  if(!uid || !r.id) return false;
  if(r.room_type !== "dm") return true;
  const participants = r.room_id.split("__").map(normalizeSupportUserId).filter(Boolean);
  return participants.length === 2 && participants.includes(uid);
}

export function normalizeSupportMessageIds(value, limit = 300){
  const out = [];
  const seen = new Set();
  for(const raw of (Array.isArray(value) ? value : []).slice(0, limit)){
    const id = normalizeSupportMessageId(raw);
    if(!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function loadAccessibleSupportMessages(supabase, ids, userId){
  const wanted = normalizeSupportMessageIds(ids);
  if(!wanted.length) return [];

  const selects = [
    "id,user_id,sender_id,room_type,room_id",
    "id,user_id,sender_id",
    "id,user_id",
  ];
  let lastError = null;
  for(const columns of selects){
    const { data, error } = await supabase
      .from("support_messages")
      .select(columns)
      .in("id", wanted)
      .limit(wanted.length);
    if(!error){
      return (Array.isArray(data) ? data : []).filter((row) => canAccessSupportMessage(row, userId));
    }
    lastError = error;
    if(!isMissingSupportInteractionSchema(error)) break;
  }
  if(lastError) throw lastError;
  return [];
}

async function loadDisplayNames(supabase, ids){
  const unique = Array.from(new Set((ids || []).map(normalizeSupportUserId).filter(Boolean))).slice(0, 1000);
  const names = new Map(unique.map((id) => [id, aliasForUserId(id)]));
  if(!unique.length) return names;
  try{
    const { data, error } = await supabase
      .from("support_users")
      .select("user_id,display_name")
      .in("user_id", unique)
      .limit(unique.length);
    if(!error && Array.isArray(data)){
      for(const row of data){
        const id = normalizeSupportUserId(row?.user_id);
        const name = String(row?.display_name || "").replace(/\s+/g, " ").trim().slice(0, 60);
        if(id && name) names.set(id, name);
      }
    }
  }catch{}
  return names;
}

function emptyReactionCounts(){
  return { like:0, love:0, laugh:0, angry:0, sad:0, dislike:0 };
}

function emptyReactionUsers(){
  return { like:[], love:[], laugh:[], angry:[], sad:[], dislike:[] };
}

function emptyInteraction(){
  return {
    reactions: { counts:emptyReactionCounts(), users:emptyReactionUsers(), mine:"" },
    readers: [],
    read_count: 0,
  };
}

export async function loadSupportInteractions(supabase, messageRows, userId){
  const uid = normalizeSupportUserId(userId);
  const ids = normalizeSupportMessageIds((messageRows || []).map((row) => row?.id));
  const interactions = Object.create(null);
  ids.forEach((id) => { interactions[String(id)] = emptyInteraction(); });
  if(!ids.length) return { available:true, interactions };

  const [reactionResult, readResult] = await Promise.all([
    supabase
      .from("support_message_reactions")
      .select("message_id,user_id,reaction,created_at")
      .in("message_id", ids)
      .limit(10000),
    supabase
      .from("support_message_reads")
      .select("message_id,user_id,read_at")
      .in("message_id", ids)
      .order("read_at", { ascending:true })
      .limit(10000),
  ]);

  if(reactionResult.error) throw reactionResult.error;
  if(readResult.error) throw readResult.error;

  const reactionRows = Array.isArray(reactionResult.data) ? reactionResult.data : [];
  const readRows = Array.isArray(readResult.data) ? readResult.data : [];
  const names = await loadDisplayNames(supabase, [
    ...reactionRows.map((row) => row?.user_id),
    ...readRows.map((row) => row?.user_id),
  ]);

  for(const row of reactionRows){
    const messageId = normalizeSupportMessageId(row?.message_id);
    const reactingUserId = normalizeSupportUserId(row?.user_id);
    const reaction = normalizeSupportReaction(row?.reaction);
    const target = interactions[String(messageId)];
    if(!messageId || !reactingUserId || !reaction || !target) continue;
    target.reactions.counts[reaction] += 1;
    const name = names.get(reactingUserId) || aliasForUserId(reactingUserId);
    if(!target.reactions.users[reaction].includes(name)){
      target.reactions.users[reaction].push(name);
    }
    if(uid && reactingUserId === uid) target.reactions.mine = reaction;
  }

  const readerIdsByMessage = new Map();
  for(const row of readRows){
    const messageId = normalizeSupportMessageId(row?.message_id);
    const readerId = normalizeSupportUserId(row?.user_id);
    const target = interactions[String(messageId)];
    if(!messageId || !readerId || !target) continue;
    if(!readerIdsByMessage.has(messageId)) readerIdsByMessage.set(messageId, new Set());
    const seen = readerIdsByMessage.get(messageId);
    if(seen.has(readerId)) continue;
    seen.add(readerId);
    target.readers.push({
      name: names.get(readerId) || aliasForUserId(readerId),
      read_at: row?.read_at || null,
    });
  }

  for(const target of Object.values(interactions)){
    target.read_count = target.readers.length;
  }
  return { available:true, interactions };
}

export async function markSupportMessagesRead(supabase, messageRows, userId){
  const uid = normalizeSupportUserId(userId);
  if(!uid) return 0;
  const now = new Date().toISOString();
  const payload = [];
  const seen = new Set();
  for(const raw of messageRows || []){
    const row = normalizeMessageRow(raw);
    if(!row.id || row.sender_id === uid || seen.has(row.id)) continue;
    seen.add(row.id);
    payload.push({ message_id:row.id, user_id:uid, read_at:now });
  }
  if(!payload.length) return 0;
  const { error } = await supabase
    .from("support_message_reads")
    .upsert(payload, { onConflict:"message_id,user_id" });
  if(error) throw error;
  return payload.length;
}

export async function toggleSupportMessageReaction(supabase, messageId, userId, reaction){
  const id = normalizeSupportMessageId(messageId);
  const uid = normalizeSupportUserId(userId);
  const key = normalizeSupportReaction(reaction);
  if(!id || !uid || !key) throw new Error("Invalid support reaction.");

  const existing = await supabase
    .from("support_message_reactions")
    .select("id,reaction")
    .eq("message_id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if(existing.error && existing.error.code !== "PGRST116") throw existing.error;

  if(existing.data?.id && normalizeSupportReaction(existing.data.reaction) === key){
    const removed = await supabase
      .from("support_message_reactions")
      .delete()
      .eq("id", existing.data.id);
    if(removed.error) throw removed.error;
    return "";
  }

  const saved = await supabase
    .from("support_message_reactions")
    .upsert({
      message_id:id,
      user_id:uid,
      reaction:key,
      updated_at:new Date().toISOString(),
    }, { onConflict:"message_id,user_id" });
  if(saved.error) throw saved.error;
  return key;
}
