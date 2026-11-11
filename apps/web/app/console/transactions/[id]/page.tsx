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
import { Button, Empty, ListSkeleton, Mono, Panel, Row, buttonStyles, cx } from "@/components/ui";
import { DecisionBadge, StatusPill, reasonText } from "@/components/status";
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

  const back = <Link href="/console/transactions" className={buttonStyles("ghost", "sm", "mb-6 -ml-3")}><ArrowLeft className="size-4" />All transactions</Link>;
  if (!r) return <>{back}<div className="surface">{fetched === null ? <Empty title={`Transaction #${id} not found`}>It may be older than the newest 500 requests the contract keeps.</Empty> : <div className="p-6"><ListSkeleton rows={5} /></div>}</div></>;

  const approved = r.decision === "Approved";
  const pending = r.status === "PendingReview";
  const Icon = pending ? ShieldAlert : approved ? ShieldCheck : ShieldX;
  const tone = pending ? "hold" : approved ? "pass" : "block";
  const act = ownerActions(call);

  return (
    <>
      {back}
      <div className={cx("mb-6 rounded-[16px] border p-6 lg:p-7", tone === "pass" && "border-pass/25 bg-pass/[0.06]", tone === "block" && "border-block/25 bg-block/[0.06]", tone === "hold" && "border-hold/25 bg-hold/[0.06]")}>
        <div className="flex flex-wrap items-start gap-5">
          <span className={cx("grid size-14 shrink-0 place-items-center rounded-2xl", tone === "pass" && "bg-pass/15 text-[#34d399]", tone === "block" && "bg-block/15 text-[#ff7b7b]", tone === "hold" && "bg-hold/15 text-[#fbbf24]")}><Icon className="size-7" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-dim">Transaction #{r.id}</div>
            <h1 className="mt-0.5 text-[26px] leading-tight font-semibold tracking-[-0.025em]">{reasonText(r.reason)}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2"><StatusPill r={r} /><DecisionBadge decision={r.decision} /></div>
            <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-fg/90">{r.explanation}</p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-dim">
              <Mono className="text-fg/85">{r.agent_id}</Mono> asked to send {near(r.amount)} to <Mono className="text-fg/85">{r.recipient}</Mono>.{" "}
              {approved ? (r.status === "Executed" ? "The contract sent it." : r.status === "TransferFailed" ? "The transfer failed and the money went back to the vault." : "It is settling.") : pending ? "The money is reserved until you decide." : "The contract refused it, and no funds moved."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="What you authorized vs what the agent asked for">
          {c ? (
            <div className="space-y-4">
              <IntentDiff animate={false} rows={diffRows({ operation: c.operation, asset: c.asset, recipient: c.recipient, max_per_tx: c.max_per_tx }, r)} caption={`Capsule ${c.id} compared with request ${r.id}`} />
              <p className="text-[13px] leading-relaxed text-dim">Your instruction for capsule #{c.id}: “{c.instruction}”</p>
            </div>
          ) : <p className="text-sm leading-relaxed text-dim">Capsule #{r.capsule_id} does not exist. The agent referenced a capsule that was never created.</p>}
          {pending && (
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
              <Button variant="approve" disabled={!isOwner} busy={busy === `ap-${r.id}`} onClick={async () => {
                if (await confirm({ title: `Send ${near(r.amount)} to ${r.recipient}?`, body: "The contract re-checks the capsule and agent, then pays.", confirmLabel: "Approve and pay", tone: "approve" }))
                  run(`ap-${r.id}`, `Approve request #${r.id}`, () => act.resolveReview(r.id, true));
              }}>Approve and pay</Button>
              <Button variant="outline-danger" disabled={!isOwner} busy={busy === `rj-${r.id}`} onClick={() => run(`rj-${r.id}`, `Reject request #${r.id}`, () => act.resolveReview(r.id, false))}>Reject</Button>
              <OwnerHint />
            </div>
          )}
        </Panel>

        <Panel title="Record">
          <dl className="-my-2 divide-y divide-line/70">
            <Row label="Agent"><Mono>{r.agent_id}</Mono></Row>
            <Row label="Capsule">#{r.capsule_id}</Row>
            <Row label="Operation"><Mono>{r.operation}</Mono></Row>
            <Row label="Asset"><Mono>{r.asset}</Mono></Row>
            <Row label="Amount"><span className="tabular">{near(r.amount, 6)}</span></Row>
            <Row label="Sequence"><span className="tabular">{r.nonce}</span></Row>
            <Row label="Block"><span className="tabular">{r.block_height}</span></Row>
            <Row label="Time">{new Date(Number(r.created_at_ms)).toLocaleString()}</Row>
            {r.memo && <Row label="Memo"><Mono>{r.memo}</Mono></Row>}
          </dl>
          <div className="mt-4 border-t border-line pt-4 text-sm">
            {hash ? (
              <a href={txUrl(hash)} target="_blank" rel="noreferrer" className={buttonStyles("secondary", "sm", "w-full")}>View transaction on NearBlocks <ExternalLink className="size-3.5" /></a>
            ) : (
              <p className="text-[13px] leading-relaxed text-dim">This request was submitted from another browser. Find its transaction on the <a href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer" className="text-link hover:underline">vault's explorer page</a>.</p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
