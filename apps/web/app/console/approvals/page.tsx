"use client";
import Link from "next/link";
import { UserCheck } from "lucide-react";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { useConfirm } from "@/components/Overlays";
import { Button, Empty, ListSkeleton, Mono, Panel } from "@/components/ui";
import { IntentDiff, diffRows } from "@/components/IntentDiff";
import { ago, near } from "@/lib/format";

export default function ApprovalsPage() {
  const { requests, capsules, isOwner, loading, overview } = useVault();
  const { call } = useWallet();
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const act = ownerActions(call);
  const pending = requests.filter((r) => r.status === "PendingReview");
  const decided = requests.filter((r) => r.status === "ReviewRejected" || r.reason === "OwnerApproved").slice(0, 5);

  return (
    <>
      <PageTitle title="Approvals">Payments above a capsule's review limit wait here for you. The funds stay reserved in the vault until you approve or reject.</PageTitle>
      {loading && !overview ? <ListSkeleton rows={3} /> : pending.length === 0 ? (
        <Empty title="Nothing needs your approval" icon={<UserCheck className="size-6" />}>
          To use this, set <strong>Ask me above</strong> when you <Link href="/console/capsules" className="text-[#8fb6ff]">create a capsule</Link>. Larger payments then wait for you instead of going out automatically.
        </Empty>
      ) : (
        <div className="space-y-4">
          {pending.map((r) => {
            const c = capsules.find((x) => x.id === r.capsule_id);
            return (
              <Panel key={r.id} title={`${near(r.amount)} to ${r.recipient}`} description={<>Requested by <Mono>{r.agent_id}</Mono> {ago(r.created_at_ms)}, capsule #{r.capsule_id}</>}>
                <div className="space-y-4">
                  <p className="text-sm">{r.explanation}</p>
                  {c && <IntentDiff animate={false} rows={diffRows({ operation: c.operation, asset: c.asset, recipient: c.recipient, max_per_tx: c.max_per_tx }, r)} caption={`Request ${r.id} compared with capsule ${c.id}`} />}
                  {c && <p className="text-sm text-dim">Your instruction: “{c.instruction}”</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="approve" disabled={!isOwner} busy={busy === `ap-${r.id}`} onClick={async () => {
                      if (await confirm({ title: `Send ${near(r.amount)} to ${r.recipient}?`, body: "The contract re-checks that the capsule, agent and vault are still valid, then pays. Your wallet asks for full confirmation.", confirmLabel: "Approve and pay", tone: "approve" }))
                        run(`ap-${r.id}`, `Approve request #${r.id}`, () => act.resolveReview(r.id, true));
                    }}>Approve and pay</Button>
                    <Button variant="danger" disabled={!isOwner} busy={busy === `rj-${r.id}`} onClick={() => run(`rj-${r.id}`, `Reject request #${r.id}`, () => act.resolveReview(r.id, false))}>Reject</Button>
                    <Link href={`/console/transactions/${r.id}`} className="text-sm text-dim hover:text-fg">Details</Link>
                  </div>
                  <OwnerHint />
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      {decided.length > 0 && (
        <Panel title="Recently decided" className="mt-4">
          <ul className="divide-y divide-line/70 text-sm">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <Link href={`/console/transactions/${r.id}`} className="hover:underline">#{r.id}, {near(r.amount)} to <Mono>{r.recipient}</Mono></Link>
                <span className={r.reason === "OwnerApproved" ? "text-pass" : "text-block"}>{r.reason === "OwnerApproved" ? "You approved it" : r.reason === "OwnerRejected" ? "You rejected it" : "Approval no longer valid"}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
