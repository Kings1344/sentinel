import type { Check } from "@sentinel/engine";
import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import { cx } from "@/lib/cx";

export const CHECK_NAMES: Record<string, string> = {
  vault_active: "Vault not frozen", agent_active: "Agent active", capsule_exists: "Capsule exists",
  capsule_bound_to_agent: "Capsule belongs to this agent", capsule_active: "Capsule not revoked",
  capsule_not_expired: "Capsule not expired", nonce_sequence: "Request is not a replay", operation_matches: "Operation matches",
  asset_matches: "Asset matches", recipient_matches: "Recipient matches", amount_within_tx_limit: "Within per-payment limit",
  cumulative_within_limit: "Within total limit", memo_valid: "Memo valid", vault_liquidity: "Vault can cover it",
  review_threshold: "Below review threshold",
};

/**
 * Renders verification checks. With `revealed`, checks past that index show as "checking…",
 * which the Attack Lab uses to play back a result one check at a time.
 */
export function ChecksList({ checks, revealed }: { checks: Check[]; revealed?: number }) {
  if (!checks.length) return <p className="text-sm text-dim">No per-check detail for this step.</p>;
  const shown = revealed ?? checks.length;
  return (
    <ol className="space-y-1.5" aria-live="polite">
      {checks.map((c, i) => {
        const done = i < shown;
        const current = i === shown;
        if (!done && !current) return <li key={c.name} className="flex gap-2.5 text-sm text-faint/60"><span className="mt-0.5 size-4 shrink-0 rounded-full border border-line" aria-hidden /><span>{CHECK_NAMES[c.name] ?? c.name}</span></li>;
        if (current) return <li key={c.name} className="flex gap-2.5 text-sm text-dim"><Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden /><span>Checking {(CHECK_NAMES[c.name] ?? c.name).toLowerCase()}…</span></li>;
        return (
          <li key={c.name} className={cx("check-in flex gap-2.5 rounded-md text-sm", !c.passed && "bg-block/8 -mx-2 px-2 py-1")}>
            {c.passed ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-pass" aria-label="passed" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-block" aria-label="failed" />}
            <div>
              <span className="font-medium">{CHECK_NAMES[c.name] ?? c.name}</span>
              <span className="text-dim">. {c.detail}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
