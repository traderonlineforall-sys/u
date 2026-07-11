import crypto, { randomUUID } from "node:crypto";
import { signSession, verifySession } from "../session.js";
import { cleanNickname, isMissingTableOrColumn, normalizeUserId } from "./nickname.js";

const TABLE = "support_device_recovery_tickets";
const RECOVERY_TICKET_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_CHOICES = 3;
const MIN_CHOICES = 2;
const LOGIN_ATTEMPT_COOKIE_NAME = "__Host-srloginctx";

function safeDecodeCookieValue(value) {
  try { return decodeURIComponent(value || ""); }
  catch { return value || ""; }
}

function parseCookies(cookieHeader) {
  const out = {};
  for (const part of String(cookieHeader || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) out[key] = safeDecodeCookieValue(rest.join("=") || "");
  }
  return out;
}

function hmac(secret, label, value) {
  return crypto.createHmac("sha256", String(secret || "")).update(`${label}|${String(value || "")}`).digest("hex");
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function recoveryBinding(fp, secret) {
  const value = String(fp?.recovery_binding_hash || fp?.device_hash || "").trim();
  return value && secret ? hmac(secret, "recovery-context-v3", value) : "";
}

function parseChoices(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

function safeDecisionId(value) {
  const id = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

export function getRecoveryAttemptCookieName() {
  return LOGIN_ATTEMPT_COOKIE_NAME;
}

export function setRecoveryAttemptCookie(response, token) {
  response.cookies.set({
    name: LOGIN_ATTEMPT_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: Math.ceil(RECOVERY_TICKET_MAX_AGE_MS / 1000),
  });
  return response;
}

export function clearRecoveryAttemptCookie(response) {
  response.cookies.set({
    name: LOGIN_ATTEMPT_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function createDeviceRecoveryTicket(supabase, fp, suggestions, secret, options = {}) {
  const normalizedSecret = String(secret || "");
  const binding = recoveryBinding(fp, normalizedSecret);
  if (!binding || normalizedSecret.length < 32) return { ok: false, error: "Could not create a secure recovery ticket." };

  const publicChoices = [];
  const storedChoices = [];
  const seenUsers = new Set();
  const seenNames = new Set();
  for (const item of Array.isArray(suggestions) ? suggestions.slice(0, MAX_CHOICES) : []) {
    const uid = normalizeUserId(item?.user_id);
    const displayName = cleanNickname(item?.display_name || "");
    const displayKey = displayName.toLocaleLowerCase("ar-EG").replace(/\s+/g, " ");
    const score = Math.max(0, Math.min(100, Math.round(Number(item?.score || 0))));
    if (!uid || !displayName || score < 80 || seenUsers.has(uid) || seenNames.has(displayKey)) continue;
    seenUsers.add(uid);
    seenNames.add(displayKey);
    const choiceId = randomUUID();
    storedChoices.push({
      choice_id: choiceId,
      user_id: uid,
      minimum_score: Math.max(80, score - 4),
    });
    // The browser receives only an opaque choice and presentation text.
    publicChoices.push({ choice_id: choiceId, display_name: displayName });
  }

  if (storedChoices.length < MIN_CHOICES) {
    return { ok: false, insufficient_choices: true, error: "No safe recovery choices are available." };
  }

  const ticketId = randomUUID();
  const attemptId = randomUUID();
  const nonce = randomUUID();
  const contextSecret = randomUUID();
  const expiresAt = new Date(Date.now() + RECOVERY_TICKET_MAX_AGE_MS).toISOString();
  const inserted = await supabase.from(TABLE).insert({
    ticket_id: ticketId,
    attempt_id: attemptId,
    parent_decision_id: safeDecisionId(options.parentDecisionId),
    nonce_hash: hmac(normalizedSecret, "recovery-nonce-v3", nonce),
    context_hash: hmac(normalizedSecret, "login-context-v3", contextSecret),
    fingerprint_context_hash: binding,
    choices: storedChoices,
    expires_at: expiresAt,
  });
  if (inserted.error) {
    if (isMissingTableOrColumn(inserted.error)) {
      return { ok: false, status: 503, missing_migration: true, error: "Recovery ticket migration is required." };
    }
    return { ok: false, status: 503, error: "Could not create a secure recovery ticket." };
  }

  const exp = Date.now() + RECOVERY_TICKET_MAX_AGE_MS;
  const token = await signSession({
    role: "device_recovery_ticket",
    purpose: "nickname_selection",
    version: 3,
    tid: ticketId,
    aid: attemptId,
    nonce,
    exp,
  }, normalizedSecret);
  const attemptToken = await signSession({
    role: "device_login_attempt",
    purpose: "nickname_selection",
    version: 3,
    aid: attemptId,
    ctx: contextSecret,
    exp,
  }, normalizedSecret);

  return { ok: true, token, attempt_token: attemptToken, choices: publicChoices, attempt_id: attemptId };
}

export async function verifyDeviceRecoveryTicket(req, supabase, token, choiceId, fp, secret) {
  const normalizedSecret = String(secret || "");
  if (normalizedSecret.length < 32) {
    return { ok: false, status: 503, error: "Recovery ticket signing is not configured." };
  }
  const verified = await verifySession(String(token || ""), normalizedSecret);
  if (
    !verified.ok ||
    verified.payload?.role !== "device_recovery_ticket" ||
    verified.payload?.purpose !== "nickname_selection" ||
    Number(verified.payload?.version || 0) !== 3
  ) {
    return { ok: false, status: 409, error: "انتهت جلسة الاختيار. أعد تسجيل الدخول." };
  }

  const cookies = parseCookies(req.headers.get("cookie") || "");
  const attempt = await verifySession(cookies[LOGIN_ATTEMPT_COOKIE_NAME] || "", normalizedSecret);
  if (
    !attempt.ok ||
    attempt.payload?.role !== "device_login_attempt" ||
    attempt.payload?.purpose !== "nickname_selection" ||
    Number(attempt.payload?.version || 0) !== 3 ||
    attempt.payload?.aid !== verified.payload?.aid
  ) {
    return { ok: false, status: 409, error: "انتهت جلسة الاختيار. أعد تسجيل الدخول." };
  }

  const res = await supabase
    .from(TABLE)
    .select("ticket_id,attempt_id,parent_decision_id,nonce_hash,context_hash,fingerprint_context_hash,choices,expires_at,used_at,cancelled_at")
    .eq("ticket_id", String(verified.payload?.tid || ""))
    .eq("attempt_id", String(verified.payload?.aid || ""))
    .limit(1);
  if (res.error) {
    if (isMissingTableOrColumn(res.error)) return { ok: false, status: 503, error: "Recovery ticket migration is required." };
    return { ok: false, status: 503, error: "Could not validate recovery ticket." };
  }
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row || row.used_at || row.cancelled_at || Date.parse(row.expires_at || "") <= Date.now()) {
    return { ok: false, status: 409, error: "انتهت جلسة الاختيار. أعد تسجيل الدخول." };
  }

  const expectedNonce = hmac(normalizedSecret, "recovery-nonce-v3", verified.payload?.nonce || "");
  const expectedContext = hmac(normalizedSecret, "login-context-v3", attempt.payload?.ctx || "");
  const expectedFingerprint = recoveryBinding(fp, normalizedSecret);
  if (
    !timingSafeEqual(row.nonce_hash, expectedNonce) ||
    !timingSafeEqual(row.context_hash, expectedContext) ||
    !expectedFingerprint
  ) {
    return { ok: false, status: 409, error: "تعذر التحقق من سياق الاختيار. أعد تسجيل الدخول." };
  }

  // Device characteristics are mutable risk context, not the ticket's bearer
  // proof. A changed context is carried forward for audit while the server
  // recomputes the candidate ranking; it is never used as a brittle equality
  // gate and never replaces the HttpOnly attempt secret.
  const contextChanged = row.fingerprint_context_hash !== expectedFingerprint;

  const id = String(choiceId || "").trim();
  const selected = parseChoices(row.choices).find((item) => String(item?.choice_id || "") === id);
  const userId = normalizeUserId(selected?.user_id);
  if (!userId) return { ok: false, status: 409, error: "اختيار غير صالح أو منتهي." };

  return {
    ok: true,
    ticket_id: String(row.ticket_id),
    attempt_id: String(row.attempt_id),
    nonce_hash: expectedNonce,
    choice_id: id,
    user_id: userId,
    minimum_score: Math.max(80, Number(selected?.minimum_score || 80)),
    context_changed: contextChanged,
    parent_decision_id: safeDecisionId(row.parent_decision_id),
  };
}

export async function consumeDeviceRecoveryTicket(supabase, ticket) {
  const res = await supabase.rpc("sr_consume_device_recovery_ticket", {
    p_ticket_id: ticket.ticket_id,
    p_attempt_id: ticket.attempt_id,
    p_nonce_hash: ticket.nonce_hash,
    p_choice_id: ticket.choice_id,
  });
  if (res.error) {
    if (isMissingTableOrColumn(res.error) || /sr_consume_device_recovery_ticket/i.test(String(res.error.message || ""))) {
      return { ok: false, status: 503, error: "Recovery ticket migration is required." };
    }
    return { ok: false, status: 409, error: "اختيار غير صالح أو مستخدم من قبل." };
  }
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  const userId = normalizeUserId(row?.selected_user_id || row?.user_id);
  if (!userId || userId !== normalizeUserId(ticket.user_id)) {
    return { ok: false, status: 409, error: "اختيار غير صالح أو مستخدم من قبل." };
  }
  return { ok: true, user_id: userId };
}

export async function cancelDeviceRecoveryAttempt(req, supabase, secret) {
  const cookies = parseCookies(req.headers.get("cookie") || "");
  const attemptToken = cookies[LOGIN_ATTEMPT_COOKIE_NAME] || "";
  if (!attemptToken) return { ok: true, skipped: true };
  const normalizedSecret = String(secret || "");
  if (normalizedSecret.length < 32) return { ok: false, status: 503, error: "Recovery ticket signing is not configured." };
  const attempt = await verifySession(attemptToken, normalizedSecret);
  if (
    !attempt.ok ||
    attempt.payload?.role !== "device_login_attempt" ||
    attempt.payload?.purpose !== "nickname_selection" ||
    Number(attempt.payload?.version || 0) !== 3 ||
    !attempt.payload?.aid
  ) {
    return { ok: true, skipped: true };
  }
  const res = await supabase
    .from(TABLE)
    .update({ cancelled_at: new Date().toISOString() })
    .eq("attempt_id", String(attempt.payload.aid))
    .is("used_at", null)
    .is("cancelled_at", null);
  if (res.error) {
    return { ok: false, status: 503, error: isMissingTableOrColumn(res.error)
      ? "Recovery ticket migration is required."
      : "Could not cancel recovery attempt." };
  }
  return { ok: true };
}
