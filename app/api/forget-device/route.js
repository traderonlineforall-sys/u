import { NextResponse } from "next/server";
import { enforceSameOrigin, noStore, requireUserSession } from "../../../lib/server/auth.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { getCookieName } from "../../../lib/session.js";
import {
  clearTrustedDeviceCookie,
  forgetTrustedDevice,
} from "../../../lib/server/device-identity.js";
import {
  cancelDeviceRecoveryAttempt,
  clearRecoveryAttemptCookie,
} from "../../../lib/server/device-recovery.js";
import { takeRateLimit } from "../../../lib/server/rate-limit.js";
import { revokeUserSession } from "../../../lib/server/session-registry.js";

export const runtime = "nodejs";

function j(body, init) {
  return noStore(NextResponse.json(body, init));
}

export async function POST(request) {
  const sameOrigin = enforceSameOrigin(request);
  if (!sameOrigin.ok) return j({ error: sameOrigin.error }, { status: sameOrigin.status || 403 });
  const session = await requireUserSession(request);
  if (!session.ok) return j({ error: session.error }, { status: session.status || 401 });

  const supabase = getServiceSupabase();
  const limited = await takeRateLimit(supabase, {
    scope: "forget_device",
    keyParts: [session.payload.uid],
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (!limited.ok) return j({ error: limited.error }, { status: limited.status || 503 });
  if (!limited.allowed) return j({ error: "Too many requests. Try again later." }, { status: 429 });

  const forgotten = await forgetTrustedDevice(request, supabase, session.payload);
  if (!forgotten.ok) return j({ error: forgotten.error || "Could not forget this device." }, { status: forgotten.status || 503 });

  const revoked = await revokeUserSession(supabase, session.payload);
  const cancelled = await cancelDeviceRecoveryAttempt(request, supabase, process.env.SESSION_SECRET || "");

  const cleanupOk = revoked.ok && cancelled.ok;
  let response = j(cleanupOk
    ? { ok: true, clear_browser_device_secret: true }
    : { ok: false, device_forgotten: true, error: "Device was forgotten, but session cleanup was incomplete." },
  cleanupOk ? undefined : { status: 503 });
  response.cookies.set({
    name: getCookieName(),
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response = clearRecoveryAttemptCookie(response);
  response = clearTrustedDeviceCookie(response);
  return response;
}
