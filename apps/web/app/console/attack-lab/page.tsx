"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Bot, ExternalLink, FlaskConical, Loader2, Play, Radio, RotateCcw, ScrollText, ShieldAlert, ShieldCheck, ShieldX, UserRound } from "lucide-react";
import {
  SCENARIOS, defaultTask, effectiveCapsuleStatus, formatNear, getScenario,
  type Agent, type Capsule, type Check, type Decision, type Evaluation, type ReasonCode, type ScenarioId, type TransferRequest, type Verdict,
} from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { rememberTx } from "@/lib/txlog";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { useConfirm } from "@/components/Overlays";
import { Badge, Button, Empty, Field, Mono, Notice, Panel, Segmented, Select, Switch, Textarea, buttonStyles, cx } from "@/components/ui";
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
  const confirmDialog = useConfirm();
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<"guided" | "custom">("guided");
  const [capsuleId, setCapsuleId] = useState<number | null>(null);
  const [scenario, setScenario] = useState<ScenarioId>("prompt_injection");
  const [task, setTask] = useState("");
  const [ext, setExt] = useState("");
  const [useLlm, setUseLlm] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<(RunResult & { at: number })[]>([]);
  const [playKey, setPlayKey] = useState("0");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetch("/api/agent/info").then((r) => r.json()).then(setInfo).catch(() => setInfo({ agentConfigured: false, agentAccountId: null, llmConfigured: false })); }, []);

  const usable = useMemo(() => capsules.filter((c) => !info?.agentAccountId || c.agent_id === info.agentAccountId), [capsules, info]);
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
      setPlayKey(String(Date.now()));
      setHistory((h) => [{ ...json, at: Date.now() }, ...h].slice(0, 8));
      const reqId = json.final?.request_id ?? json.onchain?.request_id;
      if (json.txHash && reqId) rememberTx(reqId, json.txHash);
      if (json.mode === "onchain") await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  }

  const signer = !!info?.agentConfigured;
  const now = Date.now();
  const sel = getScenario(scenario);
  const pre = capsule && agent ? sel.precondition({ capsule, agent, nowMs: now }) : "Select a capsule to attack.";
  const custom = mode === "custom" ? { task, externalContent: ext } : undefined;

  const runButtons = (
    <div className="flex flex-wrap gap-2">
      {signer && <Button variant="primary" disabled={!!pre || !!running || !capsule} busy={running === `${scenario}-false`} onClick={() => execute(scenario, false, custom)}><Play className="size-4" />Run on-chain</Button>}
      <Button disabled={!capsule || !!running} busy={running === `${scenario}-true`} onClick={() => execute(scenario, true, custom)}>Simulate</Button>
    </div>
  );

  return (
    <>
      <PageTitle title="Attack lab" action={<Segmented label="Lab mode" value={mode} onChange={setMode} options={[{ value: "guided", label: "Guided scenarios" }, { value: "custom", label: "Write your own attack" }]} />}>
        Hijack a real AI agent with poisoned web pages, forged emails and fake tool output, then watch the vault contract check every field and refuse.
      </PageTitle>

      <div className="surface mb-6 grid gap-5 p-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
        <div className="flex items-center gap-3">
          <span className={cx("grid size-10 place-items-center rounded-xl border", signer ? "border-signal/30 bg-signal/10 text-link" : "border-hold/30 bg-hold/10 text-[#fbbf24]")}>{signer ? <Radio className="size-5" /> : <FlaskConical className="size-5" />}</span>
          <div>
            <div className="text-sm font-medium">{info === null ? "Checking agent signer…" : signer ? "On-chain mode" : "Simulation only"}</div>
            <div className="text-[13px] text-dim">{signer ? <>Signs as <Mono>{info?.agentAccountId}</Mono>, with only the agent's own key</> : "No agent key on this server, so runs stay off-chain"}</div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end md:border-l md:border-line md:pl-5">
          <Field label="Target capsule">
            <Select value={capsuleId ?? ""} onChange={(e) => { setCapsuleId(Number(e.target.value)); setResult(null); }}>
              {usable.length === 0 && <option value="">No capsules for this agent yet</option>}
              {usable.map((c) => <option key={c.id} value={c.id}>Capsule #{c.id}: pay {c.recipient}, {effectiveCapsuleStatus(c, now).toLowerCase()}</option>)}
            </Select>
          </Field>
          {agent && <div className="flex h-10 items-center gap-2 text-[13px] text-dim"><Bot className="size-4" />Agent is <span className={agent.status === "Active" ? "text-[#34d399]" : "text-[#ff7b7b]"}>{agent.status === "Suspended" ? "frozen" : agent.status.toLowerCase()}</span></div>}
        </div>
      </div>

      {usable.length === 0 && <div className="mb-6"><Notice tone="hold" title="Nothing to attack yet">Create a capsule for {info?.agentAccountId ? <Mono>{info.agentAccountId}</Mono> : "your agent"} on the <Link className="text-link underline" href="/console/capsules">Intent capsules</Link> page first.</Notice></div>}
      {error && <div className="mb-6"><Notice tone="block" title="The run didn't complete">{error}</Notice></div>}

      <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-3">
          {mode === "guided" ? GUIDED.map((id, i) => {
            const s = getScenario(id);
            const active = scenario === id;
            const p = capsule && agent ? s.precondition({ capsule, agent, nowMs: now }) : "Select a capsule.";
            return (
              <div key={id} className={cx("rounded-[14px] border transition-colors", active ? "border-signal/50 bg-panel shadow-[0_0_0_3px_rgb(99_131_255/0.12)]" : "border-line bg-panel/60 hover:border-line-strong")}>
                <button onClick={() => setScenario(id)} aria-expanded={active} className="flex w-full items-start gap-3.5 px-4 py-3.5 text-left">
                  <span className={cx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-[13px] font-semibold tabular", active ? "bg-signal text-white" : "bg-raised text-dim")}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{s.title}</span>
                      <Badge tone={s.kind === "attack" ? "block" : "pass"}>{s.kind === "attack" ? "Attack" : "Baseline"}</Badge>
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-dim">{s.summary}</span>
                  </span>
                </button>
                {active && (
                  <div className="rise-in space-y-3 border-t border-line px-4 py-3.5">
                    <div className="text-[13px] text-dim">Expected result: <span className={s.expected.decision === "Approved" ? "text-[#34d399]" : "text-[#ff7b7b]"}>{s.expected.decision === "Approved" ? "approved" : s.expected.decision.toLowerCase()}, {reasonText(s.expected.reason).toLowerCase()}</span></div>
                    {p && <Notice tone="hold">{p}</Notice>}
                    {id === "revoked_agent" && agent && agent.status !== "Revoked" && (
                      <div className="space-y-2">
                        <Button variant="outline-danger" size="sm" disabled={!isOwner} busy={ownerBusy === "lab-revoke"} onClick={async () => {
                          if (await confirmDialog({ title: `Revoke ${agent.account_id}?`, body: "The agent and all of its capsules are revoked permanently. Run this scenario last.", confirmLabel: "Revoke agent", tone: "danger" }))
                            runOwner("lab-revoke", "Revoke agent", () => ownerActions(call).revokeAgent(agent.account_id));
                        }}>Revoke agent now</Button>
                        <OwnerHint />
                      </div>
                    )}
                    {id === "expired" && p && <Link href="/console/capsules" className={buttonStyles("secondary", "sm")}>Create a 1-minute capsule</Link>}
                    {runButtons}
                  </div>
                )}
              </div>
            );
          }) : (
            <Panel title="Write your own attack" description="Edit what the agent reads. The contract still decides.">
              <div className="space-y-4">
                <Field label="Attack type">
                  <Select value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>{SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</Select>
                </Field>
                <Field label="The owner's task"><Textarea value={task} onChange={(e) => setTask(e.target.value)} maxLength={1000} className="min-h-20" /></Field>
                <Field label="Untrusted content the agent reads" hint="A web page, email or tool result. Try to make the agent pay someone else.">
                  <Textarea value={ext} onChange={(e) => setExt(e.target.value)} maxLength={2000} className="min-h-36 font-mono text-[13px]" />
                </Field>
                {info?.llmConfigured && <Switch checked={useLlm} onChange={setUseLlm} label="Use the LLM agent" description="An LLM builds the proposal instead of the scripted agent." />}
                {pre && <Notice tone="hold">{pre}</Notice>}
                {runButtons}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          {running ? <RunningStage onchain={running.endsWith("false")} /> : result ? <ResultStage r={result} playKey={playKey} onReplay={() => setPlayKey(String(Date.now()))} /> : (
            <div className="surface"><Empty title="Pick a scenario and run it" icon={<FlaskConical className="size-5" />}>
              You'll see the owner's intent, what the hijacked agent proposed, every check as the contract runs it, and the final decision.
            </Empty></div>
          )}
          {history.length > 1 && (
            <Panel title="Incident replay" description="Runs from this session. Select one to play its checks again.">
              <ul className="-my-2 divide-y divide-line/70">
                {history.map((h) => {
                  const d = h.mode === "onchain" ? (h.final ?? h.onchain) : h.preview;
                  return (
                    <li key={h.at}>
                      <button onClick={() => { setResult(h); setPlayKey(String(Date.now())); }} className="flex w-full flex-wrap items-center gap-3 rounded-lg px-2 py-3 text-left text-sm transition-colors hover:bg-hover/60">
                        <RotateCcw className="size-4 text-faint" aria-hidden />
                        <span className="font-medium">{getScenario(h.scenario).title}</span>
                        {d && <DecisionBadge decision={d.decision} />}
                        <Badge tone={h.mode === "onchain" ? "signal" : "hold"}>{h.mode === "onchain" ? "On-chain" : "Simulation"}</Badge>
                        <span className="ml-auto text-[12.5px] text-faint">{new Date(h.at).toLocaleTimeString()}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function RunningStage({ onchain }: { onchain: boolean }) {
  return (
    <div className="surface flex items-center gap-4 p-6">
      <Loader2 className="size-6 animate-spin text-link" aria-hidden />
      <div>
        <div className="text-[15px] font-medium">{onchain ? "Agent is submitting to the vault contract…" : "Running the off-chain check engine…"}</div>
        <div className="text-[13px] text-dim">{onchain ? "Waiting for NEAR testnet to include the transaction. This usually takes a few seconds." : "Nothing is sent to the blockchain in simulation mode."}</div>
      </div>
    </div>
  );
}

/** Plays checks back one at a time (instantly when the user prefers reduced motion). */
function useReveal(total: number, key: string): number {
  const [n, setN] = useState(total);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || total === 0) { setN(total); return; }
    setN(0);
    let i = 0;
    const id = setInterval(() => { i += 1; setN(i); if (i >= total) clearInterval(id); }, 160);
    return () => clearInterval(id);
  }, [total, key]);
  return n;
}

function ResultStage({ r, playKey, onReplay }: { r: RunResult; playKey: string; onReplay: () => void }) {
  const decided: Evaluation | Verdict | null = r.mode === "onchain" ? (r.final ?? r.onchain ?? null) : r.preview;
  const checks: Check[] = (r.mode === "onchain" ? r.onchain?.checks : r.preview.checks) ?? [];
  const revealed = useReveal(checks.length, playKey);
  const done = revealed >= checks.length;
  const rows = diffRows(r.capsule, r.proposal);
  const changed = rows.filter((x) => !x.ok).length;
  const matchesExpected = decided && decided.decision === r.expected.decision && decided.reason === r.expected.reason;
  const tone = !decided ? "block" : decided.decision === "Approved" ? "pass" : decided.decision === "RequiresHumanReview" ? "hold" : "block";
  const Icon = tone === "pass" ? ShieldCheck : tone === "hold" ? ShieldAlert : ShieldX;
  const s = getScenario(r.scenario);

  return (
    <Panel
      padded={false}
      title={<span className="flex flex-wrap items-center gap-2">{s.title}{r.mode === "onchain" ? <Badge tone="signal" dot>On-chain result</Badge> : <Badge tone="hold" dot>Simulation, not sent to the contract</Badge>}</span>}
      action={<Button size="sm" variant="ghost" onClick={onReplay} disabled={!done}><RotateCcw className="size-4" />Replay</Button>}
    >
      <div className="space-y-6 p-6">
        {r.note && <Notice tone="hold">{r.note}</Notice>}
        {r.failed && <Notice tone="block" title="The contract refused the transaction outright">{r.error}</Notice>}

        {/* Pipeline: owner intent -> agent proposal -> contract decision */}
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
          <Stage icon={<UserRound className="size-4" />} label="Owner's intent" tone="neutral">
            Pay <Mono className="text-fg">{r.capsule.recipient}</Mono> up to {formatNear(r.capsule.max_per_tx)} NEAR
          </Stage>
          <ArrowRight className="mx-auto hidden size-4 self-center text-faint md:block" aria-hidden />
          <Stage icon={<Bot className="size-4" />} label="Agent's proposal" tone={changed ? "block" : "pass"}>
            {formatNear(r.proposal.amount)} {r.proposal.asset} to <Mono className="text-fg">{r.proposal.recipient}</Mono>
            <div className={cx("mt-1 text-xs font-medium", changed ? "text-[#ff7b7b]" : "text-[#34d399]")}>{changed ? `${changed} field${changed > 1 ? "s" : ""} changed` : "Matches the intent"}</div>
          </Stage>
          <ArrowRight className="mx-auto hidden size-4 self-center text-faint md:block" aria-hidden />
          <Stage icon={done ? <Icon className="size-4" /> : <Loader2 className="size-4 animate-spin" />} label={r.mode === "onchain" ? "Vault contract" : "Check engine"} tone={done ? tone : "neutral"}>
            {done && decided ? <span className="font-semibold">{decided.decision === "Approved" ? "Approved" : decided.decision === "RequiresHumanReview" ? "Held for you" : decided.decision}</span> : <span className="text-dim">Checking {Math.min(revealed + 1, checks.length)} of {checks.length}…</span>}
          </Stage>
        </div>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Field-by-field comparison</h3>
          <IntentDiff key={`${playKey}-diff`} rows={rows} />
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold">{r.mode === "onchain" ? "Checks run by the contract" : "Checks run by the off-chain engine"}</h3>
          <ChecksList checks={checks} revealed={revealed} />
        </section>

        {decided && done && (
          <div className={cx("rise-in rounded-[14px] border p-5", tone === "pass" && "border-pass/30 bg-pass/[0.07]", tone === "hold" && "border-hold/30 bg-hold/[0.07]", tone === "block" && "border-block/30 bg-block/[0.07]")}>
            <div className="flex items-start gap-4">
              <span className={cx("grid size-11 shrink-0 place-items-center rounded-xl", tone === "pass" && "bg-pass/15 text-[#34d399]", tone === "hold" && "bg-hold/15 text-[#fbbf24]", tone === "block" && "bg-block/15 text-[#ff7b7b]")}><Icon className="size-6" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[17px] font-semibold tracking-[-0.01em]">{reasonText(decided.reason)}</span>
                  <DecisionBadge decision={decided.decision} />
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-fg/90">{decided.explanation}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
                  {"status" in decided && <span className="text-dim">Request #{(decided as Evaluation).request_id}, {(decided as Evaluation).status === "Executed" ? "funds sent" : (decided as Evaluation).status === "Rejected" ? "no funds moved" : (decided as Evaluation).status}</span>}
                  <span className={matchesExpected ? "text-[#34d399]" : "text-[#fbbf24]"}>{matchesExpected ? "Matches the expected outcome" : `Expected ${r.expected.decision}, ${r.expected.reason}`}</span>
                  {r.explorerUrl && <a className="inline-flex items-center gap-1 font-medium text-link hover:underline" href={r.explorerUrl} target="_blank" rel="noreferrer">View transaction <ExternalLink className="size-3.5" /></a>}
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">The owner's task</h3>
            <p className="surface-raised p-3.5 text-[13px] leading-relaxed text-dim">{r.task}</p>
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">Untrusted content <Badge tone="block">Attacker controlled</Badge></h3>
            <pre className="scroll-quiet max-h-40 overflow-auto rounded-[10px] border border-block/25 bg-block/[0.04] p-3.5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-dim">{r.externalContent || "(none)"}</pre>
          </div>
        </section>

        <details className="group rounded-[10px] border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium"><ScrollText className="size-4 text-dim" />How the agent built this request</summary>
          <ol className="list-decimal space-y-1 border-t border-line px-4 py-3 pl-9 text-[13px] leading-relaxed text-dim">{r.trace.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </details>
      </div>
    </Panel>
  );
}

function Stage({ icon, label, tone, children }: { icon: ReactNode; label: string; tone: "pass" | "block" | "hold" | "neutral"; children: ReactNode }) {
  return (
    <div className={cx("rounded-[12px] border p-4 transition-colors duration-300",
      tone === "neutral" && "border-line bg-raised/50",
      tone === "pass" && "border-pass/30 bg-pass/[0.06]",
      tone === "block" && "border-block/30 bg-block/[0.06]",
      tone === "hold" && "border-hold/30 bg-hold/[0.06]")}>
      <div className={cx("mb-2 flex items-center gap-2 text-[13px] font-medium",
        tone === "neutral" && "text-dim", tone === "pass" && "text-[#34d399]", tone === "block" && "text-[#ff7b7b]", tone === "hold" && "text-[#fbbf24]")}>{icon}{label}</div>
      <div className="text-[13px] leading-relaxed break-words">{children}</div>
    </div>
  );
}
