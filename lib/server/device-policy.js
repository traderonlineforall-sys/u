export const DEVICE_DECISIONS = Object.freeze({
  AUTO_LOGIN_VERIFIED: "AUTO_LOGIN_VERIFIED",
  AUTO_LOGIN_RECOVERED: "AUTO_LOGIN_RECOVERED",
  SELECTION_REQUIRED: "SELECTION_REQUIRED",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  CONFLICTED: "CONFLICTED",
  REJECTED: "REJECTED",
  NEW_DEVICE: "NEW_DEVICE",
});

export const DEVICE_IDENTITY_POLICY_VERSION = "primary-owner-v3";
export const DEVICE_IDENTITY_ALGORITHM_VERSION = "3.0";

const MODES = new Set(["off", "shadow", "verified_only", "full"]);

export function getDeviceIdentityMode(value = process.env.DEVICE_IDENTITY_V2_MODE) {
  const mode = String(value || "verified_only").trim().toLowerCase();
  return MODES.has(mode) ? mode : "verified_only";
}

export function recoveredAutoLoginEnabled(value = process.env.DEVICE_RECOVERED_AUTO_LOGIN_ENABLED) {
  return String(value || "false").trim().toLowerCase() === "true";
}

/**
 * Central policy gate. Browser/fleet characteristics can produce suggestions,
 * but can never become an automatic identity without independent credential
 * continuation. This function intentionally has no database or framework
 * dependency so its security invariants can be unit-tested directly.
 */
export function decideDeviceIdentity(input = {}) {
  const mode = getDeviceIdentityMode(input.mode);
  const suggestions = Math.max(0, Math.min(3, Number(input.suggestionCount || 0)));
  const independentGroups = Math.max(0, Number(input.independentCredentialGroups || 0));

  if (input.conflicted) {
    return { decision: DEVICE_DECISIONS.CONFLICTED, execute: false, canStrengthen: false };
  }
  if (input.revoked || input.rejected) {
    return { decision: DEVICE_DECISIONS.REJECTED, execute: false, canStrengthen: false };
  }
  if (input.verifiedCredential) {
    return {
      decision: DEVICE_DECISIONS.AUTO_LOGIN_VERIFIED,
      execute: true,
      canStrengthen: ownerStateCanStrengthen(input.ownerState),
    };
  }
  if (input.credentialContinuation) {
    return {
      decision: DEVICE_DECISIONS.AUTO_LOGIN_RECOVERED,
      execute: true,
      canStrengthen: ownerStateCanStrengthen(input.ownerState),
    };
  }

  const probabilisticRecoveryAllowed =
    mode === "full" &&
    input.recoveredAutoEnabled === true &&
    input.probabilisticCandidate === true &&
    independentGroups >= 2 &&
    Number(input.recoveryScore || 0) >= 98 &&
    Number(input.recoveryMargin || 0) >= 18 &&
    Number(input.stableContradictions || 0) === 0 &&
    input.hasConfirmedHistory === true &&
    input.circularEvidence === false;

  if (probabilisticRecoveryAllowed) {
    return { decision: DEVICE_DECISIONS.AUTO_LOGIN_RECOVERED, execute: true, canStrengthen: false };
  }

  if ((mode === "verified_only" || mode === "full") && suggestions >= 2) {
    return { decision: DEVICE_DECISIONS.SELECTION_REQUIRED, execute: false, canStrengthen: false };
  }
  if (input.newDevice) {
    return { decision: DEVICE_DECISIONS.NEW_DEVICE, execute: false, canStrengthen: false };
  }
  return { decision: DEVICE_DECISIONS.INSUFFICIENT_EVIDENCE, execute: false, canStrengthen: false };
}

export function ownerStateCanStrengthen(ownerState) {
  return ["verified_device_owner", "promoted_after_independent_confirmation"]
    .includes(String(ownerState || ""));
}

export function mayPromoteOwnerState(currentState, source) {
  if (currentState === "verified_device_owner") return false;
  return source === "independent_admin_confirmation" || source === "managed_device_attestation";
}
