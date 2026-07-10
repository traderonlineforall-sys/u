import { NextResponse } from "next/server";
import { enforceSameOrigin, requireUserSession, noStore } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import {
  isMissingSupportInteractionSchema,
  loadAccessibleSupportMessages,
  loadSupportInteractions,
  markSupportMessagesRead,
  normalizeSupportMessageId,
  normalizeSupportMessageIds,
  normalizeSupportReaction,
  normalizeSupportUserId,
  toggleSupportMessageReaction,
} from "../../../lib/server/support-interactions.js";

function j(body, init){
  return noStore(NextResponse.json(body, init));
}

export async function POST(req){
  const sameOrigin = enforceSameOrigin(req);
  if(!sameOrigin.ok) return j({ error:sameOrigin.error }, { status:sameOrigin.status || 403 });

  const session = await requireUserSession(req);
  if(!session.ok) return j({ error:session.error }, { status:session.status || 401 });

  const userId = normalizeSupportUserId(session.payload?.uid);
  if(!userId) return j({ error:"Missing authenticated user identity." }, { status:401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "list").trim().toLowerCase();
  const supabase = getServiceSupabase();

  try{
    if(action === "list" || action === "read"){
      const ids = normalizeSupportMessageIds(body?.message_ids);
      if(!ids.length) return j({ ok:true, available:true, interactions:{}, marked:0 });
      const rows = await loadAccessibleSupportMessages(supabase, ids, userId);

      if(action === "read"){
        const marked = await markSupportMessagesRead(supabase, rows, userId);
        return j({ ok:true, available:true, marked });
      }

      const result = await loadSupportInteractions(supabase, rows, userId);
      return j({ ok:true, ...result });
    }

    if(action === "toggle"){
      const messageId = normalizeSupportMessageId(body?.message_id);
      const reaction = normalizeSupportReaction(body?.reaction);
      if(!messageId || !reaction){
        return j({ error:"Invalid message reaction." }, { status:400 });
      }
      const rows = await loadAccessibleSupportMessages(supabase, [messageId], userId);
      if(!rows.length) return j({ error:"Message not found." }, { status:404 });

      await toggleSupportMessageReaction(supabase, messageId, userId, reaction);
      const result = await loadSupportInteractions(supabase, rows, userId);
      return j({ ok:true, ...result });
    }

    return j({ error:"Unknown action." }, { status:400 });
  }catch(error){
    if(isMissingSupportInteractionSchema(error)){
      return j({
        ok:true,
        available:false,
        missing_table:true,
        interactions:{},
        error:"Support interaction tables are not configured.",
      });
    }
    return j({ error:String(error?.message || "Support interaction failed.") }, { status:500 });
  }
}
