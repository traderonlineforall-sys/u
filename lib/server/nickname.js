const MAX_NICKNAME_LENGTH = 40;

export function normalizeUserId(value){
  const s = String(value || "").trim().slice(0, 160);
  return /^[a-zA-Z0-9_.:\-]{8,160}$/.test(s) ? s : "";
}

export function cleanNickname(value){
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NICKNAME_LENGTH);
}

export function validateNickname(value){
  const displayName = cleanNickname(value);
  if(displayName.length < 2){
    return { ok:false, error:"اكتب كنية خيالية من حرفين على الأقل." };
  }
  if(displayName.length > MAX_NICKNAME_LENGTH){
    return { ok:false, error:`الكنية يجب ألا تزيد عن ${MAX_NICKNAME_LENGTH} حرف.` };
  }
  if(/[<>\\{}[\]`]/.test(displayName)){
    return { ok:false, error:"الكنية تحتوي على رموز غير مسموحة." };
  }
  if(/@/.test(displayName) || /https?:\/\//i.test(displayName)){
    return { ok:false, error:"لا تكتب بريد إلكتروني أو رابط. اكتب كنية خيالية فقط." };
  }
  if(/\+?\d[\d\s().-]{7,}/.test(displayName)){
    return { ok:false, error:"لا تكتب رقم تليفون. اكتب كنية خيالية فقط." };
  }
  return { ok:true, display_name:displayName };
}

export function aliasForUserId(uid = ""){
  const s = String(uid || "");
  if(!s) return "User";
  let h = 0;
  for(let i=0; i<s.length; i+=1){
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  const n = (Math.abs(h) % 9000) + 1000;
  return `User-${n}`;
}

export function isMissingTableOrColumn(error){
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || /Could not find|does not exist|column .* does not exist|schema cache/i.test(msg);
}

function isMissingResetColumn(error){
  const msg = String(error?.message || "");
  return isMissingTableOrColumn(error) && /nickname_reset_required|nickname_locked|updated_at|created_at/i.test(msg);
}

async function selectProfileWithReset(supabase, userId){
  return supabase
    .from("support_users")
    .select("user_id, display_name, nickname_reset_required")
    .eq("user_id", userId)
    .limit(1);
}

async function selectProfileLegacy(supabase, userId){
  return supabase
    .from("support_users")
    .select("user_id, display_name")
    .eq("user_id", userId)
    .limit(1);
}

export async function getNicknameProfile(supabase, userId){
  const uid = normalizeUserId(userId);
  if(!uid) return { ok:false, status:400, error:"Missing user id." };

  try{
    let res = await selectProfileWithReset(supabase, uid);
    let supportsReset = true;

    if(res.error && isMissingResetColumn(res.error)){
      res = await selectProfileLegacy(supabase, uid);
      supportsReset = false;
    }

    if(res.error){
      if(isMissingTableOrColumn(res.error)){
        return { ok:true, missing_table:true, exists:false, display_name:"", needsNickname:true, supportsReset:false };
      }
      return { ok:false, status:500, error:res.error.message || "Could not read nickname profile." };
    }

    const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
    const displayName = cleanNickname(row?.display_name || "");
    const resetRequired = supportsReset ? !!row?.nickname_reset_required : false;

    return {
      ok:true,
      exists:!!row,
      user_id:uid,
      display_name:displayName,
      reset_required:resetRequired,
      needsNickname:!displayName || resetRequired,
      supportsReset,
    };
  }catch(err){
    return { ok:false, status:500, error:String(err?.message || err || "Could not read nickname profile.") };
  }
}

async function upsertNicknameFull(supabase, userId, displayName){
  return supabase
    .from("support_users")
    .upsert({
      user_id:userId,
      display_name:displayName,
      nickname_reset_required:false,
      nickname_locked:true,
      updated_at:new Date().toISOString(),
    }, { onConflict:"user_id" })
    .select("user_id, display_name, nickname_reset_required")
    .limit(1);
}

async function upsertNicknameLegacy(supabase, userId, displayName){
  return supabase
    .from("support_users")
    .upsert({ user_id:userId, display_name:displayName }, { onConflict:"user_id" })
    .select("user_id, display_name")
    .limit(1);
}

export async function ensureNicknameForUser(supabase, userId, requestedNickname){
  const uid = normalizeUserId(userId);
  if(!uid) return { ok:false, status:400, error:"Missing user id." };

  const profile = await getNicknameProfile(supabase, uid);
  if(!profile.ok) return profile;

  if(profile.exists && profile.display_name && !profile.reset_required){
    return { ok:true, user_id:uid, display_name:profile.display_name, existing:true, needsNickname:false };
  }

  const validation = validateNickname(requestedNickname);
  if(!validation.ok){
    return {
      ok:false,
      status:409,
      nickname_required:true,
      error:validation.error,
      user_id:uid,
    };
  }

  const displayName = validation.display_name;

  if(profile.missing_table){
    // Compatibility mode before SQL is applied. Login still works, but Step 4 is
    // not fully enforced until SUPABASE_NICKNAME_IDENTITY_STEP4.sql is run.
    return { ok:true, user_id:uid, display_name:displayName, compatibility:true, needsNickname:false };
  }

  try{
    let res = await upsertNicknameFull(supabase, uid, displayName);
    if(res.error && isMissingResetColumn(res.error)){
      res = await upsertNicknameLegacy(supabase, uid, displayName);
    }
    if(res.error){
      return { ok:false, status:500, error:res.error.message || "Could not save nickname." };
    }
    const saved = Array.isArray(res.data) && res.data[0] ? cleanNickname(res.data[0].display_name) : displayName;
    return { ok:true, user_id:uid, display_name:saved || displayName, saved:true, needsNickname:false };
  }catch(err){
    return { ok:false, status:500, error:String(err?.message || err || "Could not save nickname.") };
  }
}

export async function requireActiveNickname(supabase, userId, fallbackNickname = ""){
  const uid = normalizeUserId(userId);
  if(!uid) return { ok:false, status:400, error:"Missing user id." };

  const profile = await getNicknameProfile(supabase, uid);
  if(!profile.ok) return profile;

  if(profile.exists && profile.display_name && !profile.reset_required){
    return { ok:true, user_id:uid, display_name:profile.display_name };
  }

  if(profile.missing_table){
    const validation = validateNickname(fallbackNickname);
    return { ok:true, user_id:uid, display_name:validation.ok ? validation.display_name : aliasForUserId(uid), compatibility:true };
  }

  return {
    ok:false,
    status:409,
    nickname_required:true,
    error:"يجب اختيار كنية خيالية من صفحة تسجيل الدخول قبل استخدام هذه العملية.",
    user_id:uid,
  };
}

export async function resetNicknameForUser(supabase, userId){
  const uid = normalizeUserId(userId);
  if(!uid) return { ok:false, status:400, error:"Missing user_id." };

  try{
    let res = await supabase
      .from("support_users")
      .update({ display_name:"", nickname_reset_required:true, updated_at:new Date().toISOString() })
      .eq("user_id", uid);

    if(res.error && isMissingResetColumn(res.error)){
      // Legacy fallback: old schema has no reset flag, so delete the row.
      res = await supabase.from("support_users").delete().eq("user_id", uid);
    }

    if(res.error){
      if(isMissingTableOrColumn(res.error)) return { ok:true, missing_table:true };
      return { ok:false, status:500, error:res.error.message || "Could not reset nickname." };
    }
    return { ok:true, user_id:uid };
  }catch(err){
    return { ok:false, status:500, error:String(err?.message || err || "Could not reset nickname.") };
  }
}
