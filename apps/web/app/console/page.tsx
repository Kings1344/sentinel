"use client";
import Link from "next/link";
import { effectiveCapsuleStatus } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { PageTitle } from "@/components/ConsoleShell";
import { Badge, Empty, Notice, Panel, Stat, Mono } from "@/components/ui";
import { DecisionBadge, reasonText } from "@/components/status";
import { ago, near, short } from "@/lib/format";

export default function Dashboard() {
  const { overview, agents, capsules, requests, risk, error, loading, updatedAt } = useVault();
  const now = Date.now();
  const activeCapsules = capsules.filter((c) => effectiveCapsuleStatus(c, now) === "Active");
  const pending = requests.filter((r) => r.status === "PendingReview");
  const critical = risk.filter((r) => r.severity === "critical" || r.severity === "high");

  return (
    <>
      <PageTitle title="Overview">Live state read from the Sentinel Vault contract. Nothing on this page is simulated.</PageTitle>
      {error && <div className="mb-4"><Notice tone="block">{error}</Notice></div>}
      {loading && !overview && <p className="text-sm text-dim">Reading the contract…</p>}

      {overview && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Vault balance" value={near(overview.vault_balance)} sub={`${near(overview.total_reserved)} reserved for settling payments`} />
            <Stat label="Active agents" value={agents.filter((a) => a.status === "Active").length} sub={`${agents.length} registered`} />
            <Stat label="Active capsules" value={activeCapsules.length} sub={`${overview.capsule_count} created`} />
            <Stat label="Requests" value={overview.request_count} sub={`${overview.executed_total} paid · ${overview.blocked_total} stopped`} />
          </div>

          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <Panel title="Security status" className="md:col-span-1">
              {overview.frozen ? (
                <Notice tone="hold">The vault is frozen. Every agent request is rejected until you unfreeze it in Settings.</Notice>
              ) : critical.length ? (
                <Notice tone="block">{critical.length} high-severity event{critical.length > 1 ? "s" : ""} detected. <Link href="/console/security" className="underline">Review them</Link>.</Notice>
              ) : (
                <Notice tone="pass">No high-severity events. Agents are operating inside their capsules.</Notice>
              )}
              {pending.length > 0 && (
                <p className="mt-3 text-sm"><Link className="text-[#7fb0ff] hover:underline" href="/console/transactions?filter=review">{pending.length} request{pending.length > 1 ? "s" : ""} waiting for your review</Link></p>
              )}
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-dim">Approved decisions</dt><dd className="tabular">{overview.approved_total}</dd></div>
                <div className="flex justify-between"><dt className="text-dim">Stopped by the contract</dt><dd className="tabular">{overview.blocked_total}</dd></div>
                <div className="flex justify-between"><dt className="text-dim">Failed and refunded</dt><dd className="tabular">{overview.failed_total}</dd></div>
                <div className="flex justify-between"><dt className="text-dim">Owner</dt><dd><Mono>{short(overview.owner, 12)}</Mono></dd></div>
              </dl>
            </Panel>

            <Panel title="Latest requests" className="md:col-span-2" action={<Link href="/console/transactions" className="text-sm text-dim hover:text-fg">All requests</Link>}>
              {requests.length === 0 ? (
                <Empty title="No agent requests yet">Run the authorized payment in the <Link className="text-[#7fb0ff]" href="/console/attack-lab">Attack lab</Link> to create the first one.</Empty>
              ) : (
                <ul className="divide-y divide-line/70">
                  {requests.slice(0, 7).map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                      <span className="w-10 text-faint tabular">#{r.id}</span>
                      <DecisionBadge decision={r.decision} />
                      <span className="min-w-0 flex-1 truncate">{near(r.amount)} to <Mono>{short(r.recipient, 14)}</Mono></span>
                      <span className="text-dim">{reasonText(r.reason)}</span>
                      <span className="w-20 text-right text-xs text-faint">{ago(r.created_at_ms)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title="Recent security events" action={<Link href="/console/security" className="text-sm text-dim hover:text-fg">Security</Link>}>
            {risk.length === 0 ? (
              <Empty title="No incidents">Blocked attempts will appear here with an explanation.</Empty>
            ) : (
              <ul className="space-y-2">
                {risk.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <Badge tone={e.severity === "low" ? "neutral" : e.severity === "medium" ? "hold" : "block"}>{e.severity}</Badge>
                    <span className="text-dim">{e.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {updatedAt && <p className="mt-4 text-xs text-faint">Updated {ago(updatedAt)} from the contract.</p>}
        </>
      )}
    </>
  );
}
