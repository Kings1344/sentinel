"use client";
import { useMemo, useState } from "react";
import { Check, FileLock2, ShieldCheck, ShieldX } from "lucide-react";
import {
  capsuleCommitment, draftToCapsuleInput, effectiveCapsuleStatus, formatNear, parseOwnerInstruction, validateCapsuleDraft,
  type CapsuleDraft,
} from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { viewCall } from "@/lib/rpc";
import { CONTRACT_ID } from "@/lib/config";
import { useNow } from "@/lib/useNow";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { useConfirm } from "@/components/Overlays";
import { Button, Empty, Field, Input, ListSkeleton, Meter, Mono, Notice, Panel, Select, Textarea, cx } from "@/components/ui";
import { CapsuleStatusBadge } from "@/components/status";
import { ago, dur, near } from "@/lib/format";

const EXPIRY = [
  { s: 60, label: "1 minute (for testing expiry)" },
  { s: 600, label: "10 minutes" },
  { s: 3600, label: "1 hour" },
  { s: 86400, label: "24 hours" },
  { s: 604800, label: "7 days" },
  { s: 2592000, label: "30 days" },
];
const STEPS = ["Describe the task", "Set permissions", "Review and sign"];
const blank: CapsuleDraft = { agentId: "", recipient: "", maxPerTx: "", maxTotal: "", reviewThreshold: "", expiresInSeconds: 86400, instruction: "" };
type Review = { input: ReturnType<typeof draftToCapsuleInput>; onchain: string; local: string };

export default function CapsulesPage() {
  const { agents, capsules, overview, isOwner, loading } = useVault();
  const { call } = useWallet();
  const { run, busy, toast } = useAction();
  const confirm = useConfirm();
  const now = useNow(5000);
  const act = ownerActions(call);
  const [step, setStep] = useState(0);
  const [nl, setNl] = useState("Allow my AI agent to pay vendor.testnet a maximum of 3 NEAR for a service invoice. This authorization expires in 24 hours.");
  const [notes, setNotes] = useState<string[]>([]);
  const [d, setD] = useState<CapsuleDraft>(blank);
  const [touched, setTouched] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const activeAgents = agents.filter((a) => a.status === "Active");
  const errors = useMemo(() => validateCapsuleDraft(d), [d]);
  const valid = Object.keys(errors).length === 0;
  const set = (k: keyof CapsuleDraft) => (e: { target: { value: string } }) => {
    setReview(null);
    setD((p) => ({ ...p, [k]: k === "expiresInSeconds" ? Number(e.target.value) : k === "instruction" ? e.target.value.trimStart() : e.target.value.trim() }));
  };

  function draftFromInstruction() {
    const p = parseOwnerInstruction(nl);
    setD((prev) => ({
      ...prev,
      ...p.draft,
      agentId: prev.agentId || activeAgents[0]?.account_id || "",
      reviewThreshold: p.draft.reviewThreshold ?? "",
      expiresInSeconds: EXPIRY.some((x) => x.s === p.draft.expiresInSeconds) ? p.draft.expiresInSeconds! : prev.expiresInSeconds,
    }));
    const unresolved = p.missing.filter((m) => m !== "agentId");
    setNotes([
      ...p.notes,
      ...(p.draft.expiresInSeconds && !EXPIRY.some((x) => x.s === p.draft.expiresInSeconds) ? [`The expiry you wrote (${dur(p.draft.expiresInSeconds * 1000)}) isn't a preset. Pick the closest one.`] : []),
      ...(unresolved.length ? [`Couldn't read: ${unresolved.join(", ")}. Fill these in on the next step.`] : []),
    ]);
    setReview(null);
    setStep(1);
  }

  async function prepareReview() {
    setTouched(true);
    if (!valid || !overview) return;
    setReviewing(true);
    try {
      const input = draftToCapsuleInput(d, Date.now());
      const onchain = await viewCall<string>("preview_commitment", { input: { ...input, expected_commitment: null }, version: 1, supersedes: null });
      const local = await capsuleCommitment({ vault: CONTRACT_ID, owner: overview.owner, ...input, version: 1, supersedes: null });
      setReview({ input, onchain, local });
      setStep(2);
    } catch (e) {
      toast("block", `Couldn't prepare the review: ${e instanceof Error ? e.message : e}`);
    } finally {
      setReviewing(false);
    }
  }

  async function sign() {
    if (!review) return;
    const r = await run("create", "Create capsule", () => act.createCapsule({ ...review.input, expected_commitment: review.onchain }));
    if (r) { setReview(null); setD(blank); setTouched(false); setNotes([]); setStep(0); }
  }

  const summary = d.recipient && d.maxPerTx
    ? `${activeAgents.find((a) => a.account_id === d.agentId)?.label ?? "Your agent"} can pay ${d.recipient} up to ${d.maxPerTx} NEAR at a time and ${d.maxTotal || d.maxPerTx} NEAR in total${d.reviewThreshold ? `, asking you first above ${d.reviewThreshold} NEAR` : ""}, for the next ${dur(d.expiresInSeconds * 1000)}.`
    : "Fill in who the agent may pay and how much, and a plain summary appears here.";

  return (
    <>
      <PageTitle title="Intent capsules">A capsule is your signed instruction to one agent: who it may pay, how much, and until when. The contract checks every agent request against it.</PageTitle>

      <Panel padded={false}>
        <ol className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line/70 px-5 py-3.5" aria-label="Capsule creation steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                onClick={() => { if (i < step || (i === 1)) setStep(i); }}
                disabled={i > step && i !== 1}
                aria-current={step === i ? "step" : undefined}
                className={cx("flex items-center gap-2 text-sm disabled:cursor-default", step === i ? "text-fg" : i < step ? "text-pass" : "text-faint")}
              >
                <span className={cx("grid size-6 place-items-center rounded-full border text-xs tabular", step === i ? "border-signal bg-signal/15 text-[#8fb6ff]" : i < step ? "border-pass bg-pass/15" : "border-line")}>
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </span>
                {s}
              </button>
            </li>
          ))}
        </ol>

        <div className="p-5">
          {step === 0 && (
            <div className="max-w-2xl space-y-4">
              <Field label="What should the agent do?" hint="Write it like you'd tell a person. Sentinel turns it into exact permissions you can check before anything is signed.">
                <Textarea value={nl} onChange={(e) => setNl(e.target.value)} maxLength={500} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={draftFromInstruction}>Turn into permissions</Button>
                <Button onClick={() => setStep(1)}>Fill in manually</Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-5">
                {notes.length > 0 && <Notice tone="hold"><ul className="list-disc space-y-1 pl-4">{notes.map((n) => <li key={n}>{n}</li>)}</ul></Notice>}
                <fieldset className="space-y-3">
                  <legend className="mb-2 text-sm font-semibold">Who</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Agent" error={touched ? errors.agentId : undefined} hint={activeAgents.length ? undefined : "Register an agent on the AI agents page first."}>
                      <Select value={d.agentId} onChange={set("agentId")}>
                        <option value="">Choose an agent</option>
                        {activeAgents.map((a) => <option key={a.account_id} value={a.account_id}>{a.label} ({a.account_id})</option>)}
                      </Select>
                    </Field>
                    <Field label="May pay this account only" error={touched ? errors.recipient : undefined}>
                      <Input value={d.recipient} onChange={set("recipient")} placeholder="vendor.testnet" autoComplete="off" />
                    </Field>
                  </div>
                </fieldset>
                <fieldset className="space-y-3">
                  <legend className="mb-2 text-sm font-semibold">How much (NEAR only)</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Per payment" error={touched ? errors.maxPerTx : undefined}><Input inputMode="decimal" value={d.maxPerTx} onChange={set("maxPerTx")} placeholder="0.3" /></Field>
                    <Field label="In total" error={touched ? errors.maxTotal : undefined}><Input inputMode="decimal" value={d.maxTotal} onChange={set("maxTotal")} placeholder="0.9" /></Field>
                    <Field label="Ask me above" error={touched ? errors.reviewThreshold : undefined} hint="Optional"><Input inputMode="decimal" value={d.reviewThreshold} onChange={set("reviewThreshold")} placeholder="No approval" /></Field>
                  </div>
                </fieldset>
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-semibold">Until when</legend>
                  <Field label="Expires after" error={touched ? errors.expiresInSeconds : undefined}>
                    <Select value={d.expiresInSeconds} onChange={set("expiresInSeconds")}>{EXPIRY.map((x) => <option key={x.s} value={x.s}>{x.label}</option>)}</Select>
                  </Field>
                  <Field label="Instruction saved with the capsule" error={touched ? errors.instruction : undefined}>
                    <Input value={d.instruction} onChange={set("instruction")} maxLength={500} placeholder="Pay the vendor's invoice" />
                  </Field>
                </fieldset>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => setStep(0)}>Back</Button>
                  <Button variant="primary" onClick={prepareReview} disabled={!isOwner} busy={reviewing}>Review capsule</Button>
                </div>
                <OwnerHint />
              </div>
              <aside className="h-fit rounded-xl border border-line/80 bg-raised/40 p-4 text-sm">
                <h3 className="font-semibold">In plain words</h3>
                <p className="mt-1.5 leading-relaxed text-dim">{summary}</p>
                <p className="mt-3 text-xs text-faint">Anything outside this is refused by the contract, even if the agent is tricked.</p>
              </aside>
            </div>
          )}

          {step === 2 && review && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4 text-sm">
                <div className="rounded-xl border border-pass/30 bg-pass/6 p-4">
                  <h3 className="mb-2 flex items-center gap-2 font-semibold text-pass"><ShieldCheck className="size-4" />The agent may</h3>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Send NEAR to <Mono>{review.input.recipient}</Mono>, and nobody else</li>
                    <li>Up to {formatNear(review.input.max_per_tx)} NEAR per payment, {formatNear(review.input.max_total)} NEAR in total</li>
                    <li>Until {new Date(Number(review.input.expires_at_ms)).toLocaleString()}</li>
                    {review.input.review_threshold && <li>Pay up to {formatNear(review.input.review_threshold)} NEAR without asking you</li>}
                  </ul>
                </div>
                <div className="rounded-xl border border-block/30 bg-block/6 p-4">
                  <h3 className="mb-2 flex items-center gap-2 font-semibold text-block"><ShieldX className="size-4" />The agent may not</h3>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Pay anyone else, use another token, or call other contracts</li>
                    <li>Change these terms, reuse a request, or act after you revoke it</li>
                    <li>Touch the rest of your vault</li>
                  </ul>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-line p-4 text-sm">
                  <h3 className="font-semibold">Tamper check</h3>
                  <p className="mt-1 text-dim">A fingerprint (SHA-256) of these exact terms, computed by the contract and again in your browser.</p>
                  <Mono className="mt-2 block text-dim">{review.onchain}</Mono>
                  {review.onchain === review.local
                    ? <p className="mt-2 flex items-center gap-1.5 text-pass"><Check className="size-4" />Both match. What you see is exactly what gets signed.</p>
                    : <p className="mt-2 text-block">They don't match. Don't sign; check the configured contract.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setStep(1)}>Edit</Button>
                  <Button variant="primary" onClick={sign} disabled={review.onchain !== review.local || !isOwner} busy={busy === "create"}>Sign and create capsule</Button>
                </div>
                <p className="text-xs text-faint">Your wallet opens to confirm. For short expiries, sign promptly: the clock started when you clicked Review.</p>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <h2 className="mt-8 mb-3 text-lg font-semibold">Your capsules</h2>
      {loading && !overview ? <ListSkeleton rows={3} /> : capsules.length === 0 ? <Empty title="No capsules yet" icon={<FileLock2 className="size-6" />}>Create one above. Until then, your agents can't pay anyone.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {capsules.map((c) => {
            const st = effectiveCapsuleStatus(c, now);
            const used = BigInt(c.spent) + BigInt(c.reserved);
            return (
              <article key={c.id} className={cx("rounded-xl border border-line/80 bg-panel p-4", st !== "Active" && "opacity-75")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">Capsule #{c.id} <span className="text-sm font-normal text-faint">v{c.version}</span></div>
                    <p className="mt-0.5 text-sm text-dim">“{c.instruction}”</p>
                  </div>
                  <CapsuleStatusBadge status={st} />
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-dim">Agent</dt><dd><Mono>{c.agent_id}</Mono></dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">May pay</dt><dd><Mono>{c.recipient}</Mono></dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">Per payment</dt><dd className="tabular">{near(c.max_per_tx)}{c.review_threshold ? `, ask above ${near(c.review_threshold)}` : ""}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-dim">{st === "Expired" ? "Expired" : "Expires"}</dt><dd>{ago(c.expires_at_ms)}</dd></div>
                </dl>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-faint"><span>Used {near(used)} of {near(c.max_total)}</span><Mono>{c.commitment.slice(0, 10)}…</Mono></div>
                  <Meter value={Number(used / 10n ** 18n)} max={Number(BigInt(c.max_total) / 10n ** 18n)} tone={used >= BigInt(c.max_total) ? "hold" : "signal"} label={`Capsule ${c.id} spending used`} />
                </div>
                {c.status === "Active" && (
                  <div className="mt-3 flex justify-end">
                    <Button variant="danger" disabled={!isOwner} busy={busy === `rc-${c.id}`} onClick={async () => {
                      if (await confirm({ title: `Revoke capsule #${c.id}?`, body: "The agent immediately loses this permission. This can't be undone; create a new capsule if you need it again.", confirmLabel: "Revoke capsule", tone: "danger" }))
                        run(`rc-${c.id}`, `Revoke capsule #${c.id}`, () => act.revokeCapsule(c.id));
                    }}>Revoke</Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
