"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { Capsule, RequestRecord } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { viewCall } from "@/lib/rpc";
import { txFor } from "@/lib/txlog";
import { txUrl, accountUrl, CONTRACT_ID } from "@/lib/config";
import { OwnerHint, useAction } from "@/components/ConsoleShell";
import { useConfirm } from "@/components/Overlays";
import { Button, Empty, ListSkeleton, Mono, Panel, cx } from "@/components/ui";
import { DecisionBadge, RequestStatusBadge, reasonText } from "@/components/status";
import { IntentDiff, diffRows } from "@/components/IntentDiff";
import { near } from "@/lib/format";

export default function TransactionDetail() {
  const { id } = useParams<{ id: string }>();
  const rid = Number(id);
  const { requests, capsules, isOwner } = useVault();
  const { call } = useWallet();
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const [fetched, setFetched] = useState<RequestRecord | null | undefined>(undefined);
  const [fetchedCapsule, setFetchedCapsule] = useState<Capsule | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const fromList = requests.find((r) => r.id === rid);
  const r = fromList ?? fetched ?? null;
  const c = r ? capsules.find((x) => x.id === r.capsule_id) ?? fetchedCapsule : null;

  useEffect(() => { setHash(txFor(rid)); }, [rid]);
  useEffect(() => {
    if (fromList || !Number.isInteger(rid) || rid < 1) return;
    viewCall<RequestRecord | null>("get_request", { request_id: rid }).then(setFetched).catch(() => setFetched(null));
  }, [rid, fromList]);
  useEffect(() => {
    if (!r || capsules.some((x) => x.id === r.capsule_id)) return;
    viewCall<Capsule | null>("get_capsule", { capsule_id: r.capsule_id }).then(setFetchedCapsule).catch(() => {});
  }, [r, capsules]);

  const back = <Link href="/console/transactions" className="mb-4 inline-flex items-center gap-1.5 text-sm text-dim hover:text-fg"><ArrowLeft className="size-4" />All transactions</Link>;
  if (!r) return <>{back}{fetched === null ? <Empty title={`Transaction #${id} not found`}>It may be older than the newest 500 requests the contract keeps.</Empty> : <ListSkeleton rows={5} />}</>;

  const approved = r.decision === "Approved";
  const pending = r.status === "PendingReview";
  const Icon = pending ? ShieldAlert : approved ? ShieldCheck : ShieldX;
  const tone = pending ? "hold" : approved ? "pass" : "block";
  const act = ownerActions(call);

  return (
    <>
      {back}
      <div className={cx("mb-4 rounded-xl border p-5", tone === "pass" && "border-pass/40 bg-pass/6", tone === "block" && "border-block/40 bg-block/6", tone === "hold" && "border-hold/40 bg-hold/6")}>
        <div className="flex flex-wrap items-start gap-4">
          <Icon className={cx("size-8 shrink-0", tone === "pass" && "text-pass", tone === "block" && "text-block", tone === "hold" && "text-hold")} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Transaction #{r.id}: {reasonText(r.reason)}</h1>
              <DecisionBadge decision={r.decision} />
              <RequestStatusBadge status={r.status} />
            </div>
            <p className="mt-1.5 text-sm">{r.explanation}</p>
            <p className="mt-2 text-sm text-dim">
              <Mono>{r.agent_id}</Mono> asked to send {near(r.amount)} to <Mono>{r.recipient}</Mono>.{" "}
              {approved ? (r.status === "Executed" ? "The contract sent it." : r.status === "TransferFailed" ? "The transfer failed and the money went back to the vault." : "It is settling.") : pending ? "The money is reserved until you decide." : "The contract refused it, and no funds moved."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="What you authorized vs what the agent asked for">
          {c ? (
            <div className="space-y-3">
              <IntentDiff animate={false} rows={diffRows({ operation: c.operation, asset: c.asset, recipient: c.recipient, max_per_tx: c.max_per_tx }, r)} caption={`Capsule ${c.id} compared with request ${r.id}`} />
              <p className="text-sm text-dim">Your instruction for capsule #{c.id}: “{c.instruction}”</p>
            </div>
          ) : <p className="text-sm text-dim">Capsule #{r.capsule_id} does not exist. The agent referenced a capsule that was never created.</p>}
          {pending && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="approve" disabled={!isOwner} busy={busy === `ap-${r.id}`} onClick={async () => {
                if (await confirm({ title: `Send ${near(r.amount)} to ${r.recipient}?`, body: "The contract re-checks the capsule and agent, then pays.", confirmLabel: "Approve and pay", tone: "approve" }))
                  run(`ap-${r.id}`, `Approve request #${r.id}`, () => act.resolveReview(r.id, true));
              }}>Approve and pay</Button>
              <Button variant="danger" disabled={!isOwner} busy={busy === `rj-${r.id}`} onClick={() => run(`rj-${r.id}`, `Reject request #${r.id}`, () => act.resolveReview(r.id, false))}>Reject</Button>
              <OwnerHint />
            </div>
          )}
        </Panel>

        <Panel title="Record">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-dim">Agent</dt><dd><Mono>{r.agent_id}</Mono></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Capsule</dt><dd>#{r.capsule_id}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Operation</dt><dd><Mono>{r.operation}</Mono></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Asset</dt><dd><Mono>{r.asset}</Mono></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Amount</dt><dd className="tabular">{near(r.amount, 6)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Nonce</dt><dd className="tabular">{r.nonce}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Block</dt><dd className="tabular">{r.block_height}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Time</dt><dd>{new Date(Number(r.created_at_ms)).toLocaleString()}</dd></div>
            {r.memo && <div className="flex justify-between gap-3"><dt className="text-dim">Memo</dt><dd><Mono>{r.memo}</Mono></dd></div>}
          </dl>
          <div className="mt-4 border-t border-line/70 pt-3 text-sm">
            {hash ? (
              <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[#8fb6ff] hover:underline">View transaction on NearBlocks <ExternalLink className="size-3.5" /></a>
            ) : (
              <p className="text-dim">This request was submitted from another browser. Find its transaction on the <a href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer" className="text-[#8fb6ff] hover:underline">vault's explorer page</a>.</p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
