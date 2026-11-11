"use client";
import Link from "next/link";
import { useState } from "react";
import { Bot, KeyRound, Plus } from "lucide-react";
import { agentRiskScore, effectiveCapsuleStatus, isValidAccountId } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { useNow } from "@/lib/useNow";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { useConfirm } from "@/components/Overlays";
import { Button, Empty, Field, Input, ListSkeleton, Meter, Mono, Panel, cx } from "@/components/ui";
import { AgentStatusBadge, StatusPill } from "@/components/status";
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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {loading && !overview ? <div className="surface p-6"><ListSkeleton rows={3} /></div> : agents.length === 0 ? (
            <div className="surface"><Empty title="No agents yet" icon={<Bot className="size-5" />}>Register the account your AI agent signs with, then give it a capsule describing what it may pay.</Empty></div>
          ) : agents.map((a) => {
            const mine = requests.filter((r) => r.agent_id === a.account_id);
            const score = agentRiskScore(a.account_id, requests, risk);
            const live = capsules.filter((c) => c.agent_id === a.account_id && effectiveCapsuleStatus(c, now) === "Active");
            return (
              <article key={a.account_id} className="surface overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-4 p-6">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className={cx("grid size-12 shrink-0 place-items-center rounded-xl border", a.status === "Active" ? "border-pass/25 bg-pass/10 text-[#34d399]" : a.status === "Suspended" ? "border-hold/25 bg-hold/10 text-[#fbbf24]" : "border-block/25 bg-block/10 text-[#ff7b7b]")}><Bot className="size-6" /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="text-[17px] font-semibold tracking-[-0.01em]">{a.label}</h2><AgentStatusBadge status={a.status} /></div>
                      <Mono className="mt-0.5 block text-[13px] text-dim">{a.account_id}</Mono>
                      <div className="mt-1 text-[12.5px] text-faint">Registered {ago(a.registered_at_ms)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.status === "Active" && <Button size="sm" disabled={!isOwner} busy={busy === `s-${a.account_id}`} onClick={() => run(`s-${a.account_id}`, "Freeze agent", () => act.suspendAgent(a.account_id))}>Freeze</Button>}
                    {a.status === "Suspended" && <Button size="sm" disabled={!isOwner} busy={busy === `r-${a.account_id}`} onClick={() => run(`r-${a.account_id}`, "Unfreeze agent", () => act.resumeAgent(a.account_id))}>Unfreeze</Button>}
                    {a.status !== "Revoked" && <Button size="sm" variant="outline-danger" disabled={!isOwner} busy={busy === `v-${a.account_id}`} onClick={async () => {
                      if (await confirm({ title: `Revoke ${a.account_id}?`, body: "The agent loses access immediately and all of its capsules are cancelled for good. You can reinstate it later, but you'll need new capsules.", confirmLabel: "Revoke agent", tone: "danger" }))
                        run(`v-${a.account_id}`, "Revoke agent", () => act.revokeAgent(a.account_id));
                    }}>Revoke</Button>}
                    {a.status === "Revoked" && <Button size="sm" disabled={!isOwner} busy={busy === `i-${a.account_id}`} onClick={() => run(`i-${a.account_id}`, "Reinstate agent", () => act.reinstateAgent(a.account_id))}>Reinstate</Button>}
                  </div>
                </div>

                <div className="grid grid-cols-3 border-y border-line">
                  <div className="px-6 py-4"><div className="text-[13px] text-dim">Approved</div><div className="mt-1 text-2xl font-semibold tracking-[-0.02em] tabular text-[#34d399]">{a.approved_count}</div></div>
                  <div className="border-x border-line px-6 py-4"><div className="text-[13px] text-dim">Blocked</div><div className="mt-1 text-2xl font-semibold tracking-[-0.02em] tabular text-[#ff7b7b]">{a.blocked_count}</div></div>
                  <div className="px-6 py-4">
                    <div className="flex justify-between text-[13px] text-dim"><span>Risk</span><span className="tabular text-fg">{score}<span className="text-faint">/100</span></span></div>
                    <div className="mt-3"><Meter value={score} tone={score >= 60 ? "block" : score >= 25 ? "hold" : "pass"} label={`Risk score ${score} of 100`} /></div>
                  </div>
                </div>

                <div className="grid gap-6 p-6 md:grid-cols-2">
                  <section>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-dim" />Permissions</h3>
                    {live.length === 0 ? <p className="text-[13px] leading-relaxed text-dim">No active capsule, so it can't pay anyone. <Link href="/console/capsules" className="font-medium text-link hover:underline">Create one</Link></p> : (
                      <ul className="space-y-2">
                        {live.map((c) => (
                          <li key={c.id} className="surface-raised p-3 text-[13px] leading-relaxed">
                            <div className="font-medium">Capsule #{c.id}: pay <Mono>{c.recipient}</Mono></div>
                            <div className="text-dim">Up to {near(c.max_per_tx)} each, {near(BigInt(c.max_total) - BigInt(c.spent) - BigInt(c.reserved))} left, expires {ago(c.expires_at_ms)}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section>
                    <h3 className="mb-3 text-sm font-semibold">Recent activity</h3>
                    {mine.length === 0 ? <p className="text-[13px] text-dim">No requests yet.</p> : (
                      <ul className="space-y-1">
                        {mine.slice(0, 4).map((r) => (
                          <li key={r.id}>
                            <Link href={`/console/transactions/${r.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-hover/60">
                              <span className="flex min-w-0 items-center gap-2"><StatusPill r={r} size="sm" /><span className="truncate text-dim">{near(r.amount, 3)} to <Mono>{r.recipient}</Mono></span></span>
                              <span className="shrink-0 text-faint">{ago(r.created_at_ms)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </article>
            );
          })}
          <OwnerHint />
        </div>

        <Panel title="Register an agent" icon={<Plus className="size-4" />} className="h-fit xl:sticky xl:top-24">
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            if (idError || !agentId || !label.trim()) return;
            const r = await run("register", "Register agent", () => act.registerAgent(agentId.trim(), label.trim()));
            if (r) { setAgentId(""); setLabel(""); }
          }}>
            <Field label="Agent account" error={idError} hint="The NEAR account your agent signs with. Give it a key that can only call request_transfer.">
              <Input value={agentId} onChange={(e) => setAgentId(e.target.value.toLowerCase().trim())} placeholder="my-agent.testnet" autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Name"><Input value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} placeholder="Invoice payer" /></Field>
            <Button variant="primary" type="submit" className="w-full" disabled={!isOwner || !!idError || !agentId || !label.trim()} busy={busy === "register"}>Register agent</Button>
            <p className="text-[13px] leading-relaxed text-faint">Freezing pauses an agent and keeps its capsules. Revoking cancels them for good. Anything that gives an agent more power asks for full wallet confirmation.</p>
          </form>
        </Panel>
      </div>
    </>
  );
}
