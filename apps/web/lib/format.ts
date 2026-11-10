import { formatNear } from "@sentinel/engine";

export const near = (yocto: string | bigint, decimals = 4) => `${formatNear(yocto, decimals)} NEAR`;
export const short = (s: string, n = 8) => (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-4)}` : s);

export function ago(ms: string | number): string {
  const t = Number(ms);
  if (!t) return "—";
  const d = Date.now() - t;
  if (d < 0) return `in ${dur(-d)}`;
  if (d < 60_000) return `${Math.max(1, Math.round(d / 1000))}s ago`;
  return `${dur(d)} ago`;
}

export function dur(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

export const REASON_TEXT: Record<string, string> = {
  Authorized: "Matches the owner's capsule",
  OwnerApproved: "Approved by the owner",
  VaultFrozen: "Vault frozen",
  AgentSuspended: "Agent suspended",
  AgentRevoked: "Agent revoked",
  CapsuleNotFound: "Unknown capsule",
  CapsuleAgentMismatch: "Capsule belongs to another agent",
  CapsuleRevoked: "Capsule revoked",
  CapsuleExhausted: "Capsule allowance used up",
  CapsuleExpired: "Capsule expired",
  NonceReplay: "Replay detected",
  NonceOutOfOrder: "Nonce out of order",
  OperationMismatch: "Unauthorized operation",
  AssetMismatch: "Unauthorized asset",
  RecipientMismatch: "Unauthorized recipient",
  InvalidAmount: "Invalid amount",
  AmountExceedsTxLimit: "Over the per-payment limit",
  CumulativeLimitExceeded: "Over the total limit",
  InvalidMemo: "Memo too long",
  InsufficientVaultBalance: "Vault balance too low",
  ReviewThresholdExceeded: "Held for owner review",
  OwnerRejected: "Rejected by the owner",
  ReviewInvalidated: "Approval no longer valid",
  TransferFailed: "Transfer failed, refunded",
};
