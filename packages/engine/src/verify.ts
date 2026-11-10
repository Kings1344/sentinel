/**
 * Off-chain mirror of the contract's `evaluate()` (contracts/sentinel-vault/src/lib.rs).
 * Used for previews, the Attack Lab simulation mode and explanations.
 * It is NEVER the authority: the deployed contract re-runs these checks before any funds move.
 * Check names, order and decision mapping must stay identical to the contract.
 */
import type { Agent, Capsule, Check, Decision, ReasonCode, TransferRequest } from "./types";
import { fmtNear } from "./units";

export const MAX_MEMO_LEN = 256;

export interface EvaluationInput {
  frozen: boolean;
  vaultBalance: bigint;
  agent: Agent;
  capsule: Capsule | null;
  request: TransferRequest;
  nowMs: bigint;
}

export interface Verdict {
  decision: Decision;
  reason: ReasonCode;
  explanation: string;
  checks: Check[];
}

export function evaluateRequest(input: EvaluationInput): Verdict {
  const { frozen, vaultBalance, agent, capsule, request, nowMs } = input;
  const checks: Check[] = [];
  let failure: { decision: Decision; reason: ReasonCode; detail: string } | null = null;
  const check = (name: string, passed: boolean, detail: string, decision: Decision, reason: ReasonCode) => {
    if (!passed && !failure) failure = { decision, reason, detail };
    checks.push({ name, passed, detail });
  };
  const finish = (): Verdict => {
    const f = failure as { decision: Decision; reason: ReasonCode; detail: string } | null;
    if (f) return { decision: f.decision, reason: f.reason, explanation: f.detail, checks };
    return {
      decision: "Approved",
      reason: "Authorized",
      explanation: `All ${checks.length} checks passed. Transfer of ${fmtNear(request.amount)} to ${request.recipient} is within capsule #${request.capsule_id}.`,
      checks,
    };
  };

  check("vault_active", !frozen, frozen ? "The vault is frozen by the owner. No transfers are released." : "Vault is not frozen.", "Blocked", "VaultFrozen");

  if (agent.status === "Active") {
    check("agent_active", true, `Agent ${agent.account_id} is active.`, "Blocked", "AgentSuspended");
  } else if (agent.status === "Revoked") {
    check("agent_active", false, `Agent ${agent.account_id} was revoked by the owner.`, "Revoked", "AgentRevoked");
  } else {
    check("agent_active", false, `Agent ${agent.account_id} is suspended by the owner.`, "Blocked", "AgentSuspended");
  }

  if (!capsule) {
    check("capsule_exists", false, `Capsule #${request.capsule_id} does not exist.`, "Blocked", "CapsuleNotFound");
    return finish();
  }
  check("capsule_exists", true, `Capsule #${capsule.id} exists (commitment ${capsule.commitment.slice(0, 12)}…).`, "Blocked", "CapsuleNotFound");

  if (capsule.agent_id !== agent.account_id) {
    check("capsule_bound_to_agent", false, `Capsule #${capsule.id} is bound to ${capsule.agent_id}, not ${agent.account_id}.`, "Blocked", "CapsuleAgentMismatch");
    return finish();
  }
  check("capsule_bound_to_agent", true, `Capsule #${capsule.id} is bound to this agent.`, "Blocked", "CapsuleAgentMismatch");

  if (capsule.status === "Revoked") {
    check("capsule_active", false, `Capsule #${capsule.id} was revoked by the owner.`, "Revoked", "CapsuleRevoked");
  } else if (capsule.status === "Exhausted") {
    check("capsule_active", false, `Capsule #${capsule.id} has used its full spending allowance.`, "Blocked", "CapsuleExhausted");
  } else {
    check("capsule_active", true, `Capsule #${capsule.id} is active.`, "Blocked", "CapsuleRevoked");
  }

  const expiresAt = BigInt(capsule.expires_at_ms);
  check(
    "capsule_not_expired",
    nowMs < expiresAt,
    nowMs < expiresAt ? `Capsule expires at ${expiresAt} (ms).` : `Capsule #${capsule.id} expired at ${expiresAt} (ms); now is ${nowMs}.`,
    "Expired",
    "CapsuleExpired",
  );

  const last = BigInt(capsule.last_nonce);
  const nonce = BigInt(request.nonce);
  if (nonce <= last) {
    check("nonce_sequence", false, `Nonce ${nonce} was already used (last accepted nonce ${last}). Replay rejected.`, "Blocked", "NonceReplay");
  } else if (nonce !== last + 1n) {
    check("nonce_sequence", false, `Nonce ${nonce} skips ahead; expected ${last + 1n}.`, "Blocked", "NonceOutOfOrder");
  } else {
    check("nonce_sequence", true, `Nonce ${nonce} is the next expected nonce.`, "Blocked", "NonceReplay");
  }

  check(
    "operation_matches",
    request.operation === capsule.operation,
    request.operation === capsule.operation
      ? `Operation ${request.operation} is authorized.`
      : `Operation ${request.operation} does not match the authorized operation ${capsule.operation}.`,
    "Blocked",
    "OperationMismatch",
  );
  check(
    "asset_matches",
    request.asset === capsule.asset,
    request.asset === capsule.asset
      ? `Asset ${request.asset} is authorized.`
      : `Asset ${request.asset} does not match the authorized asset ${capsule.asset}.`,
    "Blocked",
    "AssetMismatch",
  );
  check(
    "recipient_matches",
    request.recipient === capsule.recipient,
    request.recipient === capsule.recipient
      ? `Recipient ${request.recipient} is authorized.`
      : `Recipient ${request.recipient} does not match the authorized recipient ${capsule.recipient}.`,
    "Blocked",
    "RecipientMismatch",
  );

  const amount = BigInt(request.amount);
  const maxPerTx = BigInt(capsule.max_per_tx);
  if (amount === 0n) {
    check("amount_within_tx_limit", false, "Amount must be greater than zero.", "Blocked", "InvalidAmount");
  } else if (amount > maxPerTx) {
    check("amount_within_tx_limit", false, `Amount ${fmtNear(amount)} exceeds the per-transaction limit of ${fmtNear(maxPerTx)}.`, "Blocked", "AmountExceedsTxLimit");
  } else {
    check("amount_within_tx_limit", true, `Amount ${fmtNear(amount)} is within the per-transaction limit of ${fmtNear(maxPerTx)}.`, "Blocked", "AmountExceedsTxLimit");
  }

  const committed = BigInt(capsule.spent) + BigInt(capsule.reserved);
  const maxTotal = BigInt(capsule.max_total);
  const after = committed + amount;
  check(
    "cumulative_within_limit",
    after <= maxTotal,
    after <= maxTotal
      ? `Cumulative spend after this request: ${fmtNear(after)} of ${fmtNear(maxTotal)}.`
      : `Cumulative spend would reach ${fmtNear(after)}, above the capsule total of ${fmtNear(maxTotal)}.`,
    "Blocked",
    "CumulativeLimitExceeded",
  );

  const memoLen = request.memo ? new TextEncoder().encode(request.memo).length : 0;
  check("memo_valid", memoLen <= MAX_MEMO_LEN, memoLen <= MAX_MEMO_LEN ? "Memo length is valid." : `Memo is ${memoLen} bytes; the limit is ${MAX_MEMO_LEN}.`, "Blocked", "InvalidMemo");

  check(
    "vault_liquidity",
    amount <= vaultBalance,
    amount <= vaultBalance
      ? `Vault holds ${fmtNear(vaultBalance)} available.`
      : `Vault holds ${fmtNear(vaultBalance)} available; ${fmtNear(amount)} requested.`,
    "Blocked",
    "InsufficientVaultBalance",
  );

  if (capsule.review_threshold !== null) {
    const t = BigInt(capsule.review_threshold);
    check(
      "review_threshold",
      amount <= t,
      amount <= t
        ? `Amount is within the automatic approval threshold of ${fmtNear(t)}.`
        : `Amount ${fmtNear(amount)} is above the review threshold of ${fmtNear(t)}. Held for owner review.`,
      "RequiresHumanReview",
      "ReviewThresholdExceeded",
    );
  }

  return finish();
}
