import { NextResponse } from "next/server";
import { enforceSameOrigin, noStore, readSignedUserSession } from "../../../lib/server/auth.js";
import { getCookieName } from "../../../lib/session.js";
import { getServiceSupabase } from "../../../lib/server/admin.js";
import { revokeUserSession } from "../../../lib/server/session-registry.js";
import { cancelDeviceRecoveryAttempt, clearRecoveryAttemptCookie } from "../../../lib/server/device-recovery.js";

function j(body, init) { return noStore(NextResponse.json(body, init)); }

function clearLogoutCookies(response) {
  response.cookies.set({
    name: getCookieName(),
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return clearRecoveryAttemptCookie(response);
}

export const runtime = "nodejs";

export async function POST(request) {
  const so = enforceSameOrigin(request);
  if (!so.ok) return j({ error: so.error }, { status: so.status || 403 });

  // Logout revokes the current application session and any pending recovery
  // context, but deliberately preserves the trusted-device credential. The
  // credential is consulted only after the shared username/password are typed
  // again; it never causes a silent post-logout login.
  let cleanupError = "";
  try {
    const supabase = getServiceSupabase();
    const session = await readSignedUserSession(request);
    if (session.ok) {
      const revoked = await revokeUserSession(supabase, session.payload);
      if (!revoked.ok) cleanupError = revoked.error || "Could not revoke authenticated session.";
    } else if (Number(session.status || 0) >= 500) {
      cleanupError = session.error || "Could not validate authenticated session.";
    }
    const cancelled = await cancelDeviceRecoveryAttempt(request, supabase, process.env.SESSION_SECRET || "");
    if (!cancelled.ok) cleanupError ||= cancelled.error || "Could not cancel recovery attempt.";
  } catch {
    cleanupError = "Could not complete server-side logout.";
  }

  // Always end the browser-local session. If server-side revocation failed,
  // return an explicit failure instead of claiming that logout fully succeeded.
  return clearLogoutCookies(j(
    cleanupError ? { ok: false, local_logout: true, error: cleanupError } : { ok: true },
    cleanupError ? { status: 503 } : undefined
  ));
}
