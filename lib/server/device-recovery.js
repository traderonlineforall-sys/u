import { randomUUID } from "node:crypto";
import { signSession, verifySession } from "../session.js";
import { normalizeUserId } from "./nickname.js";

const RECOVERY_TICKET_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_CHOICES = 3;

function timingSafeEqual(a, b){
  const enc = new TextEncoder();
  const aa = enc.encode(String(a || ""));
  const bb = enc.encode(String(b || ""));
  const max = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for(let i = 0; i < max; i += 1) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}

function recoveryBinding(fp){
  return String(fp?.recovery_binding_hash || fp?.device_hash || "").trim();
}

export async function createDeviceRecoveryTicket(fp, suggestions, secret){
  const binding = recoveryBinding(fp);
  const normalizedSecret = String(secret || "");
  if(!binding || !normalizedSecret) return { ok:false, error:"Could not create a secure recovery ticket." };

  const publicChoices = [];
  const signedChoices = [];
  for(const item of Array.isArray(suggestions) ? suggestions.slice(0, MAX_CHOICES) : []){
    const uid = normalizeUserId(item?.user_id);
    const displayName = String(item?.display_name || "").trim().slice(0, 40);
    if(!uid || !displayName) continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(item?.score || 0))));
    if(score < 80) continue;
    const choiceId = randomUUID();
    signedChoices.push({
      id:choiceId,
      uid,
      minimum_score:Math.max(80, score - 4),
    });
    publicChoices.push({
      choice_id:choiceId,
      display_name:displayName,
      confidence:score,
      evidence_level:Number(item?.strong_groups || 0) >= 3 ? "strong" : "possible",
    });
  }

  if(!signedChoices.length) return { ok:false, error:"No secure recovery choices are available." };

  const token = await signSession({
    role:"device_recovery_choice",
    bind:binding,
    choices:signedChoices,
    jti:randomUUID(),
    exp:Date.now() + RECOVERY_TICKET_MAX_AGE_MS,
  }, normalizedSecret);

  return { ok:true, token, choices:publicChoices };
}

export async function verifyDeviceRecoveryTicket(token, choiceId, fp, secret){
  const verified = await verifySession(String(token || ""), String(secret || ""));
  if(!verified.ok || verified.payload?.role !== "device_recovery_choice"){
    return { ok:false, status:409, error:"انتهت جلسة اختيار الكنية. حاول تسجيل الدخول مرة أخرى." };
  }

  const binding = recoveryBinding(fp);
  if(!binding || !timingSafeEqual(verified.payload?.bind, binding)){
    return { ok:false, status:409, error:"تغيّرت بصمة المتصفح أثناء الاسترجاع. حاول مرة أخرى من نفس النافذة." };
  }

  const id = String(choiceId || "").trim();
  const choices = Array.isArray(verified.payload?.choices) ? verified.payload.choices : [];
  const selected = choices.find((item)=>String(item?.id || "") === id);
  const uid = normalizeUserId(selected?.uid);
  if(!uid){
    return { ok:false, status:409, error:"اختيار الكنية غير صالح أو انتهت صلاحيته." };
  }

  return { ok:true, user_id:uid, minimum_score:Math.max(80, Number(selected?.minimum_score || 80)) };
}
