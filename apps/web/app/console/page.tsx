"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Bot, FileLock2, FlaskConical, Hourglass, ShieldAlert, ShieldCheck, ShieldX, Snowflake, Wallet } from "lucide-react";
import { effectiveCapsuleStatus, type RequestRecord } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useNow } from "@/lib/useNow";
import { CONTRACT_ID, accountUrl } from "@/lib/config";
import { PageTitle, EmergencyStop } from "@/components/ConsoleShell";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { requestState } from "@/components/status";
import { Badge, buttonStyles, Empty, ListSkeleton, MetricCard, MetricSkeletons, Mono, Notice, Panel, Row, Segmented } from "@/components/ui";
import { ago, near, short } from "@/lib/format";

type FeedFilter = "all" | "pass" | "block" | "hold";

export default function Overview() {
  const { overview, agents, capsules, requests, risk, error, loading } = useVault();
  const now = useNow(5000);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const activeCapsules = capsules.filter((c) => effectiveCapsuleStatus(c, now) === "Active");
  const pending = requests.filter((r) => r.status === "PendingReview");
  const alerts = risk.filter((r) => r.severity === "critical" || r.severity === "high");
  const toneOf = (r: RequestRecord) => { const t = requestState(r).tone; return t === "signal" ? "pass" : t; };
  const feed = requests.filter((r) => filter === "all" || toneOf(r) === filter).slice(0, 8);

  return (
    <>
      <PageTitle
        title="Security overview"
        action={<Link href="/console/attack-lab" className={buttonStyles()}><FlaskConical className="size-4" />Open attack lab</Link>}
      >
        Live state of your Sentinel vault on NEAR. Every number here is read from the contract.
      </PageTitle>

      {error && <div className="mb-6"><Notice tone="block" title="Can't read the vault right now">{error}</Notice></div>}

      {loading && !overview ? (
        <div className="space-y-6"><MetricSkeletons /><Panel title="Live security monitor"><ListSkeleton rows={5} /></Panel></div>
      ) : overview ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:gap-5 xl:grid-cols-4">
            <MetricCard label="Protected funds" icon={<Wallet className="size-4" />} value={near(BigInt(overview.vault_balance) + BigInt(overview.total_reserved), 3)}
              footnote={BigInt(overview.total_reserved) > 0n ? `${near(overview.total_reserved, 3)} reserved for payments in progress` : "Held by the vault contract"} />
            <MetricCard label="Active agents" icon={<Bot className="size-4" />} value={agents.filter((a) => a.status === "Active").length} footnote={`${agents.length} registered`} />
            <MetricCard label="Active capsules" icon={<FileLock2 className="size-4" />} value={activeCapsules.length} footnote={`${overview.capsule_count} created`} />
            <MetricCard label="Attacks blocked" tone={overview.blocked_total ? "block" : undefined} icon={<ShieldX className="size-4" />} value={overview.blocked_total}
              footnote={`${overview.executed_total} legitimate payment${overview.executed_total === 1 ? "" : "s"} sent`} />
          </div>

          {pending.length > 0 && (
            <Link href="/console/approvals" className="flex items-center gap-4 rounded-[14px] border border-hold/30 bg-hold/[0.07] px-5 py-4 transition-colors hover:bg-hold/10">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-hold/30 bg-hold/10 text-[#fbbf24]"><Hourglass className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg">{pending.length} payment{pending.length > 1 ? "s need" : " needs"} your approval</div>
                <div className="text-[13px] text-dim">The funds stay reserved in the vault until you approve or reject.</div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-[#fbbf24]" />
            </Link>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel
              padded={false}
              title={<span className="flex items-center gap-2.5">Live security monitor<span className="inline-flex items-center gap-1.5 rounded-full border border-pass/25 bg-pass/10 px-2 py-0.5 text-xs font-medium text-[#34d399]"><span className="live-dot size-1.5 rounded-full bg-pass" />Live</span></span>}
              description="Every payment your agents ask for, and what the contract decided."
              action={<Link href="/console/transactions" className="text-[13px] font-medium text-link hover:underline">View all</Link>}
            >
              <div className="border-b border-line px-5 py-3 sm:px-6">
                <Segmented label="Filter activity" value={filter} onChange={setFilter} options={[
                  { value: "all", label: "All", count: requests.length },
                  { value: "pass", label: "Approved", count: requests.filter((r) => toneOf(r) === "pass").length },
                  { value: "block", label: "Blocked", count: requests.filter((r) => toneOf(r) === "block").length },
                  { value: "hold", label: "Needs attention", count: requests.filter((r) => toneOf(r) === "hold").length },
                ]} />
              </div>
              <div className="p-1.5 sm:p-2">
                {requests.length === 0 ? (
                  <Empty title="No agent activity yet" icon={<ShieldCheck className="size-5" />} action={<Link href="/console/attack-lab" className={buttonStyles("secondary", "sm")}>Run a test in the attack lab</Link>}>
                    Requests appear here the moment an agent asks to pay.
                  </Empty>
                ) : feed.length === 0 ? (
                  <Empty title="Nothing in this view">No requests match this filter.</Empty>
                ) : <ActivityTimeline requests={feed} />}
              </div>
            </Panel>

            <div className="space-y-6">
              <Panel title="Vault status" padded={false}>
                <div className="p-5 sm:p-6">
                  <div className="flex items-center gap-4">
                    <span className={overview.frozen ? "grid size-12 shrink-0 place-items-center rounded-xl border border-hold/30 bg-hold/10 text-[#fbbf24]" : "grid size-12 shrink-0 place-items-center rounded-xl border border-pass/30 bg-pass/10 text-[#34d399]"}>
                      {overview.frozen ? <Snowflake className="size-6" /> : <ShieldCheck className="size-6" />}
                    </span>
                    <div className="min-w-0">
                      <div className={overview.frozen ? "text-lg font-semibold tracking-[-0.01em] text-[#fbbf24]" : "text-lg font-semibold tracking-[-0.01em] text-[#34d399]"}>{overview.frozen ? "Frozen" : "Protected"}</div>
                      <div className="text-[13px] leading-snug text-dim">{overview.frozen ? "No agent can move funds until you unfreeze." : "Agents can only pay within capsules you signed."}</div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-[13px] text-dim">Available balance</div>
                    <div className="mt-1 text-[28px] leading-none font-semibold tracking-[-0.03em] tabular">{near(overview.vault_balance, 3)}</div>
                    {(() => {
                      const avail = BigInt(overview.vault_balance), res = BigInt(overview.total_reserved), tot = avail + res;
                      const pct = tot > 0n ? Number((avail * 1000n) / tot) / 10 : 100;
                      return (
                        <>
                          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                            <div className="h-full bg-pass" style={{ width: `${pct}%` }} />
                            {res > 0n && <div className="h-full bg-hold" style={{ width: `${100 - pct}%` }} />}
                          </div>
                          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[13px]">
                            <span className="flex items-center gap-1.5 text-dim"><span className="size-2 rounded-full bg-pass" />Available</span>
                            <span className="flex items-center gap-1.5 text-dim"><span className="size-2 rounded-full bg-hold" />Reserved {near(overview.total_reserved, 3)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <dl className="divide-y divide-line/70 border-y border-line px-5 sm:px-6">
                  <Row label="Active capsules"><span className="tabular">{activeCapsules.length}</span></Row>
                  <Row label="Awaiting approval"><span className={pending.length ? "text-[#fbbf24] tabular" : "tabular"}>{pending.length}</span></Row>
                  <Row label="Payments sent"><span className="tabular">{overview.executed_total}</span></Row>
                  <Row label="Failed and refunded"><span className="tabular">{overview.failed_total}</span></Row>
                  <Row label="Owner"><Mono>{short(overview.owner, 18)}</Mono></Row>
                  <Row label="Contract"><a href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer" className="text-link hover:underline"><Mono>{short(CONTRACT_ID, 18)}</Mono></a></Row>
                </dl>
                <div className="p-5 sm:p-6"><EmergencyStop block /><p className="mt-2.5 text-center text-[13px] text-faint">Stops every agent payment instantly.</p></div>
              </Panel>

              <Panel title="Security alerts" action={<Link href="/console/security" className="text-[13px] font-medium text-link hover:underline">Investigate</Link>}>
                {alerts.length === 0 ? (
                  <div className="flex items-center gap-3 text-sm text-dim"><ShieldCheck className="size-5 shrink-0 text-[#34d399]" />No serious incidents detected.</div>
                ) : (
                  <ul className="space-y-4">
                    {alerts.slice(0, 4).map((e) => (
                      <li key={e.id} className="flex gap-3">
                        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ff7b7b]" aria-hidden />
                        <div className="min-w-0 text-sm">
                          <div className="flex flex-wrap items-center gap-2"><Badge tone="block">{e.severity === "critical" ? "Critical" : "High"}</Badge><span className="text-[13px] text-faint">{ago(e.atMs)}</span></div>
                          <p className="mt-1.5 leading-relaxed text-dim">{e.summary}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
