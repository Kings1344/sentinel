import type { Check } from "@sentinel/engine";
import { CircleCheck, CircleX } from "lucide-react";

const NAMES: Record<string, string> = {
  vault_active: "Vault not frozen", agent_active: "Agent active", capsule_exists: "Capsule exists",
  capsule_bound_to_agent: "Capsule belongs to this agent", capsule_active: "Capsule not revoked",
  capsule_not_expired: "Capsule not expired", nonce_sequence: "Nonce is fresh", operation_matches: "Operation matches",
  asset_matches: "Asset matches", recipient_matches: "Recipient matches", amount_within_tx_limit: "Within per-payment limit",
  cumulative_within_limit: "Within total limit", memo_valid: "Memo valid", vault_liquidity: "Vault can cover it",
  review_threshold: "Below review threshold",
};

export function ChecksList({ checks }: { checks: Check[] }) {
  if (!checks.length) return <p className="text-sm text-dim">No per-check detail for this step.</p>;
  return (
    <ol className="space-y-1.5">
      {checks.map((c) => (
        <li key={c.name} className="flex gap-2.5 text-sm">
          {c.passed ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-pass" aria-label="passed" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-block" aria-label="failed" />}
          <div>
            <span className="font-medium">{NAMES[c.name] ?? c.name}</span>
            <span className="text-dim"> — {c.detail}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
