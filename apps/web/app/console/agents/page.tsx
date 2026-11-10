"use client";
import { useState } from "react";
import { isValidAccountId } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { Button, Empty, Field, Input, Mono, Panel } from "@/components/ui";
import { AgentStatusBadge, DecisionBadge, reasonText } from "@/components/status";
import { ago, near } from "@/lib/format";
import { agentRiskScore } from "@sentinel/engine";

export default function AgentsPage() {
  const { agents, requests, risk, isOwner } = useVault();
  const { call } = useWallet();
  const { run, busy } = useAction();
  const act = ownerActions(call);
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const idError = agentId && !isValidAccountId(agentId) ? "Enter a NEAR account like my-agent.testnet." : undefined;

  return (
    <>
      <PageTitle title="Agents">Agents are separate NEAR accounts. They can only ask the vault for transfers; they never hold your keys or the vault's funds.</PageTitle>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title="Registered agents">
          {agents.length === 0 ? (
            <Empty title="No agents yet">Register the account your agent signs with.</Empty>
          ) : (
            <ul className="divide-y divide-line/70">
              {agents.map((a) => {
                const mine = requests.filter((r) => r.agent_id === a.account_id);
                const score = agentRiskScore(a.account_id, requests, risk);
                const open = selected === a.account_id;
                return (
                  <li key={a.account_id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{a.label}</div>
                        <Mono className="text-dim">{a.account_id}</Mono>
                      </div>
                      <AgentStatusBadge status={a.status} />
                      <span className="text-sm text-dim tabular">{a.approved_count} approved · {a.blocked_count} stopped · risk {score}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button onClick={() => setSelected(open ? null : a.account_id)}>{open ? "Hide activity" : "Show activity"}</Button>
                      {a.status === "Active" && <Button disabled={!isOwner} busy={busy === `s-${a.account_id}`} onClick={() => run(`s-${a.account_id}`, "Suspend agent", () => act.suspendAgent(a.account_id))}>Suspend</Button>}
                      {a.status === "Suspended" && <Button disabled={!isOwner} busy={busy === `r-${a.account_id}`} onClick={() => run(`r-${a.account_id}`, "Resume agent", () => act.resumeAgent(a.account_id))}>Resume</Button>}
                      {a.status !== "Revoked" && <Button variant="danger" disabled={!isOwner} busy={busy === `v-${a.account_id}`} onClick={() => { if (confirm(`Revoke ${a.account_id}? All of its capsules are revoked permanently.`)) run(`v-${a.account_id}`, "Revoke agent", () => act.revokeAgent(a.account_id)); }}>Revoke</Button>}
                      {a.status === "Revoked" && <Button disabled={!isOwner} busy={busy === `i-${a.account_id}`} onClick={() => run(`i-${a.account_id}`, "Reinstate agent", () => act.reinstateAgent(a.account_id))}>Reinstate</Button>}
                    </div>
                    {open && (
                      <div className="mt-3 rounded-md border border-line p-3">
                        <p className="mb-2 text-sm text-dim">Registered {ago(a.registered_at_ms)}. Capsules: {a.capsule_ids.length ? a.capsule_ids.map((id) => `#${id}`).join(", ") : "none"}.</p>
                        {mine.length === 0 ? <p className="text-sm text-dim">No requests from this agent.</p> : (
                          <ul className="space-y-1.5 text-sm">
                            {mine.slice(0, 10).map((r) => (
                              <li key={r.id} className="flex flex-wrap items-center gap-2">
                                <span className="text-faint tabular">#{r.id}</span><DecisionBadge decision={r.decision} />
                                <span>{near(r.amount)} → <Mono>{r.recipient}</Mono></span>
                                <span className="text-dim">{reasonText(r.reason)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3"><OwnerHint /></div>
        </Panel>

        <Panel title="Register an agent">
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (idError || !agentId || !label.trim()) return;
              const r = await run("register", "Register agent", () => act.registerAgent(agentId.trim(), label.trim()));
              if (r) { setAgentId(""); setLabel(""); }
            }}
          >
            <Field label="Agent account" error={idError} hint="The account the agent signs with. Create it first, then give the agent a function-call key limited to request_transfer.">
              <Input value={agentId} onChange={(e) => setAgentId(e.target.value.toLowerCase())} placeholder="my-agent.testnet" autoComplete="off" />
            </Field>
            <Field label="Name">
              <Input value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} placeholder="Invoice payer" />
            </Field>
            <Button variant="primary" type="submit" disabled={!isOwner || !!idError || !agentId || !label.trim()} busy={busy === "register"}>Register agent</Button>
            <p className="text-xs text-faint">Your wallet asks you to confirm and attaches 1 yoctoNEAR. Any action that gives an agent more power needs that confirmation.</p>
          </form>
        </Panel>
      </div>
    </>
  );
}
