"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import type { RequestRecord } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { PageTitle } from "@/components/ConsoleShell";
import { Empty, Input, ListSkeleton, Mono, Panel, cx } from "@/components/ui";
import { DecisionBadge, RequestStatusBadge, reasonText } from "@/components/status";
import { ago, near } from "@/lib/format";

const FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "approved", label: "Approved", match: (r: RequestRecord) => r.decision === "Approved" },
  { id: "stopped", label: "Blocked", match: (r: RequestRecord) => r.decision !== "Approved" && r.decision !== "RequiresHumanReview" },
  { id: "review", label: "Awaiting approval", match: (r: RequestRecord) => r.status === "PendingReview" },
] as const;

function Transactions() {
  const params = useSearchParams();
  const { requests, loading, overview } = useVault();
  const [filter, setFilter] = useState<string>(params.get("filter") ?? "all");
  const [q, setQ] = useState("");
  const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
  const needle = q.trim().toLowerCase();
  const list = requests.filter(f.match).filter((r) =>
    !needle || `#${r.id} ${r.agent_id} ${r.recipient} ${r.reason} ${reasonText(r.reason)}`.toLowerCase().includes(needle),
  );

  return (
    <>
      <PageTitle title="Transactions">Every payment an agent asked for, and the contract's decision. Blocked requests are recorded on-chain, and no funds moved for them.</PageTitle>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter transactions" className="flex flex-wrap gap-1">
          {FILTERS.map((x) => (
            <button key={x.id} role="tab" aria-selected={filter === x.id} onClick={() => setFilter(x.id)}
              className={cx("rounded-lg px-3 py-1.5 text-sm", filter === x.id ? "bg-raised text-fg" : "text-dim hover:text-fg")}>
              {x.label} <span className="text-faint tabular">{requests.filter(x.match).length}</span>
            </button>
          ))}
        </div>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search transactions</span>
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-faint" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agent, recipient or reason" className="pl-9" />
        </label>
      </div>
      <Panel padded={false}>
        {loading && !overview ? <div className="p-5"><ListSkeleton rows={6} /></div> : list.length === 0 ? (
          <div className="p-5"><Empty title={requests.length ? "No transactions match" : "No transactions yet"}>{requests.length ? "Try another filter or search." : "Agent requests appear here as soon as they reach the contract."}</Empty></div>
        ) : (
          <ul className="divide-y divide-line/70">
            {list.map((r) => (
              <li key={r.id}>
                <Link href={`/console/transactions/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 text-sm hover:bg-raised/50">
                  <span className="w-9 text-faint tabular">#{r.id}</span>
                  <DecisionBadge decision={r.decision} />
                  <RequestStatusBadge status={r.status} />
                  <span className="min-w-0 flex-1 truncate">{near(r.amount)} to <Mono>{r.recipient}</Mono></span>
                  <span className="text-dim">{reasonText(r.reason)}</span>
                  <span className="w-20 text-right text-xs text-faint">{ago(r.created_at_ms)}</span>
                  <ChevronRight className="size-4 text-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

export default function TransactionsPage() {
  return <Suspense fallback={<ListSkeleton rows={6} />}><Transactions /></Suspense>;
}
