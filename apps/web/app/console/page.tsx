"use client";
import Link from "next/link";
import { ArrowUpRight, Bot, FileLock2, ShieldAlert, ShieldCheck, ShieldX, Wallet } from "lucide-react";
import { effectiveCapsuleStatus, type RequestRecord } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useNow } from "@/lib/useNow";
import { CONTRACT_ID, NETWORK_ID, accountUrl } from "@/lib/config";
import { PageTitle, EmergencyStop } from "@/components/ConsoleShell";
import { Badge, Empty, ListSkeleton, Mono, Notice, Panel, Stat, StatSkeletons, cx } from "@/components/ui";
import { ago, near, short, REASON_TEXT } from "@/lib/format";

function feedLine(r: RequestRecord) {
  if (r.status === "PendingReview") return { tone: "hold" as const, title: "Waiting for your approval", icon: ShieldAlert };
  if (r.decision === "Approved") return { tone: "pass" as const, title: r.status === "Executed" ? "Payment approved and sent" : r.status === "TransferFailed" ? "Approved, transfer failed and refunded" : "Payment approved, settling", icon: ShieldCheck };
  return { tone: "block" as const, title: `Blocked: ${(REASON_TEXT[r.reason] ?? r.reason).toLowerCase()}`, icon: ShieldX };
}

export default function Overview() {
  const { overview, agents, capsules, requests, risk, error, loading } = useVault();
  const now = useNow(5000);
  const activeCapsules = capsules.filter((c) => effectiveCapsuleStatus(c, now) === "Active");
  const pending = requests.filter((r) => r.status === "PendingReview");
  const alerts = risk.filter((r) => r.severity === "critical" || r.severity === "high");

  return (
    <>
      <PageTitle title="Security overview">Everything here is read live from your Sentinel vault on NEAR. Nothing on this page is simulated.</PageTitle>
      {error && <div className="mb-4"><Notice tone="block">{error}</Notice></div>}

      {loading && !overview ? (
        <div className="space-y-4"><StatSkeletons /><Panel title="Live security monitor"><ListSkeleton rows={5} /></Panel></div>
      ) : overview ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Protected funds" icon={<Wallet className="size-4" />} value={near(BigInt(overview.vault_balance) + BigInt(overview.total_reserved), 3)} sub={BigInt(overview.total_reserved) > 0n ? `${near(overview.total_reserved, 3)} reserved for payments in progress` : "Held by the vault contract"} />
            <Stat label="Active agents" icon={<Bot className="size-4" />} value={agents.filter((a) => a.status === "Active").length} sub={`${agents.length} registered in total`} />
            <Stat label="Active capsules" icon={<FileLock2 className="size-4" />} value={activeCapsules.length} sub={`${overview.capsule_count} created in total`} />
            <Stat label="Attacks blocked" icon={<ShieldX className="size-4" />} tone={overview.blocked_total ? "block" : undefined} value={overview.blocked_total} sub={`${overview.executed_total} payment${overview.executed_total === 1 ? "" : "s"} approved and sent`} />
          </div>

          {pending.length > 0 && (
            <Link href="/console/approvals" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-hold/40 bg-hold/8 px-4 py-3 text-sm text-hold hover:bg-hold/12">
              <span className="flex items-center gap-2"><ShieldAlert className="size-4" />{pending.length} payment{pending.length > 1 ? "s are" : " is"} waiting for your approval. The funds are reserved until you decide.</span>
              <ArrowUpRight className="size-4 shrink-0" />
            </Link>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Panel
              title={<span className="flex items-center gap-2"><span className="live-dot size-2 rounded-full bg-pass" aria-hidden />Live security monitor</span>}
              description="Every payment your agents ask for, and what the contract decided."
              action={<Link href="/console/transactions" className="text-sm text-dim hover:text-fg">All transactions</Link>}
            >
              {requests.length === 0 ? (
                <Empty title="No agent activity yet" icon={<ShieldCheck className="size-6" />}>
                  Requests appear here the moment an agent asks to pay. Try the <Link className="text-[#8fb6ff]" href="/console/attack-lab">Attack lab</Link> to see one.
                </Empty>
              ) : (
                <ol className="relative space-y-1">
                  {requests.slice(0, 10).map((r) => {
                    const f = feedLine(r);
                    const Icon = f.icon;
                    return (
                      <li key={r.id}>
                        <Link href={`/console/transactions/${r.id}`} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-raised/60">
                          <Icon className={cx("mt-0.5 size-5 shrink-0", f.tone === "pass" && "text-pass", f.tone === "block" && "text-block", f.tone === "hold" && "text-hold")} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                              <span className="font-medium">{f.title}</span>
                              <span className="text-xs text-faint">{ago(r.created_at_ms)}</span>
                            </div>
                            <p className="truncate text-sm text-dim"><Mono>{short(r.agent_id, 16)}</Mono> asked to send {near(r.amount)} to <Mono>{short(r.recipient, 18)}</Mono></p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel title="Vault status">
                <div className="space-y-4">
                  {overview.frozen
                    ? <Notice tone="hold">Frozen. Agents can't move any funds until you unfreeze.</Notice>
                    : <Notice tone="pass">Protected. Agents can only pay within the capsules you signed.</Notice>}
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-dim">Available</dt><dd className="tabular">{near(overview.vault_balance)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Reserved</dt><dd className="tabular">{near(overview.total_reserved)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Failed and refunded</dt><dd className="tabular">{overview.failed_total}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Owner</dt><dd><Mono>{short(overview.owner, 14)}</Mono></dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Network</dt><dd>NEAR {NETWORK_ID}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-dim">Contract</dt><dd><a href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer" className="text-[#8fb6ff] hover:underline"><Mono>{short(CONTRACT_ID, 14)}</Mono></a></dd></div>
                  </dl>
                  <EmergencyStop />
                </div>
              </Panel>

              <Panel title="Security alerts" action={<Link href="/console/security" className="text-sm text-dim hover:text-fg">Security</Link>}>
                {alerts.length === 0 ? (
                  <p className="text-sm text-dim">No serious incidents. Blocked attacks with high or critical severity appear here.</p>
                ) : (
                  <ul className="space-y-3">
                    {alerts.slice(0, 4).map((e) => (
                      <li key={e.id} className="text-sm">
                        <div className="flex items-center gap-2"><Badge tone="block">{e.severity}</Badge><span className="text-xs text-faint">{ago(e.atMs)}</span></div>
                        <p className="mt-1 text-dim">{e.summary}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
