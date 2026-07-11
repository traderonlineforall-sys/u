import { randomUUID } from "node:crypto";
import { isMissingTableOrColumn, normalizeUserId } from "./nickname.js";
import {
  DEVICE_IDENTITY_ALGORITHM_VERSION,
  DEVICE_IDENTITY_POLICY_VERSION,
} from "./device-policy.js";

function clean(value, max = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeUuid(value) {
  const v = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : null;
}

export function newDecisionId() {
  return randomUUID();
}

export async function logDeviceDecision(supabase, input = {}) {
  const decisionId = safeUuid(input.decision_id) || randomUUID();
  const payload = {
    decision_id: decisionId,
    device_id: safeUuid(input.device_id),
    user_id: normalizeUserId(input.user_id) || null,
    decision_type: clean(input.decision_type, 48),
    decision_source: clean(input.decision_source, 80),
    truth_level: clean(input.truth_level, 64) || "unverified",
    evidence_groups: Array.isArray(input.evidence_groups)
      ? input.evidence_groups.map((v) => clean(v, 48)).filter(Boolean).slice(0, 12)
      : [],
    evidence_lineage: input.evidence_lineage && typeof input.evidence_lineage === "object"
      ? input.evidence_lineage
      : {},
    parent_decision_id: safeUuid(input.parent_decision_id),
    automatic: input.automatic === true,
    executed: input.executed === true,
    can_strengthen: input.can_strengthen === true,
    shadow_only: input.shadow_only === true,
    conflict: input.conflict === true,
    rejection_code: clean(input.rejection_code, 80) || null,
    evidence_group_count: Math.max(0, Math.min(50, Number(input.evidence_group_count || 0))),
    score_margin: Number.isFinite(Number(input.score_margin)) ? Number(input.score_margin) : null,
    algorithm_version: clean(input.algorithm_version, 32) || DEVICE_IDENTITY_ALGORITHM_VERSION,
    policy_version: clean(input.policy_version, 48) || DEVICE_IDENTITY_POLICY_VERSION,
  };

  const res = await supabase.from("support_device_identity_decisions").insert(payload);
  if (res.error) {
    if (isMissingTableOrColumn(res.error)) return { ok: true, missing_table: true, decision_id: decisionId };
    return { ok: false, error: res.error.message || "Could not write device decision audit." };
  }
  return { ok: true, decision_id: decisionId };
}

export async function markDeviceDecisionExecuted(supabase, decisionId) {
  const id = safeUuid(decisionId);
  if (!id) return { ok: false, error: "Invalid decision id." };
  const res = await supabase
    .from("support_device_identity_decisions")
    .update({ executed: true })
    .eq("decision_id", id)
    .eq("executed", false)
    .select("decision_id")
    .limit(1);
  if (res.error) {
    if (isMissingTableOrColumn(res.error)) return { ok: true, missing_table: true };
    return { ok: false, error: res.error.message || "Could not finalize device decision audit." };
  }
  if (!Array.isArray(res.data) || !res.data[0]) {
    return { ok: false, error: "Device decision was not finalized exactly once." };
  }
  return { ok: true };
}

export async function logDeviceObservation(supabase, input = {}) {
  const payload = {
    observation_id: safeUuid(input.observation_id) || randomUUID(),
    device_id: safeUuid(input.device_id),
    user_id: normalizeUserId(input.user_id) || null,
    source: clean(input.source, 80),
    truth_level: clean(input.truth_level, 64) || "unverified",
    evidence_groups: Array.isArray(input.evidence_groups)
      ? input.evidence_groups.map((v) => clean(v, 48)).filter(Boolean).slice(0, 12)
      : [],
    evidence_lineage: input.evidence_lineage && typeof input.evidence_lineage === "object"
      ? input.evidence_lineage
      : {},
    decision_id: safeUuid(input.decision_id),
    can_strengthen: input.can_strengthen === true,
    shadow_only: input.shadow_only === true,
    algorithm_version: clean(input.algorithm_version, 32) || DEVICE_IDENTITY_ALGORITHM_VERSION,
    policy_version: clean(input.policy_version, 48) || DEVICE_IDENTITY_POLICY_VERSION,
  };
  const res = await supabase.from("support_device_identity_observations").insert(payload);
  if (res.error) {
    if (isMissingTableOrColumn(res.error)) return { ok: true, missing_table: true };
    return { ok: false, error: res.error.message || "Could not write device observation audit." };
  }
  return { ok: true, observation_id: payload.observation_id };
}

export async function logDeviceConflict(supabase, input = {}) {
  const payload = {
    conflict_id: randomUUID(),
    device_id: safeUuid(input.device_id),
    credential_id: safeUuid(input.credential_id),
    expected_user_id: normalizeUserId(input.expected_user_id) || null,
    observed_user_id: normalizeUserId(input.observed_user_id) || null,
    conflict_code: clean(input.conflict_code, 80) || "device_owner_conflict",
    context: input.context && typeof input.context === "object" ? input.context : {},
  };
  const res = await supabase.from("support_device_identity_conflicts").insert(payload);
  if (res.error) {
    if (isMissingTableOrColumn(res.error)) return { ok: true, missing_table: true };
    return { ok: false, error: res.error.message || "Could not write device conflict audit." };
  }
  return { ok: true, conflict_id: payload.conflict_id };
}
