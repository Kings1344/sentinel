/**
 * Intent diff: what the owner authorized vs what the agent proposed, field by field.
 * It renders contract / engine output. It decides nothing.
 */
import { ArrowRight, Check, X } from "lucide-react";
import { formatNear } from "@sentinel/engine";
import { cx } from "@/lib/cx";

export interface DiffRow { field: string; authorized: string; proposed: string; ok: boolean }

export function diffRows(capsule: { operation: string; asset: string; recipient: string; max_per_tx: string; last_nonce?: string }, proposal: { operation: string; asset: string; recipient: string; amount: string; nonce?: number | string }): DiffRow[] {
  const amount = BigInt(proposal.amount);
  const rows: DiffRow[] = [
    { field: "Operation", authorized: capsule.operation === "native_transfer" ? "NEAR transfer" : capsule.operation, proposed: proposal.operation === "native_transfer" ? "NEAR transfer" : proposal.operation, ok: capsule.operation === proposal.operation },
    { field: "Asset", authorized: capsule.asset, proposed: proposal.asset, ok: capsule.asset === proposal.asset },
    { field: "Recipient", authorized: capsule.recipient, proposed: proposal.recipient, ok: capsule.recipient === proposal.recipient },
    { field: "Amount", authorized: `up to ${formatNear(capsule.max_per_tx)} NEAR`, proposed: `${formatNear(amount)} NEAR`, ok: amount > 0n && amount <= BigInt(capsule.max_per_tx) },
  ];
  if (capsule.last_nonce !== undefined && proposal.nonce !== undefined) {
    const next = BigInt(capsule.last_nonce) + 1n;
    rows.push({ field: "Sequence", authorized: `request #${next}`, proposed: `request #${proposal.nonce}`, ok: BigInt(proposal.nonce) === next });
  }
  return rows;
}

export function IntentDiff({ rows, animate = true, caption }: { rows: DiffRow[]; animate?: boolean; caption?: string }) {
  const bad = rows.filter((r) => !r.ok).length;
  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-raised/60 px-4 py-2.5 text-[13px]">
        <span className="text-dim">{caption ?? "Owner intent compared with agent proposal"}</span>
        <span className={bad ? "font-medium text-[#ff7b7b]" : "font-medium text-[#34d399]"}>{bad ? `${bad} field${bad > 1 ? "s" : ""} changed` : "All fields match"}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-[13px] text-faint">
              <th scope="col" className="w-28 px-4 pt-3 pb-2 font-medium">Field</th>
              <th scope="col" className="px-4 pt-3 pb-2 font-medium">Owner authorized</th>
              <th scope="col" className="w-6 pt-3 pb-2"><span className="sr-only">to</span></th>
              <th scope="col" className="px-4 pt-3 pb-2 font-medium">Agent proposed</th>
              <th scope="col" className="w-12 pt-3 pb-2"><span className="sr-only">Result</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.field} className={cx("border-t border-line/70", !r.ok && "bg-block/[0.06]", !r.ok && animate && "diff-flag")}>
                <th scope="row" className={cx("px-4 py-3 text-left font-medium", !r.ok ? "text-[#ff9b9b]" : "text-dim")}>{r.field}</th>
                <td className="px-4 py-3 font-mono text-[13px] break-all text-dim">{r.authorized}</td>
                <td className="py-3 text-faint"><ArrowRight className="size-3.5" aria-hidden /></td>
                <td className={cx("px-4 py-3 font-mono text-[13px] break-all", r.ok ? "text-fg" : "font-medium text-[#ff8a8a]")}>{r.proposed}</td>
                <td className="py-3 pr-4">
                  <span className={cx("grid size-6 place-items-center rounded-full", r.ok ? "bg-pass/12 text-[#34d399]" : "bg-block/15 text-[#ff7b7b]")}>
                    {r.ok ? <Check className="size-3.5" aria-label="matches" /> : <X className="size-3.5" aria-label="does not match" />}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
