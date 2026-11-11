import type { Check } from "@sentinel/engine";
import { Check as CheckIcon, Loader2, X } from "lucide-react";
import { cx } from "@/lib/cx";

export const CHECK_NAMES: Record<string, string> = {
  vault_active: "Vault not frozen", agent_active: "Agent is active", capsule_exists: "Capsule exists",
  capsule_bound_to_agent: "Capsule belongs to this agent", capsule_active: "Capsule not revoked",
  capsule_not_expired: "Capsule not expired", nonce_sequence: "Not a replayed request", operation_matches: "Operation matches",
  asset_matches: "Asset matches", recipient_matches: "Recipient matches", amount_within_tx_limit: "Within per-payment limit",
  cumulative_within_limit: "Within total limit", memo_valid: "Memo is valid", vault_liquidity: "Vault can cover it",
  review_threshold: "Below approval threshold",
};

/** Verification checks. `revealed` plays a result back one check at a time. */
export function ChecksList({ checks, revealed }: { checks: Check[]; revealed?: number }) {
  if (!checks.length) return <p className="text-sm text-dim">The contract returned no per-check detail for this step.</p>;
  const shown = revealed ?? checks.length;
  const passed = checks.slice(0, shown).filter((c) => c.passed).length;
  const failed = checks.slice(0, shown).filter((c) => !c.passed).length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3 text-[13px]">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className={cx("h-full rounded-full transition-[width] duration-150", failed ? "bg-block" : "bg-pass")} style={{ width: `${(shown / checks.length) * 100}%` }} />
        </div>
        <span className="text-dim tabular">{shown}/{checks.length} checked</span>
        {shown > 0 && <span className="tabular text-[#34d399]">{passed} passed</span>}
        {failed > 0 && <span className="tabular text-[#ff7b7b]">{failed} failed</span>}
      </div>
      <ol className="divide-y divide-line/60 rounded-[10px] border border-line" aria-live="polite">
        {checks.map((c, i) => {
          const done = i < shown;
          const current = i === shown;
          const name = CHECK_NAMES[c.name] ?? c.name;
          return (
            <li key={c.name} className={cx("flex items-start gap-3 px-4 py-2.5 text-sm transition-colors", done && !c.passed && "bg-block/[0.06]")}>
              <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                !done && !current && "border border-line-strong",
                current && "text-dim",
                done && c.passed && "bg-pass/15 text-[#34d399]",
                done && !c.passed && "bg-block/18 text-[#ff7b7b]")}>
                {current ? <Loader2 className="size-4 animate-spin" aria-hidden /> : done ? (c.passed ? <CheckIcon className="size-3" aria-label="passed" /> : <X className="size-3" aria-label="failed" />) : null}
              </span>
              <div className={cx("min-w-0", done && "rise-in")}>
                <div className={cx("font-medium", !done && !current && "text-faint", current && "text-dim", done && !c.passed && "text-[#ff9b9b]")}>{current ? `Checking: ${name.toLowerCase()}` : name}</div>
                {done && <div className="mt-0.5 text-[13px] leading-relaxed text-dim">{c.detail}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
