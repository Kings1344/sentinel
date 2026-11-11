"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Radar, Search } from "lucide-react";
import { agentRiskScore, type Severity } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { PageTitle } from "@/components/ConsoleShell";
import { Badge, Empty, Input, ListSkeleton, Meter, Mono, Panel, Select, cx } from "@/components/ui";
import { AgentStatusBadge, reasonText } from "@/components/status";
import { ago, near } from "@/lib/format";

const KIND: Record<string, string> = {
  recipient_substitution: "Recipient substitution", asset_substitution: "Asset substitution", operation_substitution: "Operation substitution",
  amount_manipulation: "Amount manipulation", limit_exhaustion: "Total limit exceeded", replay: "Replay attempt", nonce_anomaly: "Out-of-order request",
  post_revocation_activity: "Activity after revocation", revoked_capsule_use: "Revoked capsule used", expired_capsule_use: "Expired capsule used",
  capsule_hijack: "Used another agent's capsule", repeated_violations: "Repeated violations",
};
const SEV_TONE: Record<Severity, "neutral" | "hold" | "block"> = { low: "neutral", medium: "hold", high: "block", critical: "block" };
const SEV_DOT: Record<Severity, string> = { low: "bg-faint", medium: "bg-hold", high: "bg-block", critical: "bg-block ring-4 ring-block/20" };

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

  return (
    <>
      <PageTitle title="Security">Incidents found in your agents' request history, and the contract's own audit log. Risk scores help you decide where to look. They never approve or block anything; the contract does that.</PageTitle>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_220px]">
        <label className="relative">
          <span className="sr-only">Search incidents</span>
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-faint" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search incidents, recipients, agents" className="pl-9" />
        </label>
        <label><span className="sr-only">Severity</span>
          <Select value={sev} onChange={(e) => setSev(e.target.value as "all" | Severity)}>
            <option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </Select>
        </label>
        <label><span className="sr-only">Agent</span>
          <Select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="all">All agents</option>
            {agents.map((a) => <option key={a.account_id} value={a.account_id}>{a.label}</option>)}
          </Select>
        </label>
      </div>

      {loading && !overview ? <ListSkeleton rows={6} /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title="Incident timeline" description={`${events.length} incident${events.length === 1 ? "" : "s"}${sev !== "all" || agent !== "all" || needle ? " match your filters" : ""}`}>
            {events.length === 0 ? <Empty title={risk.length ? "No incidents match" : "No incidents"} icon={<Radar className="size-6" />}>{risk.length ? "Clear the search or filters to see everything." : "When an agent is blocked, the incident and its explanation appear here."}</Empty> : (
              <ol className="relative ml-1 border-l border-line pl-6">
                {events.map((e) => (
                  <li key={e.id} className="relative pb-5 last:pb-0">
                    <span className={cx("absolute top-1.5 -left-[29px] size-2.5 rounded-full", SEV_DOT[e.severity])} aria-hidden />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{KIND[e.kind] ?? e.kind}</span>
                      <Badge tone={SEV_TONE[e.severity]}>{e.severity}</Badge>
                      <span className="text-xs text-faint">{ago(e.atMs)}</span>
                    </div>
                    <p className="mt-1 text-sm text-dim">{e.summary}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                      {e.requestIds.map((id) => <Link key={id} href={`/console/transactions/${id}`} className="text-[#8fb6ff] hover:underline">Transaction #{id}</Link>)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Agent behaviour">
            {agents.length === 0 ? <p className="text-sm text-dim">No agents registered.</p> : (
              <ul className="space-y-5">
                {agents.map((a) => {
                  const score = agentRiskScore(a.account_id, requests, risk);
                  const kinds = risk.filter((e) => e.agentId === a.account_id && e.kind !== "repeated_violations").map((e) => e.kind);
                  const top = Object.entries(kinds.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {})).sort((x, y) => y[1] - x[1])[0];
                  const last = requests.find((r) => r.agent_id === a.account_id);
                  return (
                    <li key={a.account_id} className="text-sm">
                      <div className="flex items-center justify-between gap-2"><span className="font-medium">{a.label}</span><AgentStatusBadge status={a.status} /></div>
                      <Mono className="text-xs text-faint">{a.account_id}</Mono>
                      <div className="mt-2 flex items-center gap-3"><Meter value={score} tone={score >= 60 ? "block" : score >= 25 ? "hold" : "pass"} label={`Risk score for ${a.account_id}`} /><span className="w-12 text-right text-xs tabular text-dim">{score}/100</span></div>
                      <p className="mt-1.5 text-dim">{a.approved_count} approved, {a.blocked_count} blocked.{top ? ` Most common: ${(KIND[top[0]] ?? top[0]).toLowerCase()} (${top[1]}).` : ""}{last ? ` Last active ${ago(last.created_at_ms)}.` : ""}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Blocked transactions" className="lg:col-span-2" padded={false}>
            {blocked.length === 0 ? <div className="p-5"><Empty title="No blocked transactions" /></div> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="border-b border-line text-left text-dim"><th scope="col" className="px-5 py-2.5 font-medium">#</th><th scope="col" className="py-2.5 pr-3 font-medium">What was attempted</th><th scope="col" className="py-2.5 pr-3 font-medium">Why it was stopped</th><th scope="col" className="py-2.5 pr-5 font-medium">When</th></tr></thead>
                  <tbody>
                    {blocked.map((r) => (
                      <tr key={r.id} className="border-b border-line/60 last:border-0">
                        <td className="px-5 py-2.5"><Link href={`/console/transactions/${r.id}`} className="text-[#8fb6ff] hover:underline tabular">#{r.id}</Link></td>
                        <td className="py-2.5 pr-3">{near(r.amount)} to <Mono>{r.recipient}</Mono></td>
                        <td className="py-2.5 pr-3 text-block">{reasonText(r.reason)}</td>
                        <td className="py-2.5 pr-5 whitespace-nowrap text-faint">{ago(r.created_at_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Contract audit log" description="The last 500 events recorded by the vault contract itself." className="lg:col-span-2" padded={false}>
            {audit.length === 0 ? <div className="p-5"><Empty title="No audit events" /></div> : (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="sticky top-0 bg-panel"><tr className="border-b border-line text-left text-dim"><th scope="col" className="px-5 py-2.5 font-medium">#</th><th scope="col" className="py-2.5 pr-3 font-medium">Event</th><th scope="col" className="py-2.5 pr-3 font-medium">By</th><th scope="col" className="py-2.5 pr-3 font-medium">Detail</th><th scope="col" className="py-2.5 pr-5 font-medium">When</th></tr></thead>
                  <tbody>
                    {audit.map((e) => (
                      <tr key={e.seq} className="border-b border-line/60 align-top last:border-0">
                        <td className="px-5 py-2.5 text-faint tabular">{e.seq}</td>
                        <td className="py-2.5 pr-3">{e.kind.replace(/_/g, " ")}</td>
                        <td className="py-2.5 pr-3"><Mono className="text-dim">{e.actor}</Mono></td>
                        <td className="py-2.5 pr-3 text-dim">{e.detail}</td>
                        <td className="py-2.5 pr-5 whitespace-nowrap text-faint">{ago(e.timestamp_ms)}</td>
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
