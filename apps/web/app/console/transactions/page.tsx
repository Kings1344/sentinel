"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import type { RequestRecord } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { txFor } from "@/lib/txlog";
import { txUrl } from "@/lib/config";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { Button, Empty, Mono, Panel, cx } from "@/components/ui";
import { DecisionBadge, RequestStatusBadge, reasonText } from "@/components/status";
import { IntentDiff, diffRows } from "@/components/IntentDiff";
import { ago, near } from "@/lib/format";

const FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "approved", label: "Approved", match: (r: RequestRecord) => r.decision === "Approved" },
  { id: "stopped", label: "Stopped", match: (r: RequestRecord) => r.decision !== "Approved" && r.decision !== "RequiresHumanReview" },
  { id: "review", label: "Awaiting review", match: (r: RequestRecord) => r.status === "PendingReview" },
] as const;

function Requests() {
  const params = useSearchParams();
  const { requests, capsules, isOwner } = useVault();
  const { call } = useWallet();
  const { run, busy } = useAction();
  const act = ownerActions(call);
  const [filter, setFilter] = useState<string>(params.get("filter") ?? "all");
  const [open, setOpen] = useState<number | null>(null);
  const [hashes, setHashes] = useState<Record<number, string>>({});
  useEffect(() => {
    const m: Record<number, string> = {};
    for (const r of requests) { const h = txFor(r.id); if (h) m[r.id] = h; }
    setHashes(m);
  }, [requests]);

  const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
  const list = requests.filter(f.match);

  return (
    <>
      <PageTitle title="Requests">Every transfer an agent asked for, with the contract's decision. Stopped requests are recorded on-chain; no funds moved for them.</PageTitle>
      <div role="tablist" aria-label="Filter requests" className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map((x) => (
          <button key={x.id} role="tab" aria-selected={filter === x.id} onClick={() => setFilter(x.id)}
            className={cx("rounded-md px-3 py-1.5 text-sm", filter === x.id ? "bg-raised text-fg" : "text-dim hover:text-fg")}>
            {x.label} <span className="text-faint tabular">{requests.filter(x.match).length}</span>
          </button>
        ))}
      </div>
      <Panel>
        {list.length === 0 ? <Empty title="No requests match this filter" /> : (
          <ul className="divide-y divide-line/70">
            {list.map((r) => {
              const c = capsules.find((x) => x.id === r.capsule_id);
              const expanded = open === r.id;
              return (
                <li key={r.id} className="py-3">
                  <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left text-sm" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.id)}>
                    <span className="w-10 text-faint tabular">#{r.id}</span>
                    <DecisionBadge decision={r.decision} />
                    <RequestStatusBadge status={r.status} />
                    <span className="min-w-0 flex-1 truncate">{near(r.amount)} to <Mono>{r.recipient}</Mono> by <Mono className="text-dim">{r.agent_id}</Mono></span>
                    <span className="text-dim">{reasonText(r.reason)}</span>
                    <span className="w-20 text-right text-xs text-faint">{ago(r.created_at_ms)}</span>
                  </button>
                  {expanded && (
                    <div className="mt-3 space-y-3 pl-0 sm:pl-13">
                      <p className="text-sm">{r.explanation}</p>
                      {c ? <IntentDiff animate={false} rows={diffRows({ operation: c.operation, asset: c.asset, recipient: c.recipient, max_per_tx: c.max_per_tx }, r)} caption={`Capsule ${c.id} vs request ${r.id}`} /> : <p className="text-sm text-dim">Capsule #{r.capsule_id} does not exist; the request referenced an unknown capsule.</p>}
                      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                        <div><dt className="inline text-dim">Capsule: </dt><dd className="inline">#{r.capsule_id}</dd></div>
                        <div><dt className="inline text-dim">Nonce: </dt><dd className="inline tabular">{r.nonce}</dd></div>
                        <div><dt className="inline text-dim">Operation / asset: </dt><dd className="inline"><Mono>{r.operation}</Mono> / <Mono>{r.asset}</Mono></dd></div>
                        <div><dt className="inline text-dim">Block: </dt><dd className="inline tabular">{r.block_height}</dd></div>
                        {r.memo && <div><dt className="inline text-dim">Memo: </dt><dd className="inline"><Mono>{r.memo}</Mono></dd></div>}
                        <div>
                          <dt className="inline text-dim">Transaction: </dt>
                          <dd className="inline">{hashes[r.id] ? <a className="inline-flex items-center gap-1 text-[#7fb0ff] hover:underline" href={txUrl(hashes[r.id])} target="_blank" rel="noreferrer"><Mono>{hashes[r.id].slice(0, 12)}…</Mono><ExternalLink className="size-3" /></a> : <span className="text-faint">submitted outside this browser; find it on the vault's explorer page</span>}</dd>
                        </div>
                      </dl>
                      {r.status === "PendingReview" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="primary" disabled={!isOwner} busy={busy === `ap-${r.id}`} onClick={() => run(`ap-${r.id}`, `Approve request #${r.id}`, () => act.resolveReview(r.id, true))}>Approve and pay</Button>
                          <Button variant="danger" disabled={!isOwner} busy={busy === `rj-${r.id}`} onClick={() => run(`rj-${r.id}`, `Reject request #${r.id}`, () => act.resolveReview(r.id, false))}>Reject</Button>
                          <OwnerHint />
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

export default function RequestsPage() {
  return <Suspense fallback={<p className="text-sm text-dim">Loading…</p>}><Requests /></Suspense>;
}
