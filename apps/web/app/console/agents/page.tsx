"use client";
import Link from "next/link";
import { useState } from "react";
import { Bot } from "lucide-react";
import { agentRiskScore, effectiveCapsuleStatus, isValidAccountId } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { useNow } from "@/lib/useNow";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { useConfirm } from "@/components/Overlays";
import { Button, Empty, Field, Input, ListSkeleton, Meter, Mono, Panel } from "@/components/ui";
import { AgentStatusBadge, DecisionBadge, reasonText } from "@/components/status";
import { ago, near } from "@/lib/format";

export default function AgentsPage() {
  const { agents, requests, risk, capsules, isOwner, loading, overview } = useVault();
  const { call } = useWallet();
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const now = useNow(10000);
  const act = ownerActions(call);
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const idError = agentId && !isValidAccountId(agentId) ? "Enter a NEAR account, like my-agent.testnet." : undefined;

  return (
    <>
      <PageTitle title="AI agents">Each agent is its own NEAR account. It can ask the vault to pay, but it never holds your keys or your funds.</PageTitle>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {loading && !overview ? <ListSkeleton rows={3} /> : agents.length === 0 ? (
            <Empty title="No agents yet" icon={<Bot className="size-6" />}>Register the account your AI agent signs with. Then give it a capsule describing what it may pay.</Empty>
          ) : agents.map((a) => {
            const mine = requests.filter((r) => r.agent_id === a.account_id);
            const score = agentRiskScore(a.account_id, requests, risk);
            const live = capsules.filter((c) => c.agent_id === a.account_id && effectiveCapsuleStatus(c, now) === "Active");
            return (
              <article key={a.account_id} className="rounded-xl border border-line/80 bg-panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-lg bg-raised"><Bot className="size-5 text-dim" aria-hidden /></div>
                    <div>
                      <h2 className="font-semibold">{a.label}</h2>
                      <Mono className="text-dim">{a.account_id}</Mono>
                    </div>
                  </div>
                  <AgentStatusBadge status={a.status} />
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div><div className="text-xs text-faint">Approved</div><div className="text-lg font-semibold tabular text-pass">{a.approved_count}</div></div>
                  <div><div className="text-xs text-faint">Blocked</div><div className="text-lg font-semibold tabular text-block">{a.blocked_count}</div></div>
                  <div>
                    <div className="flex justify-between text-xs text-faint"><span>Risk</span><span className="tabular">{score}/100</span></div>
                    <div className="mt-2"><Meter value={score} tone={score >= 60 ? "block" : score >= 25 ? "hold" : "pass"} label={`Risk score ${score} of 100`} /></div>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-medium">What it's allowed to do</h3>
                  {live.length === 0 ? <p className="mt-1 text-sm text-dim">No active capsule, so it can't pay anyone. <Link href="/console/capsules" className="text-[#8fb6ff]">Create one</Link>.</p> : (
                    <ul className="mt-1.5 space-y-1 text-sm text-dim">
                      {live.map((c) => <li key={c.id}>Capsule #{c.id}: pay <Mono>{c.recipient}</Mono> up to {near(c.max_per_tx)} each, {near(BigInt(c.max_total) - BigInt(c.spent) - BigInt(c.reserved))} left, expires {ago(c.expires_at_ms)}</li>)}
                    </ul>
                  )}
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-medium">Recent activity</h3>
                  {mine.length === 0 ? <p className="mt-1 text-sm text-dim">No requests yet.</p> : (
                    <ul className="mt-1.5 space-y-1.5 text-sm">
                      {mine.slice(0, 4).map((r) => (
                        <li key={r.id}><Link href={`/console/transactions/${r.id}`} className="flex flex-wrap items-center gap-2 hover:underline">
                          <DecisionBadge decision={r.decision} /><span>{near(r.amount)} to <Mono>{r.recipient}</Mono></span><span className="text-dim">{reasonText(r.reason)}</span><span className="text-xs text-faint">{ago(r.created_at_ms)}</span>
                        </Link></li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-line/70 pt-4">
                  {a.status === "Active" && <Button disabled={!isOwner} busy={busy === `s-${a.account_id}`} onClick={() => run(`s-${a.account_id}`, "Freeze agent", () => act.suspendAgent(a.account_id))}>Freeze agent</Button>}
                  {a.status === "Suspended" && <Button disabled={!isOwner} busy={busy === `r-${a.account_id}`} onClick={() => run(`r-${a.account_id}`, "Unfreeze agent", () => act.resumeAgent(a.account_id))}>Unfreeze agent</Button>}
                  {a.status !== "Revoked" && <Button variant="danger" disabled={!isOwner} busy={busy === `v-${a.account_id}`} onClick={async () => {
                    if (await confirm({ title: `Revoke ${a.account_id}?`, body: "The agent loses access immediately and all of its capsules are cancelled for good. You can reinstate the agent later, but you'll need to create new capsules.", confirmLabel: "Revoke agent", tone: "danger" }))
                      run(`v-${a.account_id}`, "Revoke agent", () => act.revokeAgent(a.account_id));
                  }}>Revoke</Button>}
                  {a.status === "Revoked" && <Button disabled={!isOwner} busy={busy === `i-${a.account_id}`} onClick={() => run(`i-${a.account_id}`, "Reinstate agent", () => act.reinstateAgent(a.account_id))}>Reinstate</Button>}
                </div>
                <p className="mt-2 text-xs text-faint">Freezing pauses this agent and keeps its capsules. Revoking cancels them permanently.</p>
              </article>
            );
          })}
          <OwnerHint />
        </div>

        <Panel title="Register an agent" className="h-fit">
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            if (idError || !agentId || !label.trim()) return;
            const r = await run("register", "Register agent", () => act.registerAgent(agentId.trim(), label.trim()));
            if (r) { setAgentId(""); setLabel(""); }
          }}>
            <Field label="Agent account" error={idError} hint="The NEAR account your agent signs with. Give it a key that can only call request_transfer.">
              <Input value={agentId} onChange={(e) => setAgentId(e.target.value.toLowerCase())} placeholder="my-agent.testnet" autoComplete="off" />
            </Field>
            <Field label="Name"><Input value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} placeholder="Invoice payer" /></Field>
            <Button variant="primary" type="submit" disabled={!isOwner || !!idError || !agentId || !label.trim()} busy={busy === "register"}>Register agent</Button>
            <p className="text-xs text-faint">Your wallet asks for full confirmation. Anything that gives an agent more power does.</p>
          </form>
        </Panel>
      </div>
    </>
  );
}
