/**
 * Canonical Intent Capsule commitment.
 * MUST stay byte-identical to `commitment_payload()` in contracts/sentinel-vault/src/lib.rs:
 * compact JSON, fixed key order, u64/u128 as decimal strings, version/supersedes as numbers.
 */
export const COMMITMENT_DOMAIN = "sentinel-capsule-v1";

export interface CapsuleTerms {
  vault: string;
  owner: string;
  agent_id: string;
  operation: string;
  asset: string;
  recipient: string;
  max_per_tx: string;
  max_total: string;
  review_threshold: string | null;
  expires_at_ms: string;
  instruction: string;
  version: number;
  supersedes: number | null;
}

export function canonicalCapsuleJson(t: CapsuleTerms): string {
  return JSON.stringify({
    domain: COMMITMENT_DOMAIN,
    vault: t.vault,
    owner: t.owner,
    agent_id: t.agent_id,
    operation: t.operation,
    asset: t.asset,
    recipient: t.recipient,
    max_per_tx: t.max_per_tx,
    max_total: t.max_total,
    review_threshold: t.review_threshold,
    expires_at_ms: t.expires_at_ms,
    instruction: t.instruction,
    version: t.version,
    supersedes: t.supersedes,
  });
}

export async function capsuleCommitment(t: CapsuleTerms): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalCapsuleJson(t));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
