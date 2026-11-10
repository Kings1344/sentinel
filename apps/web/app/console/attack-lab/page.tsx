"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FlaskConical, Radio } from "lucide-react";
import {
  SCENARIOS, defaultTask, effectiveCapsuleStatus, getScenario,
  type Agent, type Capsule, type Check, type Decision, type Evaluation, type ReasonCode, type ScenarioId, type TransferRequest, type Verdict,
} from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { rememberTx } from "@/lib/txlog";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { Badge, Button, Empty, Field, Mono, Notice, Panel, Select, Textarea, cx } from "@/components/ui";
import { DecisionBadge, reasonText } from "@/components/status";
import { IntentDiff, diffRows } from "@/components/IntentDiff";
import { ChecksList } from "@/components/ChecksList";

interface Info { agentConfigured: boolean; agentAccountId: string | null; llmConfigured: boolean }
interface RunResult {
  mode: "onchain" | "simulation";
  scenario: ScenarioId;
  expected: { decision: Decision; reason: ReasonCode };
  capsule: Capsule;
  agent: Agent;
  task: string;
  externalContent: string;
  proposal: TransferRequest;
  trace: string[];
  preview: Verdict;
  onchain?: Evaluation | null;
  final?: Evaluation | null;
  txHash?: string | null;
  explorerUrl?: string | null;
  failed?: boolean;
  error?: string;
  note?: string;
}

const GUIDED: ScenarioId[] = ["authorized", "prompt_injection", "recipient_substitution", "spending_manipulation", "replay", "operation_substitution", "expired", "revoked_agent"];

export default function AttackLab() {
  const { capsules, agents, isOwner, refresh } = useVault();
  const { call } = useWallet();
  const { run: runOwner, busy: ownerBusy } = useAction();
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<"guided" | "interactive">("guided");
  const [capsuleId, setCapsuleId] = useState<number | null>(null);
  const [scenario, setScenario] = useState<ScenarioId>("prompt_injection");
  const [task, setTask] = useState("");
  const [ext, setExt] = useState("");
  const [useLlm, setUseLlm] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetch("/api/agent/info").then((r) => r.json()).then(setInfo).catch(() => setInfo({ agentConfigured: false, agentAccountId: null, llmConfigured: false })); }, []);

  const usable = useMemo(
    () => capsules.filter((c) => !info?.agentAccountId || c.agent_id === info.agentAccountId),
    [capsules, info],
  );
  useEffect(() => {
    if (capsuleId === null && usable.length) {
      const now = Date.now();
      setCapsuleId((usable.find((c) => effectiveCapsuleStatus(c, now) === "Active") ?? usable[0]).id);
    }
  }, [usable, capsuleId]);

  const capsule = capsules.find((c) => c.id === capsuleId) ?? null;
  const agent = capsule ? agents.find((a) => a.account_id === capsule.agent_id) ?? null : null;

  useEffect(() => {
    if (!capsule) return;
    setTask(defaultTask(capsule));
    setExt(getScenario(scenario).defaultExternalContent(capsule));
  }, [capsule?.id, scenario]); // eslint-disable-line react-hooks/exhaustive-deps

  async function execute(id: ScenarioId, simulate: boolean, custom?: { task: string; externalContent: string }) {
    if (!capsule) return;
    setRunning(`${id}-${simulate}`);
    setError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: id, capsuleId: capsule.id, simulate, useLlm: useLlm && !!info?.llmConfigured, ...(custom ?? {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setResult(json);
      const reqId = json.final?.request_id ?? json.onchain?.request_id;
      if (json.txHash && reqId) rememberTx(reqId, json.txHash);
      if (json.mode === "onchain") await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  }

  const signer = info?.agentConfigured;
  return (
    <>
      <PageTitle title="Attack lab">Make a real agent misbehave and watch the contract refuse. Each run builds a proposal from the selected capsule plus scripted untrusted content, then submits it to the deployed vault as the agent.</PageTitle>

      <div className="mb-4">
        {info === null ? null : signer ? (
          <Notice tone="pass"><Radio className="mr-1.5 inline size-4" />On-chain mode. The server signs as <Mono>{info.agentAccountId}</Mono> using only that agent's key. Results come from the contract.</Notice>
        ) : (
          <Notice tone="hold"><FlaskConical className="mr-1.5 inline size-4" />Simulation only. The agent signer is not configured (AGENT_ACCOUNT_ID, AGENT_PRIVATE_KEY), so runs use the off-chain engine and nothing is sent to the contract. See the README to enable on-chain runs.</Notice>
        )}
      </div>

      <Panel className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Capsule under attack" hint={capsule ? `Owner instruction: “${capsule.instruction}”` : undefined}>
            <Select value={capsuleId ?? ""} onChange={(e) => { setCapsuleId(Number(e.target.value)); setResult(null); }}>
              {usable.length === 0 && <option value="">No capsules for this agent</option>}
              {usable.map((c) => <option key={c.id} value={c.id}>#{c.id} · {c.recipient} · {effectiveCapsuleStatus(c, Date.now())} · nonce {c.last_nonce}</option>)}
            </Select>
          </Field>
          <div role="tablist" aria-label="Lab mode" className="flex gap-1">
            {(["guided", "interactive"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cx("rounded-md px-3 py-2 text-sm", mode === m ? "bg-raised text-fg" : "text-dim hover:text-fg")}>
                {m === "guided" ? "Guided demo" : "Interactive"}
              </button>
            ))}
          </div>
        </div>
        {usable.length === 0 && <p className="mt-3 text-sm text-dim">Create a capsule for {info?.agentAccountId ? <Mono>{info.agentAccountId}</Mono> : "your agent"} on the <Link className="text-[#7fb0ff]" href="/console/capsules">Capsules page</Link> first.</p>}
      </Panel>

      {error && <div className="mb-4"><Notice tone="block">{error}</Notice></div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-3">
          {mode === "guided" ? (
            <ol className="space-y-2">
              {GUIDED.map((id, i) => {
                const s = getScenario(id);
                const pre = capsule && agent ? s.precondition({ capsule, agent, nowMs: Date.now() }) : "Select a capsule.";
                return (
                  <li key={id} className="rounded-lg border border-line bg-panel p-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 text-sm text-faint tabular">{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{s.title}</span>
                          <Badge tone={s.kind === "attack" ? "block" : "pass"}>{s.kind === "attack" ? "Attack" : "Baseline"}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-dim">{s.summary}</p>
                        <p className="mt-1 text-xs text-faint">Expected: {s.expected.decision === "RequiresHumanReview" ? "review" : s.expected.decision.toLowerCase()}, {reasonText(s.expected.reason).toLowerCase()}</p>
                        {pre && <p className="mt-2 text-xs text-hold">{pre}</p>}
                        {id === "revoked_agent" && agent && agent.status !== "Revoked" && (
                          <div className="mt-2 space-y-1">
                            <Button variant="danger" disabled={!isOwner} busy={ownerBusy === "lab-revoke"} onClick={() => { if (confirm(`Revoke ${agent.account_id}? Its capsules are revoked permanently.`)) runOwner("lab-revoke", "Revoke agent", () => ownerActions(call).revokeAgent(agent.account_id)); }}>Revoke agent now</Button>
                            <OwnerHint />
                          </div>
                        )}
                        {id === "expired" && pre && <p className="mt-1 text-xs"><Link className="text-[#7fb0ff]" href="/console/capsules">Create a 1-minute capsule</Link>, wait, then select it above.</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {signer && <Button variant="primary" disabled={!!pre || !!running} busy={running === `${id}-false`} onClick={() => execute(id, false)}>Run on-chain</Button>}
                          <Button disabled={!capsule || !!running} busy={running === `${id}-true`} onClick={() => execute(id, true)}>Simulate</Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Panel title="Build an attack">
              <div className="space-y-3">
                <Field label="Scenario">
                  <Select value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
                    {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </Select>
                </Field>
                <Field label="Owner's task for the agent"><Textarea value={task} onChange={(e) => setTask(e.target.value)} maxLength={1000} /></Field>
                <Field label="Untrusted content the agent reads" hint="Web page, email or tool output. Edit it to write your own injection."><Textarea value={ext} onChange={(e) => setExt(e.target.value)} maxLength={2000} className="min-h-32 font-mono text-xs" /></Field>
                {info?.llmConfigured && (
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />Let the LLM agent build the proposal</label>
                )}
                {capsule && agent && getScenario(scenario).precondition({ capsule, agent, nowMs: Date.now() }) && (
                  <p className="text-xs text-hold">{getScenario(scenario).precondition({ capsule, agent, nowMs: Date.now() })}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {signer && <Button variant="primary" disabled={!capsule || !!running} busy={running === `${scenario}-false`} onClick={() => execute(scenario, false, { task, externalContent: ext })}>Run on-chain</Button>}
                  <Button disabled={!capsule || !!running} busy={running === `${scenario}-true`} onClick={() => execute(scenario, true, { task, externalContent: ext })}>Simulate</Button>
                </div>
              </div>
            </Panel>
          )}
        </div>

        <div>{result ? <ResultView r={result} /> : <Panel><Empty title="No run yet">Pick a step and run it. The result shows the owner's capsule, what the agent proposed, every check and the decision.</Empty></Panel>}</div>
      </div>
    </>
  );
}

function ResultView({ r }: { r: RunResult }) {
  const decided: Evaluation | Verdict | null = r.mode === "onchain" ? (r.final ?? r.onchain ?? null) : r.preview;
  const checks: Check[] = (r.mode === "onchain" ? r.onchain?.checks : r.preview.checks) ?? [];
  const matchesExpected = decided && decided.decision === r.expected.decision && decided.reason === r.expected.reason;
  return (
    <Panel
      title={<span className="flex items-center gap-2">{getScenario(r.scenario).title}{r.mode === "onchain" ? <Badge tone="signal">On-chain result</Badge> : <Badge tone="hold">Simulation, not sent to the contract</Badge>}</span>}
    >
      <div className="space-y-5 text-sm">
        {r.note && <Notice tone="hold">{r.note}</Notice>}
        {r.failed && <Notice tone="block">The contract refused the transaction outright: {r.error}</Notice>}

        {decided && (
          <div className={cx("rounded-md border p-3", decided.decision === "Approved" ? "border-pass/50" : decided.decision === "RequiresHumanReview" ? "border-hold/50" : "border-block/50")}>
            <div className="flex flex-wrap items-center gap-2">
              <DecisionBadge decision={decided.decision} />
              <span className="font-medium">{reasonText(decided.reason)}</span>
              {"status" in decided && <span className="text-dim">· request #{(decided as Evaluation).request_id}, {(decided as Evaluation).status === "Executed" ? "funds sent" : (decided as Evaluation).status === "Rejected" ? "no funds moved" : (decided as Evaluation).status}</span>}
            </div>
            <p className="mt-2">{decided.explanation}</p>
            <p className={cx("mt-2 text-xs", matchesExpected ? "text-pass" : "text-hold")}>{matchesExpected ? "Matches the expected outcome for this scenario." : `Expected ${r.expected.decision} / ${r.expected.reason}. Check the scenario's precondition.`}</p>
            {r.explorerUrl && <a className="mt-2 inline-flex items-center gap-1 text-[#7fb0ff] hover:underline" href={r.explorerUrl} target="_blank" rel="noreferrer">Transaction <Mono>{r.txHash?.slice(0, 14)}…</Mono><ExternalLink className="size-3" /></a>}
          </div>
        )}

        <section>
          <h3 className="mb-2 font-medium">What the owner authorized vs what the agent proposed</h3>
          <IntentDiff key={`${r.scenario}-${r.txHash ?? r.proposal.nonce}-${r.mode}`} rows={diffRows(r.capsule, r.proposal)} />
        </section>

        <section>
          <h3 className="mb-2 font-medium">Checks {r.mode === "onchain" ? "run by the contract" : "run by the off-chain engine"}</h3>
          <ChecksList checks={checks} />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1.5 font-medium">Owner's task</h3>
            <p className="rounded-md border border-line bg-ink p-2.5 text-dim">{r.task}</p>
          </div>
          <div>
            <h3 className="mb-1.5 font-medium">Untrusted content</h3>
            <pre className="max-h-40 overflow-auto rounded-md border border-block/30 bg-ink p-2.5 font-mono text-xs whitespace-pre-wrap text-dim">{r.externalContent || "(none)"}</pre>
          </div>
        </section>

        <section>
          <h3 className="mb-1.5 font-medium">Agent reasoning trace</h3>
          <ol className="list-decimal space-y-0.5 pl-5 text-dim">{r.trace.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </section>
      </div>
    </Panel>
  );
}
