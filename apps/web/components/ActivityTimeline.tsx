import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { RequestRecord } from "@sentinel/engine";
import { Mono, cx } from "./ui";
import { StatusNode, StatusPill, reasonText, requestState } from "./status";
import { ago, formatNearShort, short } from "@/lib/format";

/** Vertical activity timeline of agent requests. Each row opens the transaction's page. */
export function ActivityTimeline({ requests, compact = false }: { requests: RequestRecord[]; compact?: boolean }) {
  return (
    <ol className="relative">
      {requests.map((r, i) => {
        const s = requestState(r);
        const last = i === requests.length - 1;
        return (
          <li key={r.id} className="relative">
            {!last && <span className="absolute top-12 bottom-0 left-[33px] w-px bg-line" aria-hidden />}
            <Link href={`/console/transactions/${r.id}`} className="group flex gap-4 rounded-xl px-4 py-3.5 transition-colors hover:bg-hover/60">
              <StatusNode r={r} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-medium">{s.tone === "pass" || s.tone === "signal" ? "Payment approved" : s.tone === "hold" && r.status === "PendingReview" ? "Waiting for your approval" : reasonText(r.reason)}</span>
                  {!compact && <StatusPill r={r} size="sm" />}
                </div>
                <p className="mt-1 truncate text-[13px] text-dim">
                  <Mono className="text-fg/85">{short(r.agent_id, 18)}</Mono> asked to send to <Mono className="text-fg/85">{short(r.recipient, 22)}</Mono>
                </p>
                <p className="mt-1 text-[12.5px] text-faint">Request #{r.id}, {ago(r.created_at_ms)}</p>
              </div>
              <div className="flex shrink-0 items-start gap-2 pt-0.5">
                <span className={cx("text-sm font-medium tabular", s.tone === "block" ? "text-dim line-through decoration-faint/60" : "text-fg")}>{formatNearShort(r.amount)}</span>
                <ChevronRight className="mt-0.5 size-4 text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
