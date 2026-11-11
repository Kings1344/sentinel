"use client";
import Link from "next/link";
import { Hourglass, UserCheck } from "lucide-react";
import { useVault } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { useConfirm } from "@/components/Overlays";
import { Button, Empty, ListSkeleton, Mono, Panel, buttonStyles } from "@/components/ui";
import { IntentDiff, diffRows } from "@/components/IntentDiff";
import { StatusPill } from "@/components/status";
import { ago, near } from "@/lib/format";

export default function ApprovalsPage() {
  const { requests, capsules, isOwner, loading, overview } = useVault();
  const { call } = useWallet();
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const act = ownerActions(call);
  const pending = requests.filter((r) => r.status === "PendingReview");
  const decided = requests.filter((r) => r.status === "ReviewRejected" || r.reason === "OwnerApproved").slice(0, 6);

  return (
    <>
      <PageTitle title="Approvals">Payments above a capsule's approval limit wait here. The funds stay reserved in the vault until you approve or reject.</PageTitle>
      {loading && !overview ? <div className="surface p-6"><ListSkeleton rows={3} /></div> : pending.length === 0 ? (
        <div className="surface">
          <Empty title="Nothing needs your approval" icon={<UserCheck className="size-5" />} action={<Link href="/console/capsules" className={buttonStyles("secondary", "sm")}>Create a capsule</Link>}>
            Set <strong className="text-fg">Ask me above</strong> when you create a capsule. Larger payments then wait here instead of going out automatically.
          </Empty>
        </div>
      ) : (
        <div className="space-y-5">
          {pending.map((r) => {
            const c = capsules.find((x) => x.id === r.capsule_id);
            return (
              <article key={r.id} className="surface overflow-hidden">
                <div className="flex flex-wrap items-start gap-4 border-b border-line p-6">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-hold/30 bg-hold/10 text-[#fbbf24]"><Hourglass className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[22px] font-semibold tracking-[-0.02em] tabular">{near(r.amount)}</div>
                    <div className="mt-0.5 text-sm text-dim">to <Mono className="text-fg">{r.recipient}</Mono>, requested by <Mono className="text-fg">{r.agent_id}</Mono> {ago(r.created_at_ms)}</div>
                  </div>
                  <StatusPill r={r} />
                </div>
                <div className="space-y-5 p-6">
                  <p className="text-sm leading-relaxed">{r.explanation}</p>
                  {c && <IntentDiff animate={false} rows={diffRows({ operation: c.operation, asset: c.asset, recipient: c.recipient, max_per_tx: c.max_per_tx }, r)} caption={`Compared with capsule #${c.id}`} />}
                  {c && <p className="text-[13px] text-dim">Your instruction: “{c.instruction}”</p>}
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
                    <Button variant="approve" disabled={!isOwner} busy={busy === `ap-${r.id}`} onClick={async () => {
                      if (await confirm({ title: `Send ${near(r.amount)} to ${r.recipient}?`, body: "The contract re-checks that the capsule, agent and vault are still valid, then pays. Your wallet asks for full confirmation.", confirmLabel: "Approve and pay", tone: "approve" }))
                        run(`ap-${r.id}`, `Approve request #${r.id}`, () => act.resolveReview(r.id, true));
                    }}>Approve and pay</Button>
                    <Button variant="outline-danger" disabled={!isOwner} busy={busy === `rj-${r.id}`} onClick={() => run(`rj-${r.id}`, `Reject request #${r.id}`, () => act.resolveReview(r.id, false))}>Reject</Button>
                    <Link href={`/console/transactions/${r.id}`} className={buttonStyles("ghost")}>Details</Link>
                  </div>
                  <OwnerHint />
                </div>
              </article>
            );
          })}
        </div>
      )}
      {decided.length > 0 && (
        <Panel title="Recently decided" className="mt-8" padded={false}>
          <ul className="divide-y divide-line/70">
            {decided.map((r) => (
              <li key={r.id}>
                <Link href={`/console/transactions/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-sm transition-colors hover:bg-hover/50">
                  <span>Request #{r.id}, {near(r.amount)} to <Mono>{r.recipient}</Mono></span>
                  <StatusPill r={r} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
