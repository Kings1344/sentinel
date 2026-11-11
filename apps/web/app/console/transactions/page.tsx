"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, ChevronRight, Search } from "lucide-react";
import type { RequestRecord } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { PageTitle } from "@/components/ConsoleShell";
import { Empty, Input, ListSkeleton, Mono, Segmented } from "@/components/ui";
import { StatusPill, reasonText } from "@/components/status";
import { ago, near, short } from "@/lib/format";

type F = "all" | "approved" | "stopped" | "review";
const FILTERS: { id: F; label: string; match: (r: RequestRecord) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "approved", label: "Approved", match: (r) => r.decision === "Approved" },
  { id: "stopped", label: "Blocked", match: (r) => r.decision !== "Approved" && r.decision !== "RequiresHumanReview" },
  { id: "review", label: "Awaiting approval", match: (r) => r.status === "PendingReview" },
];

function Transactions() {
  const params = useSearchParams();
  const router = useRouter();
  const { requests, loading, overview } = useVault();
  const [filter, setFilter] = useState<F>((params.get("filter") as F) ?? "all");
  const [q, setQ] = useState("");
  const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
  const needle = q.trim().toLowerCase();
  const list = requests.filter(f.match).filter((r) => !needle || `#${r.id} ${r.agent_id} ${r.recipient} ${r.reason} ${reasonText(r.reason)}`.toLowerCase().includes(needle));

  return (
    <>
      <PageTitle title="Transactions">Every payment an agent asked for, and the contract's decision. Blocked requests are recorded on-chain, and no funds moved for them.</PageTitle>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Filter transactions" value={filter} onChange={setFilter} options={FILTERS.map((x) => ({ value: x.id, label: x.label, count: requests.filter(x.match).length }))} />
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Search transactions</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agent, recipient or reason" className="pl-9" />
        </label>
      </div>

      <div className="surface overflow-hidden">
        {loading && !overview ? <div className="p-6"><ListSkeleton rows={6} /></div> : list.length === 0 ? (
          <Empty title={requests.length ? "No transactions match" : "No transactions yet"} icon={<Activity className="size-5" />}>{requests.length ? "Try another filter or search term." : "Agent requests appear here as soon as they reach the contract."}</Empty>
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-line bg-raised/40 text-left text-[13px] text-dim">
                  <th scope="col" className="py-3 pr-3 pl-6 font-medium">Request</th>
                  <th scope="col" className="px-3 py-3 font-medium">Status</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-3 py-3 font-medium">Recipient</th>
                  <th scope="col" className="px-3 py-3 font-medium">Reason</th>
                  <th scope="col" className="py-3 pr-6 pl-3 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/console/transactions/${r.id}`)} className="group cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-hover/50">
                    <td className="py-3.5 pr-3 pl-6"><Link href={`/console/transactions/${r.id}`} className="font-medium tabular hover:underline" onClick={(e) => e.stopPropagation()}>#{r.id}</Link><div className="mt-0.5 text-[13px] text-faint"><Mono>{short(r.agent_id, 16)}</Mono></div></td>
                    <td className="px-3 py-3.5"><StatusPill r={r} size="sm" /></td>
                    <td className="px-3 py-3.5 text-right font-medium tabular">{near(r.amount, 3)}</td>
                    <td className="max-w-[220px] px-3 py-3.5"><Mono className="block truncate">{r.recipient}</Mono></td>
                    <td className="px-3 py-3.5 text-dim">{reasonText(r.reason)}</td>
                    <td className="py-3.5 pr-6 pl-3 text-right whitespace-nowrap text-faint">{ago(r.created_at_ms)}<ChevronRight className="ml-2 inline size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line/70 md:hidden">
              {list.map((r) => (
                <li key={r.id}>
                  <Link href={`/console/transactions/${r.id}`} className="block px-5 py-4 transition-colors hover:bg-hover/50">
                    <div className="flex items-center justify-between gap-3"><span className="font-medium tabular">#{r.id}</span><StatusPill r={r} size="sm" /></div>
                    <div className="mt-2 text-sm"><span className="font-medium tabular">{near(r.amount, 3)}</span> <span className="text-dim">to</span> <Mono>{r.recipient}</Mono></div>
                    <div className="mt-1 text-[13px] text-dim">{reasonText(r.reason)}, {ago(r.created_at_ms)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

export default function TransactionsPage() {
  return <Suspense fallback={<div className="surface p-6"><ListSkeleton rows={6} /></div>}><Transactions /></Suspense>;
}
