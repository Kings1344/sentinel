import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { RequestRecord } from "@sentinel/engine";
import { Mono, cx } from "./ui";
import { StatusNode, StatusPill, reasonText, requestState } from "./status";
import { ago, formatNearShort, short } from "@/lib/format";

function headline(r: RequestRecord): string {
  const s = requestState(r);
  if (r.status === "PendingReview") return "Waiting for your approval";
  if (s.tone === "pass" || s.tone === "signal") return "Payment approved";
  if (r.status === "TransferFailed") return "Transfer failed, refunded";
  return reasonText(r.reason);
}

/**
 * Activity timeline of agent requests, built to scan top to bottom:
 * status node, what happened, who asked whom, then amount and time in fixed columns.
 */
export function ActivityTimeline({ requests }: { requests: RequestRecord[] }) {
  return (
    <ol className="relative">
      {requests.map((r, i) => {
        const s = requestState(r);
        const blocked = s.tone === "block";
        return (
          <li key={r.id} className="relative">
            {i < requests.length - 1 && <span className="absolute top-[52px] bottom-[-4px] left-[37px] w-px bg-line-strong/70" aria-hidden />}
            <Link href={`/console/transactions/${r.id}`} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 rounded-xl px-5 py-4 transition-colors hover:bg-hover/70 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
              <StatusNode r={r} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <span className={cx("text-[15px] leading-snug font-semibold tracking-[-0.005em]", blocked ? "text-[#ffb4b4]" : "text-fg")}>{headline(r)}</span>
                  <StatusPill r={r} size="sm" />
                </div>
                <p className="mt-1.5 truncate text-[13px] text-dim">
                  <Mono className="text-fg/90">{short(r.agent_id, 18)}</Mono> <span className="text-faint">asked to pay</span> <Mono className="text-fg/90">{short(r.recipient, 22)}</Mono>
                </p>
                <p className="mt-1 text-[13px] text-faint sm:hidden">Request #{r.id}, {ago(r.created_at_ms)}</p>
              </div>
              <div className="pt-0.5 text-right">
                <div className={cx("text-[15px] font-semibold tabular", blocked ? "text-faint line-through decoration-faint/70" : "text-fg")}>{formatNearShort(r.amount)}</div>
                <div className={cx("mt-1 text-[13px]", blocked ? "text-[#ff9b9b]" : s.tone === "hold" ? "text-[#fbbf24]" : "text-[#34d399]")}>{blocked ? "Not sent" : r.status === "Executed" ? "Sent" : r.status === "PendingReview" ? "On hold" : r.status === "TransferFailed" ? "Refunded" : "Sending"}</div>
              </div>
              <div className="hidden w-28 pt-0.5 text-right sm:block">
                <div className="text-[13px] text-dim">{ago(r.created_at_ms)}</div>
                <div className="mt-1 flex items-center justify-end gap-1 text-[13px] text-faint">Request #{r.id}<ChevronRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /></div>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
