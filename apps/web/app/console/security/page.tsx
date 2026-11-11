"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, Radar, ScrollText, Search, ShieldX } from "lucide-react";
import { agentRiskScore, type Severity } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { PageTitle } from "@/components/ConsoleShell";
import { Badge, Empty, Input, ListSkeleton, MetricCard, Meter, Mono, Panel, Segmented, Select, cx } from "@/components/ui";
import { AgentStatusBadge, StatusPill, reasonText } from "@/components/status";
import { ago, near } from "@/lib/format";

const KIND: Record<string, string> = {
  recipient_substitution: "Recipient substitution", asset_substitution: "Asset substitution", operation_substitution: "Operation substitution",
  amount_manipulation: "Amount manipulation", limit_exhaustion: "Total limit exceeded", replay: "Replay attempt", nonce_anomaly: "Out-of-order request",
  post_revocation_activity: "Activity after revocation", revoked_capsule_use: "Revoked capsule used", expired_capsule_use: "Expired capsule used",
  capsule_hijack: "Used another agent's capsule", repeated_violations: "Repeated violations",
};
const SEV_TONE: Record<Severity, "neutral" | "hold" | "block"> = { low: "neutral", medium: "hold", high: "block", critical: "block" };
const SEV_NODE: Record<Severity, string> = {
  low: "border-line-strong bg-raised text-dim", medium: "border-hold/30 bg-hold/10 text-[#fbbf24]",
  high: "border-block/30 bg-block/10 text-[#ff7b7b]", critical: "border-block/50 bg-block/20 text-[#ff7b7b] shadow-[0_0_0_4px_rgb(240_68_68/0.12)]",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function SecurityPage() {
  const { risk, agents, requests, audit, loading, overview } = useVault();
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<"all" | Severity>("all");
  const [agent, setAgent] = useState("all");
  const needle = q.trim().toLowerCase();
  const events = useMemo(() => risk.filter((e) =>
    (sev === "all" || e.severity === sev) && (agent === "all" || e.agentId === agent) &&
    (!needle || `${e.summary} ${KIND[e.kind] ?? e.kind} ${e.agentId}`.toLowerCase().includes(needle)),
  ), [risk, sev, agent, needle]);
  const blocked = requests.filter((r) => r.decision !== "Approved" && r.decision !== "RequiresHumanReview")
    .filter((r) => (agent === "all" || r.agent_id === agent) && (!needle || `${r.recipient} ${r.agent_id} ${reasonText(r.reason)}`.toLowerCase().includes(needle)));
  const count = (s: Severity) => risk.filter((e) => e.severity === s).length;

  return (
    <>
      <PageTitle title="Security">Incidents found in your agents' request history, and the contract's own audit log. Risk scores help you decide where to look; only the contract approves or blocks.</PageTitle>

      {loading && !overview ? <div className="surface p-6"><ListSkeleton rows={6} /></div> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <MetricCard label="Critical" value={count("critical")} tone={count("critical") ? "block" : undefined} footnote="Needs action now" />
            <MetricCard label="High" value={count("high")} tone={count("high") ? "block" : undefined} footnote="Intent mismatches and replays" />
            <MetricCard label="Medium" value={count("medium")} tone={count("medium") ? "hold" : undefined} footnote="Limit and expiry violations" />
            <MetricCard label="Blocked requests" value={requests.filter((r) => r.decision !== "Approved" && r.decision !== "RequiresHumanReview").length} footnote="No funds moved for these" />
          </div>

          <div className="surface flex flex-wrap items-center gap-3 p-4">
            <label className="relative min-w-[240px] flex-1">
              <span className="sr-only">Search incidents</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search incidents, recipients or agents" className="pl-9" />
            </label>
            <Segmented label="Severity" value={sev} onChange={setSev} options={[{ value: "all", label: "All" }, { value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} />
            <div className="w-full sm:w-52"><Select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent">
              <option value="all">All agents</option>
              {agents.map((a) => <option key={a.account_id} value={a.account_id}>{a.label}</option>)}
            </Select></div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel title="Incident timeline" icon={<Radar className="size-4" />} description={`${events.length} incident${events.length === 1 ? "" : "s"}${sev !== "all" || agent !== "all" || needle ? " match your filters" : ""}`}>
              {events.length === 0 ? <Empty title={risk.length ? "No incidents match" : "No incidents"}>{risk.length ? "Clear the search or filters to see everything." : "When an agent is blocked, the incident and its explanation appear here."}</Empty> : (
                <ol className="relative">
                  {events.map((e, i) => (
                    <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < events.length - 1 && <span className="absolute top-10 bottom-0 left-[17px] w-px bg-line" aria-hidden />}
                      <span className={cx("relative z-10 grid size-9 shrink-0 place-items-center rounded-full border", SEV_NODE[e.severity])}><ShieldX className="size-4" aria-hidden /></span>
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{KIND[e.kind] ?? e.kind}</span>
                          <Badge tone={SEV_TONE[e.severity]}>{cap(e.severity)}</Badge>
                          <span className="text-[13px] text-faint">{ago(e.atMs)}</span>
                        </div>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-dim">{e.summary}</p>
                        <div className="mt-2 flex flex-wrap gap-3">{e.requestIds.map((id) => <Link key={id} href={`/console/transactions/${id}`} className="text-[13px] font-medium text-link hover:underline">Transaction #{id}</Link>)}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel title="Agent behaviour" icon={<Bot className="size-4" />}>
              {agents.length === 0 ? <p className="text-sm text-dim">No agents registered.</p> : (
                <ul className="space-y-6">
                  {agents.map((a) => {
                    const score = agentRiskScore(a.account_id, requests, risk);
                    const kinds = risk.filter((e) => e.agentId === a.account_id && e.kind !== "repeated_violations").map((e) => e.kind);
                    const top = Object.entries(kinds.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {})).sort((x, y) => y[1] - x[1])[0];
                    const last = requests.find((r) => r.agent_id === a.account_id);
                    return (
                      <li key={a.account_id}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0"><div className="text-sm font-semibold">{a.label}</div><Mono className="block truncate text-xs text-faint">{a.account_id}</Mono></div>
                          <AgentStatusBadge status={a.status} />
                        </div>
                        <div className="mt-3 flex items-center gap-3"><Meter value={score} tone={score >= 60 ? "block" : score >= 25 ? "hold" : "pass"} label={`Risk score for ${a.account_id}`} /><span className="w-14 text-right text-[13px] font-medium tabular">{score}<span className="text-faint">/100</span></span></div>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                          <div className="surface-raised px-3 py-2"><dt className="text-faint">Approved</dt><dd className="mt-0.5 font-semibold tabular text-[#34d399]">{a.approved_count}</dd></div>
                          <div className="surface-raised px-3 py-2"><dt className="text-faint">Blocked</dt><dd className="mt-0.5 font-semibold tabular text-[#ff7b7b]">{a.blocked_count}</dd></div>
                        </dl>
                        <p className="mt-3 text-[13px] leading-relaxed text-dim">{top ? `Most common: ${(KIND[top[0]] ?? top[0]).toLowerCase()} (${top[1]}).` : "No violations."}{last ? ` Last active ${ago(last.created_at_ms)}.` : ""}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title="Blocked transactions" icon={<ShieldX className="size-4" />} padded={false}>
            {blocked.length === 0 ? <Empty title="No blocked transactions" /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead><tr className="border-b border-line bg-raised/40 text-left text-[13px] text-dim"><th scope="col" className="py-3 pr-3 pl-6 font-medium">Request</th><th scope="col" className="px-3 py-3 font-medium">Status</th><th scope="col" className="px-3 py-3 font-medium">Attempted</th><th scope="col" className="px-3 py-3 font-medium">Why it was stopped</th><th scope="col" className="py-3 pr-6 pl-3 text-right font-medium">When</th></tr></thead>
                  <tbody>
                    {blocked.map((r) => (
                      <tr key={r.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-hover/40">
                        <td className="py-3 pr-3 pl-6"><Link href={`/console/transactions/${r.id}`} className="font-medium text-link tabular hover:underline">#{r.id}</Link></td>
                        <td className="px-3 py-3"><StatusPill r={r} size="sm" /></td>
                        <td className="px-3 py-3"><span className="tabular">{near(r.amount, 3)}</span> <span className="text-dim">to</span> <Mono>{r.recipient}</Mono></td>
                        <td className="px-3 py-3 text-[#ff9b9b]">{reasonText(r.reason)}</td>
                        <td className="py-3 pr-6 pl-3 text-right whitespace-nowrap text-faint">{ago(r.created_at_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Contract audit log" icon={<ScrollText className="size-4" />} description="The last 500 events recorded by the vault contract itself." padded={false}>
            {audit.length === 0 ? <Empty title="No audit events" /> : (
              <div className="scroll-quiet max-h-[460px] overflow-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="sticky top-0 z-10 bg-panel"><tr className="border-b border-line text-left text-[13px] text-dim"><th scope="col" className="py-3 pr-3 pl-6 font-medium">#</th><th scope="col" className="px-3 py-3 font-medium">Event</th><th scope="col" className="px-3 py-3 font-medium">By</th><th scope="col" className="px-3 py-3 font-medium">Detail</th><th scope="col" className="py-3 pr-6 pl-3 text-right font-medium">When</th></tr></thead>
                  <tbody>
                    {audit.map((e) => (
                      <tr key={e.seq} className="border-b border-line/60 align-top transition-colors last:border-0 hover:bg-hover/40">
                        <td className="py-3 pr-3 pl-6 text-faint tabular">{e.seq}</td>
                        <td className="px-3 py-3 font-medium whitespace-nowrap">{cap(e.kind.replace(/_/g, " "))}</td>
                        <td className="px-3 py-3"><Mono className="text-dim">{e.actor}</Mono></td>
                        <td className="px-3 py-3 leading-relaxed text-dim">{e.detail}</td>
                        <td className="py-3 pr-6 pl-3 text-right whitespace-nowrap text-faint">{ago(e.timestamp_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
