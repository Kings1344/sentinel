"use client";
import { agentRiskScore } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { PageTitle } from "@/components/ConsoleShell";
import { Badge, Empty, Mono, Panel } from "@/components/ui";
import { AgentStatusBadge } from "@/components/status";
import { ago } from "@/lib/format";

const KIND: Record<string, string> = {
  recipient_substitution: "Recipient substitution", asset_substitution: "Asset substitution", operation_substitution: "Operation substitution",
  amount_manipulation: "Amount manipulation", limit_exhaustion: "Total limit exceeded", replay: "Replay", nonce_anomaly: "Nonce anomaly",
  post_revocation_activity: "Activity after revocation", revoked_capsule_use: "Revoked capsule used", expired_capsule_use: "Expired capsule used",
  capsule_hijack: "Another agent's capsule", repeated_violations: "Repeated violations",
};

export default function SecurityPage() {
  const { risk, agents, requests, audit } = useVault();
  return (
    <>
      <PageTitle title="Security">Patterns detected in the contract's request history, and the contract's own audit log. Risk scores are heuristics for triage; they never approve or block anything.</PageTitle>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel title="Security events">
          {risk.length === 0 ? <Empty title="No events">Intent mismatches, replays and post-revocation activity show up here.</Empty> : (
            <ul className="divide-y divide-line/70">
              {risk.map((e) => (
                <li key={e.id} className="flex gap-3 py-2.5 text-sm">
                  <Badge tone={e.severity === "low" ? "neutral" : e.severity === "medium" ? "hold" : "block"}>{e.severity}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{KIND[e.kind] ?? e.kind} <span className="font-normal text-faint">· request {e.requestIds.map((i) => `#${i}`).join(", ")} · {ago(e.atMs)}</span></div>
                    <p className="text-dim">{e.summary}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Agent risk">
          {agents.length === 0 ? <Empty title="No agents" /> : (
            <ul className="space-y-3">
              {agents.map((a) => {
                const score = agentRiskScore(a.account_id, requests, risk);
                return (
                  <li key={a.account_id} className="text-sm">
                    <div className="flex items-center justify-between gap-2"><Mono>{a.account_id}</Mono><AgentStatusBadge status={a.status} /></div>
                    <div className="mt-1.5 h-1.5 rounded bg-raised" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={`Risk score for ${a.account_id}`}>
                      <div className={score >= 60 ? "h-full rounded bg-block" : score >= 25 ? "h-full rounded bg-hold" : "h-full rounded bg-pass"} style={{ width: `${Math.max(score, 2)}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-faint">Score {score} of 100</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
      <Panel title="Contract audit log" className="mt-4">
        {audit.length === 0 ? <Empty title="No audit events" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-line text-left text-dim"><th scope="col" className="py-2 pr-3 font-medium">#</th><th scope="col" className="py-2 pr-3 font-medium">Event</th><th scope="col" className="py-2 pr-3 font-medium">Actor</th><th scope="col" className="py-2 pr-3 font-medium">Detail</th><th scope="col" className="py-2 font-medium">When</th></tr></thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.seq} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-3 text-faint tabular">{e.seq}</td>
                    <td className="py-2 pr-3"><Mono>{e.kind}</Mono></td>
                    <td className="py-2 pr-3"><Mono className="text-dim">{e.actor}</Mono></td>
                    <td className="py-2 pr-3 text-dim">{e.detail}</td>
                    <td className="py-2 whitespace-nowrap text-faint">{ago(e.timestamp_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-faint">The contract keeps the latest 500 audit events in a ring buffer. Full history is in the NEP-297 event logs of each transaction.</p>
      </Panel>
    </>
  );
}
