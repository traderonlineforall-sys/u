import crypto from "node:crypto";
import { isMissingTableOrColumn } from "./nickname.js";

function secret() {
  const value = String(process.env.RATE_LIMIT_SECRET || process.env.SESSION_SECRET || "");
  return value.length >= 32 ? value : "";
}

export function rateLimitKey(scope, parts = []) {
  const key = secret();
  if (!key) return "";
  const normalized = (Array.isArray(parts) ? parts : [parts])
    .map((value) => String(value || "").trim().slice(0, 240))
    .join("|");
  return crypto.createHmac("sha256", key).update(`${scope}|${normalized}`).digest("hex");
}

/**
 * Distributed, atomic limiter backed by Postgres. There is deliberately no
 * process-local fallback: a Map would be bypassable across Cloudflare isolates.
 */
export async function takeRateLimit(supabase, options = {}) {
  const scope = String(options.scope || "auth").replace(/[^a-z0-9_.:-]/gi, "").slice(0, 64);
  const keyHash = rateLimitKey(scope, options.keyParts || []);
  if (!scope || !keyHash) {
    return { ok: false, status: 503, error: "Distributed rate limiting is not configured." };
  }

  const limit = Math.max(1, Math.min(10000, Number(options.limit || 10)));
  const windowSeconds = Math.max(1, Math.min(86400, Number(options.windowSeconds || 600)));
  const cost = Math.max(1, Math.min(limit, Number(options.cost || 1)));
  const res = await supabase.rpc("sr_auth_rate_limit_take", {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
    p_cost: cost,
  });

  if (res.error) {
    if (isMissingTableOrColumn(res.error) || /sr_auth_rate_limit_take/i.test(String(res.error.message || ""))) {
      return { ok: false, status: 503, missing_migration: true, error: "Distributed rate limiting migration is required." };
    }
    return { ok: false, status: 503, error: "Rate limit service is temporarily unavailable." };
  }

  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  const allowed = row?.allowed === true;
  return {
    ok: true,
    allowed,
    remaining: Math.max(0, Number(row?.remaining || 0)),
    retry_after_seconds: Math.max(1, Number(row?.retry_after_seconds || windowSeconds)),
  };
}
