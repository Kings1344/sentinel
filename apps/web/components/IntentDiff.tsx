/**
 * The core visual of Sentinel: what the owner authorized vs what the agent proposed, field by field.
 * Mismatches are flagged; nothing here decides anything — it renders contract/engine output.
 */
import { Check, X } from "lucide-react";
import { formatNear } from "@sentinel/engine";
import { cx } from "@/lib/cx";

export interface DiffRow {
  field: string;
  authorized: string;
  proposed: string;
  ok: boolean;
}

export function diffRows(capsule: { operation: string; asset: string; recipient: string; max_per_tx: string; last_nonce?: string }, proposal: { operation: string; asset: string; recipient: string; amount: string; nonce?: number | string }): DiffRow[] {
  const amount = BigInt(proposal.amount);
  const rows: DiffRow[] = [
    { field: "Operation", authorized: capsule.operation, proposed: proposal.operation, ok: capsule.operation === proposal.operation },
    { field: "Asset", authorized: capsule.asset, proposed: proposal.asset, ok: capsule.asset === proposal.asset },
    { field: "Recipient", authorized: capsule.recipient, proposed: proposal.recipient, ok: capsule.recipient === proposal.recipient },
    { field: "Amount", authorized: `≤ ${formatNear(capsule.max_per_tx)} NEAR`, proposed: `${formatNear(amount)} NEAR`, ok: amount > 0n && amount <= BigInt(capsule.max_per_tx) },
  ];
  if (capsule.last_nonce !== undefined && proposal.nonce !== undefined) {
    const next = BigInt(capsule.last_nonce) + 1n;
    rows.push({ field: "Nonce", authorized: `${next}`, proposed: `${proposal.nonce}`, ok: BigInt(proposal.nonce) === next });
  }
  return rows;
}

export function IntentDiff({ rows, animate = true, caption }: { rows: DiffRow[]; animate?: boolean; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[480px] text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line text-left text-dim">
            <th scope="col" className="w-28 px-3 py-2 font-medium">Field</th>
            <th scope="col" className="px-3 py-2 font-medium">Owner authorized</th>
            <th scope="col" className="px-3 py-2 font-medium">Agent proposed</th>
            <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Match</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field} className={cx("border-b border-line/60 last:border-0", !r.ok && "bg-block/8", !r.ok && animate && "diff-flag")}>
              <th scope="row" className={cx("px-3 py-2 text-left font-medium", !r.ok && "border-l-2 border-block")}>{r.field}</th>
              <td className="px-3 py-2 font-mono text-[13px] text-dim break-all">{r.authorized}</td>
              <td className={cx("px-3 py-2 font-mono text-[13px] break-all", r.ok ? "text-fg" : "text-block")}>{r.proposed}</td>
              <td className="px-3 py-2">
                {r.ok ? <Check className="size-4 text-pass" aria-label="matches" /> : <X className="size-4 text-block" aria-label="does not match" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
