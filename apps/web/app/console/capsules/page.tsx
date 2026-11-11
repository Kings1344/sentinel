"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, Check, FileLock2, Fingerprint, Pencil, ShieldCheck, ShieldX, Sparkles } from "lucide-react";
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
import { AmountInput, Button, Empty, Field, Input, ListSkeleton, Meter, Mono, Notice, Panel, Row, Segmented, Textarea, buttonStyles, cx } from "@/components/ui";
import { CapsuleStatusBadge } from "@/components/status";
import { ago, dur, near } from "@/lib/format";

const EXPIRY: { value: number; label: string }[] = [
  { value: 60, label: "1 min" },
  { value: 600, label: "10 min" },
  { value: 3600, label: "1 hour" },
  { value: 86400, label: "24 hours" },
  { value: 604800, label: "7 days" },
  { value: 2592000, label: "30 days" },
];
const STEPS = [
  { title: "Describe the task", body: "Write the instruction in plain words" },
  { title: "Set permissions", body: "Recipient, limits and expiry" },
  { title: "Review and sign", body: "Check, then sign with your wallet" },
];
const EXAMPLES = [
  "Pay vendor.testnet up to 0.3 NEAR per invoice, 0.9 NEAR in total. Valid for 24 hours.",
  "Allow my agent to tip creator.testnet up to 0.1 NEAR at a time, 1 NEAR in total, for 7 days.",
  "Pay hosting.testnet up to 2 NEAR. Ask me before anything above 1 NEAR. Expires in 1 hour.",
];
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
  const [nl, setNl] = useState(EXAMPLES[0]);
  const [notes, setNotes] = useState<string[]>([]);
  const [d, setD] = useState<CapsuleDraft>(blank);
  const [touched, setTouched] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const activeAgents = agents.filter((a) => a.status === "Active");
  const errors = useMemo(() => validateCapsuleDraft(d), [d]);
  const valid = Object.keys(errors).length === 0;
  const update = (k: keyof CapsuleDraft, v: string | number) => { setReview(null); setD((p) => ({ ...p, [k]: v })); };
  const text = (k: keyof CapsuleDraft) => (e: { target: { value: string } }) => update(k, k === "instruction" ? e.target.value.trimStart() : e.target.value.trim());

  function draftFromInstruction() {
    const p = parseOwnerInstruction(nl);
    const exp = p.draft.expiresInSeconds;
    setD((prev) => ({
      ...prev, ...p.draft,
      agentId: prev.agentId || activeAgents[0]?.account_id || "",
      reviewThreshold: p.draft.reviewThreshold ?? "",
      expiresInSeconds: exp && EXPIRY.some((x) => x.value === exp) ? exp : prev.expiresInSeconds,
    }));
    const unresolved = p.missing.filter((m) => m !== "agentId");
    setNotes([
      ...p.notes,
      ...(exp && !EXPIRY.some((x) => x.value === exp) ? [`The expiry you wrote (${dur(exp * 1000)}) isn't one of the presets. Pick the closest one.`] : []),
      ...(unresolved.length ? [`Couldn't read: ${unresolved.join(", ")}. Fill these in below.`] : []),
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

  const agentLabel = activeAgents.find((a) => a.account_id === d.agentId)?.label ?? "Your agent";
  const canGo = (i: number) => i === 0 || i === 1 || (i === 2 && !!review);

  return (
    <>
      <PageTitle title="Intent capsules">A capsule is your signed instruction to one agent: who it may pay, how much, and until when. The vault contract checks every request against it.</PageTitle>

      <div className="surface grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <ol className="flex gap-2 overflow-x-auto border-b border-line p-4 lg:flex-col lg:gap-1 lg:border-r lg:border-b-0 lg:p-5" aria-label="Capsule creation steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="shrink-0 lg:shrink">
              <button onClick={() => canGo(i) && setStep(i)} disabled={!canGo(i)} aria-current={step === i ? "step" : undefined}
                className={cx("flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed", step === i ? "bg-hover" : "hover:bg-hover/50")}>
                <span className={cx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border text-[13px] font-semibold tabular transition-colors",
                  step === i ? "border-signal bg-signal text-white" : i < step ? "border-pass/40 bg-pass/15 text-[#34d399]" : "border-line-strong text-faint")}>
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span>
                  <span className={cx("block text-sm font-medium", step === i ? "text-fg" : "text-dim")}>{s.title}</span>
                  <span className="hidden text-[13px] text-faint lg:block">{s.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className="min-w-0 p-6 lg:p-8">
          {step === 0 && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.01em]">What should the agent do?</h2>
                <p className="mt-1 text-sm text-dim">Write it the way you'd tell a person. Sentinel turns it into exact permissions you check before anything is signed.</p>
              </div>
              <Textarea value={nl} onChange={(e) => setNl(e.target.value)} maxLength={500} aria-label="Instruction for the agent" />
              <div>
                <div className="mb-2 text-[13px] font-medium text-dim">Or start from an example</div>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} onClick={() => setNl(ex)} className={cx("max-w-full truncate rounded-full border px-3 py-1.5 text-[13px] transition-colors", nl === ex ? "border-signal/50 bg-signal/10 text-fg" : "border-line-strong text-dim hover:border-[#3a4766] hover:text-fg")}>{ex.split(".")[0]}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={draftFromInstruction}><Sparkles className="size-4" />Turn into permissions</Button>
                <Button variant="ghost" onClick={() => setStep(1)}><Pencil className="size-4" />Fill in manually</Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-7">
                {notes.length > 0 && <Notice tone="hold" title="Check these before continuing"><ul className="mt-1 list-disc space-y-0.5 pl-4">{notes.map((n) => <li key={n}>{n}</li>)}</ul></Notice>}

                <fieldset>
                  <legend className="mb-3 text-[15px] font-semibold">Which agent</legend>
                  {activeAgents.length === 0 ? (
                    <Notice tone="hold">No active agents. <Link href="/console/agents" className="text-link underline">Register one</Link> first.</Notice>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Agent">
                      {activeAgents.map((a) => (
                        <button key={a.account_id} type="button" role="radio" aria-checked={d.agentId === a.account_id} onClick={() => update("agentId", a.account_id)}
                          className={cx("flex items-center gap-3 rounded-[10px] border p-3 text-left transition-colors", d.agentId === a.account_id ? "border-signal/60 bg-signal/[0.08]" : "border-line-strong hover:border-[#3a4766]")}>
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised"><Bot className="size-4 text-dim" /></span>
                          <span className="min-w-0"><span className="block text-sm font-medium">{a.label}</span><Mono className="block truncate text-xs text-faint">{a.account_id}</Mono></span>
                        </button>
                      ))}
                    </div>
                  )}
                  {touched && errors.agentId && <p className="mt-2 text-[13px] text-[#ff8a8a]">{errors.agentId}</p>}
                </fieldset>

                <fieldset className="space-y-4">
                  <legend className="mb-3 text-[15px] font-semibold">Who it may pay</legend>
                  <Field label="Recipient account" error={touched ? errors.recipient : undefined} hint="The agent can pay this account and no other.">
                    <Input value={d.recipient} onChange={text("recipient")} placeholder="vendor.testnet" autoComplete="off" spellCheck={false} />
                  </Field>
                </fieldset>

                <fieldset>
                  <legend className="mb-3 text-[15px] font-semibold">How much</legend>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Per payment" error={touched ? errors.maxPerTx : undefined}><AmountInput value={d.maxPerTx} onChange={text("maxPerTx")} placeholder="0.3" /></Field>
                    <Field label="In total" error={touched ? errors.maxTotal : undefined}><AmountInput value={d.maxTotal} onChange={text("maxTotal")} placeholder="0.9" /></Field>
                    <Field label="Ask me above" optional error={touched ? errors.reviewThreshold : undefined}><AmountInput value={d.reviewThreshold} onChange={text("reviewThreshold")} placeholder="Never" /></Field>
                  </div>
                  <p className="mt-2 text-[13px] text-faint">Native NEAR only. Payments above “Ask me above” wait in Approvals until you decide.</p>
                </fieldset>

                <fieldset>
                  <legend className="mb-3 text-[15px] font-semibold">Until when</legend>
                  <Segmented label="Expires after" value={d.expiresInSeconds} onChange={(v) => update("expiresInSeconds", v)} options={EXPIRY} />
                  {touched && errors.expiresInSeconds && <p className="mt-2 text-[13px] text-[#ff8a8a]">{errors.expiresInSeconds}</p>}
                </fieldset>

                <Field label="Instruction saved with the capsule" error={touched ? errors.instruction : undefined} hint="Stored on-chain so anyone can see what this permission was for.">
                  <Input value={d.instruction} onChange={text("instruction")} maxLength={500} placeholder="Pay the vendor's invoice" />
                </Field>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-6">
                  <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
                  <Button variant="primary" onClick={prepareReview} disabled={!isOwner} busy={reviewing}>Review capsule</Button>
                </div>
                <OwnerHint />
              </div>

              <aside className="surface-raised h-fit p-5 xl:sticky xl:top-24">
                <div className="flex items-center gap-2 text-sm font-semibold"><FileLock2 className="size-4 text-dim" />Summary</div>
                <p className="mt-3 text-sm leading-relaxed text-fg/90">
                  {d.recipient && d.maxPerTx
                    ? <>{agentLabel} can pay <Mono>{d.recipient}</Mono> up to <strong>{d.maxPerTx} NEAR</strong> at a time and <strong>{d.maxTotal || d.maxPerTx} NEAR</strong> in total{d.reviewThreshold ? <>, asking you first above <strong>{d.reviewThreshold} NEAR</strong></> : null}, for the next {dur(d.expiresInSeconds * 1000)}.</>
                    : <span className="text-dim">Fill in the recipient and limits to see a plain summary here.</span>}
                </p>
                <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-faint">Anything outside this is refused by the contract, even if the agent is tricked.</p>
              </aside>
            </div>
          )}

          {step === 2 && review && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.01em]">Review before signing</h2>
                <p className="mt-1 text-sm text-dim">This is exactly what your wallet will sign.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[12px] border border-pass/25 bg-pass/[0.05] p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#34d399]"><ShieldCheck className="size-4" />The agent may</h3>
                  <ul className="space-y-2 text-sm leading-relaxed">
                    <li className="flex gap-2"><Check className="mt-1 size-3.5 shrink-0 text-[#34d399]" />Send NEAR to <Mono>{review.input.recipient}</Mono> only</li>
                    <li className="flex gap-2"><Check className="mt-1 size-3.5 shrink-0 text-[#34d399]" />Up to {formatNear(review.input.max_per_tx)} NEAR per payment, {formatNear(review.input.max_total)} NEAR in total</li>
                    <li className="flex gap-2"><Check className="mt-1 size-3.5 shrink-0 text-[#34d399]" />Until {new Date(Number(review.input.expires_at_ms)).toLocaleString()}</li>
                    {review.input.review_threshold && <li className="flex gap-2"><Check className="mt-1 size-3.5 shrink-0 text-[#34d399]" />Pay up to {formatNear(review.input.review_threshold)} NEAR without asking you</li>}
                  </ul>
                </div>
                <div className="rounded-[12px] border border-block/25 bg-block/[0.05] p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#ff7b7b]"><ShieldX className="size-4" />The agent may not</h3>
                  <ul className="space-y-2 text-sm leading-relaxed">
                    <li className="flex gap-2"><ShieldX className="mt-1 size-3.5 shrink-0 text-[#ff7b7b]" />Pay anyone else, use another token, or call other contracts</li>
                    <li className="flex gap-2"><ShieldX className="mt-1 size-3.5 shrink-0 text-[#ff7b7b]" />Change these terms or reuse a past request</li>
                    <li className="flex gap-2"><ShieldX className="mt-1 size-3.5 shrink-0 text-[#ff7b7b]" />Act after you revoke it, or touch the rest of your vault</li>
                  </ul>
                </div>
              </div>
              <div className="surface-raised flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
                <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", review.onchain === review.local ? "bg-pass/12 text-[#34d399]" : "bg-block/12 text-[#ff7b7b]")}><Fingerprint className="size-5" /></span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Tamper check</div>
                  <p className="mt-0.5 text-[13px] text-dim">A SHA-256 fingerprint of these exact terms, computed by the contract and again in your browser. The contract refuses the capsule if the signed terms don't match it.</p>
                  <Mono className="mt-2 block text-[13px] text-faint">{review.onchain}</Mono>
                  {review.onchain === review.local
                    ? <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-[#34d399]"><Check className="size-4" />Both fingerprints match</p>
                    : <p className="mt-2 text-[13px] font-medium text-[#ff7b7b]">They don't match. Don't sign; check the configured contract.</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-6">
                <Button variant="ghost" onClick={() => setStep(1)}>Edit</Button>
                <Button variant="primary" size="lg" onClick={sign} disabled={review.onchain !== review.local || !isOwner} busy={busy === "create"}>Sign and create capsule</Button>
              </div>
              <p className="text-[13px] text-faint">For short expiries, sign promptly. The clock started when you clicked Review.</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-12 mb-5 flex items-end justify-between">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Your capsules</h2>
        <span className="text-[13px] text-faint">{capsules.length} total</span>
      </div>
      {loading && !overview ? <div className="surface p-6"><ListSkeleton rows={3} /></div> : capsules.length === 0 ? (
        <div className="surface"><Empty title="No capsules yet" icon={<FileLock2 className="size-5" />}>Create one above. Until then, your agents can't pay anyone.</Empty></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {capsules.map((c) => {
            const st = effectiveCapsuleStatus(c, now);
            const used = BigInt(c.spent) + BigInt(c.reserved);
            return (
              <article key={c.id} className={cx("surface flex flex-col p-5", st !== "Active" && "opacity-80")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="text-[15px] font-semibold">Capsule #{c.id}</span><span className="text-[13px] text-faint">version {c.version}</span></div>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-dim">“{c.instruction}”</p>
                  </div>
                  <CapsuleStatusBadge status={st} />
                </div>
                <dl className="mt-4 divide-y divide-line/70 border-y border-line/70">
                  <Row label="Agent"><Mono>{c.agent_id}</Mono></Row>
                  <Row label="May pay"><Mono>{c.recipient}</Mono></Row>
                  <Row label="Per payment"><span className="tabular">{near(c.max_per_tx)}{c.review_threshold ? `, ask above ${near(c.review_threshold)}` : ""}</span></Row>
                  <Row label={st === "Expired" ? "Expired" : "Expires"}>{ago(c.expires_at_ms)}</Row>
                </dl>
                <div className="mt-4">
                  <div className="mb-2 flex justify-between text-[13px]"><span className="text-dim">Used <span className="text-fg tabular">{near(used)}</span> of {near(c.max_total)}</span><Mono className="text-faint">{c.commitment.slice(0, 10)}…</Mono></div>
                  <Meter value={Number(used / 10n ** 18n)} max={Number(BigInt(c.max_total) / 10n ** 18n)} tone={used >= BigInt(c.max_total) ? "hold" : "signal"} label={`Capsule ${c.id} spending used`} />
                </div>
                {c.status === "Active" && (
                  <div className="mt-5 flex justify-end">
                    <Button variant="outline-danger" size="sm" disabled={!isOwner} busy={busy === `rc-${c.id}`} onClick={async () => {
                      if (await confirm({ title: `Revoke capsule #${c.id}?`, body: "The agent loses this permission immediately. This can't be undone; create a new capsule if you need it again.", confirmLabel: "Revoke capsule", tone: "danger" }))
                        run(`rc-${c.id}`, `Revoke capsule #${c.id}`, () => act.revokeCapsule(c.id));
                    }}>Revoke</Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className="mt-6 text-center"><Link href="/console/agents" className={buttonStyles("ghost", "sm")}>Manage agents</Link></div>
    </>
  );
}
