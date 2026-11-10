/** Mirrors the JSON returned by the sentinel-vault contract views. u64/u128 values arrive as strings. */
export type AgentStatus = "Active" | "Suspended" | "Revoked";
export type CapsuleStatus = "Active" | "Revoked" | "Exhausted";
export type Decision = "Approved" | "Blocked" | "RequiresHumanReview" | "Expired" | "Revoked";
export type RequestStatus =
  | "Rejected"
  | "PendingReview"
  | "PendingTransfer"
  | "Executed"
  | "TransferFailed"
  | "ReviewRejected";
export type ReasonCode =
  | "Authorized"
  | "OwnerApproved"
  | "VaultFrozen"
  | "AgentSuspended"
  | "AgentRevoked"
  | "CapsuleNotFound"
  | "CapsuleAgentMismatch"
  | "CapsuleRevoked"
  | "CapsuleExhausted"
  | "CapsuleExpired"
  | "NonceReplay"
  | "NonceOutOfOrder"
  | "OperationMismatch"
  | "AssetMismatch"
  | "RecipientMismatch"
  | "InvalidAmount"
  | "AmountExceedsTxLimit"
  | "CumulativeLimitExceeded"
  | "InvalidMemo"
  | "InsufficientVaultBalance"
  | "ReviewThresholdExceeded"
  | "OwnerRejected"
  | "ReviewInvalidated"
  | "TransferFailed";

export interface Agent {
  account_id: string;
  label: string;
  status: AgentStatus;
  registered_at_ms: string;
  approved_count: number;
  blocked_count: number;
  capsule_ids: number[];
}

export interface Capsule {
  id: number;
  version: number;
  supersedes: number | null;
  agent_id: string;
  operation: string;
  asset: string;
  recipient: string;
  max_per_tx: string;
  max_total: string;
  review_threshold: string | null;
  instruction: string;
  created_at_ms: string;
  expires_at_ms: string;
  status: CapsuleStatus;
  spent: string;
  reserved: string;
  last_nonce: string;
  commitment: string;
}

export interface TransferRequest {
  capsule_id: number;
  nonce: number;
  operation: string;
  asset: string;
  recipient: string;
  amount: string;
  memo: string | null;
}

export interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

export interface Evaluation {
  request_id: number;
  decision: Decision;
  reason: ReasonCode;
  explanation: string;
  status: RequestStatus;
  checks: Check[];
}

export interface RequestRecord {
  id: number;
  capsule_id: number;
  agent_id: string;
  nonce: string;
  operation: string;
  asset: string;
  recipient: string;
  amount: string;
  memo: string | null;
  decision: Decision;
  reason: ReasonCode;
  explanation: string;
  status: RequestStatus;
  created_at_ms: string;
  block_height: string;
}

export interface AuditEvent {
  seq: string;
  kind: string;
  actor: string;
  capsule_id: number | null;
  request_id: number | null;
  detail: string;
  timestamp_ms: string;
}

export interface Overview {
  owner: string;
  frozen: boolean;
  vault_balance: string;
  total_reserved: string;
  contract_balance: string;
  agent_count: number;
  capsule_count: number;
  request_count: number;
  approved_total: number;
  blocked_total: number;
  executed_total: number;
  failed_total: number;
  audit_count: number;
}

export const OP_NATIVE_TRANSFER = "native_transfer";
export const ASSET_NEAR = "NEAR";

/** Capsule status including time-based expiry, which the contract evaluates lazily. */
export function effectiveCapsuleStatus(c: Capsule, nowMs: number): CapsuleStatus | "Expired" {
  if (c.status !== "Active") return c.status;
  return BigInt(nowMs) >= BigInt(c.expires_at_ms) ? "Expired" : "Active";
}
