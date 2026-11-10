"use client";
import { useMemo, useState } from "react";
import {
  capsuleCommitment, draftToCapsuleInput, effectiveCapsuleStatus, formatNear, parseOwnerInstruction, validateCapsuleDraft,
  type CapsuleDraft,
} from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { viewCall } from "@/lib/rpc";
import { CONTRACT_ID } from "@/lib/config";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { Button, Empty, Field, Input, Mono, Notice, Panel, Select, Textarea } from "@/components/ui";
import { CapsuleStatusBadge } from "@/components/status";
import { ago, dur, near } from "@/lib/format";

const EXPIRY = [
  { s: 60, label: "1 minute (for the expiry demo)" },
  { s: 120, label: "2 minutes" },
  { s: 3600, label: "1 hour" },
  { s: 86400, label: "24 hours" },
  { s: 604800, label: "7 days" },
  { s: 2592000, label: "30 days" },
];

const blank: CapsuleDraft = { agentId: "", recipient: "", maxPerTx: "", maxTotal: "", reviewThreshold: "", expiresInSeconds: 86400, instruction: "" };

type Review = { input: ReturnType<typeof draftToCapsuleInput>; onchain: string; local: string };

export default function CapsulesPage() {
  const { agents, capsules, overview, isOwner } = useVault();
  const { call } = useWallet();
  const { run, busy, notify } = useAction();
  const act = ownerActions(call);
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
    setD((p) => ({ ...p, [k]: k === "expiresInSeconds" ? Number(e.target.value) : e.target.value }));
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
      ...(p.draft.expiresInSeconds && !EXPIRY.some((x) => x.s === p.draft.expiresInSeconds) ? [`Stated expiry (${dur(p.draft.expiresInSeconds * 1000)}) is not a preset; pick the closest option.`] : []),
      ...(unresolved.length ? [`Could not read: ${unresolved.join(", ")}. Fill these in yourself.`] : []),
      "Check every field. The parser only drafts; you are the one authorizing.",
    ]);
    setReview(null);
    setTouched(true);
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
    } catch (e) {
      notify({ tone: "block", text: `Could not prepare the review: ${e instanceof Error ? e.message : e}` });
    } finally {
      setReviewing(false);
    }
  }

  async function sign() {
    if (!review) return;
    const r = await run("create", "Create capsule", () => act.createCapsule({ ...review.input, expected_commitment: review.onchain }));
    if (r) { setReview(null); setD(blank); setTouched(false); setNotes([]); }
  }

  const now = Date.now();
  return (
    <>
      <PageTitle title="Intent capsules">A capsule is a signed, on-chain record of exactly what one agent may pay, to whom, how much and until when. The contract checks every agent request against it.</PageTitle>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Create a capsule">
          <div className="space-y-4">
            <Field label="Your instruction to the agent" hint="Sentinel drafts the fields from this text. Nothing is authorized until you review and sign.">
              <Textarea value={nl} onChange={(e) => setNl(e.target.value)} maxLength={500} />
            </Field>
            <Button onClick={draftFromInstruction}>Draft fields from instruction</Button>
            {notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-hold">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Agent" error={touched ? errors.agentId : undefined}>
                <Select value={d.agentId} onChange={set("agentId")}>
                  <option value="">Choose an agent</option>
                  {activeAgents.map((a) => <option key={a.account_id} value={a.account_id}>{a.label} ({a.account_id})</option>)}
                </Select>
              </Field>
              <Field label="Recipient" error={touched ? errors.recipient : undefined}>
                <Input value={d.recipient} onChange={set("recipient")} placeholder="vendor.testnet" autoComplete="off" />
              </Field>
              <Field label="Limit per payment (NEAR)" error={touched ? errors.maxPerTx : undefined}>
                <Input inputMode="decimal" value={d.maxPerTx} onChange={set("maxPerTx")} placeholder="3" />
              </Field>
              <Field label="Total limit (NEAR)" error={touched ? errors.maxTotal : undefined}>
                <Input inputMode="decimal" value={d.maxTotal} onChange={set("maxTotal")} placeholder="3" />
              </Field>
              <Field label="Ask me above (NEAR, optional)" error={touched ? errors.reviewThreshold : undefined} hint="Payments above this wait for your approval.">
                <Input inputMode="decimal" value={d.reviewThreshold} onChange={set("reviewThreshold")} placeholder="None" />
              </Field>
              <Field label="Expires after" error={touched ? errors.expiresInSeconds : undefined}>
                <Select value={d.expiresInSeconds} onChange={set("expiresInSeconds")}>
                  {EXPIRY.map((x) => <option key={x.s} value={x.s}>{x.label}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Instruction stored with the capsule" error={touched ? errors.instruction : undefined}>
              <Input value={d.instruction} onChange={set("instruction")} maxLength={500} />
            </Field>
            <Button variant="primary" onClick={prepareReview} disabled={!isOwner} busy={reviewing}>Review capsule</Button>
            <OwnerHint />
          </div>
        </Panel>

        <Panel title="Review before signing">
          {!review ? (
            <Empty title="Nothing to review yet">Fill in the form and choose Review capsule. You will see exactly what the agent can and cannot do.</Empty>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="mb-1.5 font-medium text-pass">The agent may</h3>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Send native NEAR to <Mono>{review.input.recipient}</Mono> only</li>
                  <li>Up to {formatNear(review.input.max_per_tx)} NEAR per payment and {formatNear(review.input.max_total)} NEAR in total</li>
                  <li>Until {new Date(Number(review.input.expires_at_ms)).toLocaleString()}</li>
                  {review.input.review_threshold && <li>Without asking you, up to {formatNear(review.input.review_threshold)} NEAR per payment</li>}
                </ul>
              </div>
              <div>
                <h3 className="mb-1.5 font-medium text-block">The agent may not</h3>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Pay anyone else, use another token, or call other contracts</li>
                  <li>Change these terms, reuse a request, or act after you revoke it</li>
                  <li>Touch the rest of your vault balance</li>
                </ul>
              </div>
              <div className="rounded-md border border-line p-3">
                <div className="text-dim">Commitment (SHA-256 of the canonical terms)</div>
                <Mono className="mt-1 block">{review.onchain}</Mono>
                {review.onchain === review.local
                  ? <p className="mt-2 text-xs text-pass">Matches the hash computed independently in your browser.</p>
                  : <p className="mt-2 text-xs text-block">Does not match the hash computed in your browser. Do not sign; check the configured contract.</p>}
              </div>
              <Button variant="primary" onClick={sign} disabled={review.onchain !== review.local || !isOwner} busy={busy === "create"}>Sign and commit capsule</Button>
              <p className="text-xs text-faint">The contract rejects the transaction if the terms you sign hash to anything other than this commitment.</p>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Capsules" className="mt-4">
        {capsules.length === 0 ? <Empty title="No capsules yet">Create one above.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-line text-left text-dim">
                <th scope="col" className="py-2 pr-3 font-medium">Capsule</th><th scope="col" className="py-2 pr-3 font-medium">Agent → recipient</th>
                <th scope="col" className="py-2 pr-3 font-medium">Spent / total</th><th scope="col" className="py-2 pr-3 font-medium">Expires</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th><th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {capsules.map((c) => {
                  const st = effectiveCapsuleStatus(c, now);
                  return (
                    <tr key={c.id} className="border-b border-line/60 align-top">
                      <td className="py-2.5 pr-3"><div className="font-medium">#{c.id} <span className="text-faint">v{c.version}</span></div><Mono className="text-xs text-faint" >{c.commitment.slice(0, 16)}…</Mono></td>
                      <td className="py-2.5 pr-3"><Mono>{c.agent_id}</Mono><div className="text-dim">→ <Mono>{c.recipient}</Mono></div><div className="mt-1 max-w-xs text-xs text-faint">“{c.instruction}”</div></td>
                      <td className="py-2.5 pr-3 tabular">{near(c.spent)} / {near(c.max_total)}<div className="text-xs text-faint">≤ {near(c.max_per_tx)} each{c.review_threshold ? `, review above ${near(c.review_threshold)}` : ""}</div></td>
                      <td className="py-2.5 pr-3">{ago(c.expires_at_ms)}</td>
                      <td className="py-2.5 pr-3"><CapsuleStatusBadge status={st} /></td>
                      <td className="py-2.5 text-right">
                        {c.status === "Active" && <Button variant="danger" disabled={!isOwner} busy={busy === `rc-${c.id}`} onClick={() => run(`rc-${c.id}`, `Revoke capsule #${c.id}`, () => act.revokeCapsule(c.id))}>Revoke</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
