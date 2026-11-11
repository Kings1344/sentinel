"use client";
import { useEffect, useState } from "react";
import { BellRing, Globe, OctagonX, Wallet, Vault } from "lucide-react";
import { parseNear } from "@sentinel/engine";
import { useVault, POLL_KEY } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { PREF_NOTIFY_ACTIVITY, readPref, writePref } from "@/lib/prefs";
import { CONTRACT_ID, NETWORK_ID, RPC_URL, EXPLORER_URL, accountUrl } from "@/lib/config";
import { PageTitle, OwnerHint, EmergencyStop, useAction } from "@/components/ConsoleShell";
import { useConfirm } from "@/components/Overlays";
import { AmountInput, Button, Field, Mono, Notice, Panel, Row, Segmented, Switch } from "@/components/ui";
import { near } from "@/lib/format";

const validAmount = (v: string) => { try { return parseNear(v) > 0n; } catch { return false; } };

export default function SettingsPage() {
  const { overview, isOwner } = useVault();
  const { accountId, signIn, signOut, call } = useWallet();
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const act = ownerActions(call);
  const [dep, setDep] = useState("1");
  const [wd, setWd] = useState("");
  const [poll, setPoll] = useState("8");
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    try { setPoll(localStorage.getItem(POLL_KEY) ?? "8"); } catch {}
    setNotify(readPref(PREF_NOTIFY_ACTIVITY, true));
  }, []);

  return (
    <>
      <PageTitle title="Settings">Your wallet, the network this console reads from, your vault's funds and the emergency controls.</PageTitle>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Wallet" icon={<Wallet className="size-4" />}>
          {accountId ? (
            <div className="space-y-4">
              <div className="surface-raised flex items-center gap-3 p-4">
                <span className={isOwner ? "grid size-10 place-items-center rounded-lg bg-pass/15 font-semibold text-[#34d399] uppercase" : "grid size-10 place-items-center rounded-lg bg-signal/15 font-semibold text-link uppercase"}>{accountId.slice(0, 1)}</span>
                <div className="min-w-0"><Mono className="block text-sm text-fg">{accountId}</Mono><div className={isOwner ? "text-[13px] text-[#34d399]" : "text-[13px] text-dim"}>{isOwner ? "Vault owner" : "View only"}</div></div>
              </div>
              {overview && !isOwner && <p className="text-[13px] leading-relaxed text-dim">This account isn't the vault owner ({overview.owner}). You can view everything but can't change it.</p>}
              <Button onClick={signOut}>Disconnect wallet</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-dim">Connect the owner's NEAR wallet to deposit, create capsules and approve payments. Viewing works without a wallet.</p>
              <Button variant="primary" onClick={signIn}><Wallet className="size-4" />Connect wallet</Button>
            </div>
          )}
        </Panel>

        <Panel title="Network" icon={<Globe className="size-4" />}>
          <dl className="-my-2 divide-y divide-line/70">
            <Row label="Network">NEAR {NETWORK_ID}</Row>
            <Row label="Vault contract">{CONTRACT_ID ? <a className="text-link hover:underline" href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer"><Mono>{CONTRACT_ID}</Mono></a> : <span className="text-[#ff7b7b]">Not set</span>}</Row>
            <Row label="Data source"><Mono className="text-dim">{RPC_URL}</Mono></Row>
            <Row label="Explorer"><Mono className="text-dim">{EXPLORER_URL}</Mono></Row>
          </dl>
          <p className="mt-4 text-[13px] leading-relaxed text-faint">Fixed when the app is built, so nobody can point this console at a different vault.</p>
        </Panel>

        <Panel title="Vault funds" icon={<Vault className="size-4" />}>
          {overview && (
            <div className="mb-6 grid grid-cols-2 gap-3">
              <div className="surface-raised p-4"><div className="text-[13px] text-dim">Available</div><div className="mt-1 text-xl font-semibold tracking-[-0.02em] tabular">{near(overview.vault_balance)}</div></div>
              <div className="surface-raised p-4"><div className="text-[13px] text-dim">Reserved</div><div className="mt-1 text-xl font-semibold tracking-[-0.02em] tabular">{near(overview.total_reserved)}</div></div>
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (validAmount(dep)) run("dep", "Deposit", () => act.deposit(dep)); }}>
              <Field label="Add funds" error={dep && !validAmount(dep) ? "Enter an amount above 0." : undefined}><AmountInput value={dep} onChange={(e) => setDep(e.target.value)} /></Field>
              <Button type="submit" variant="primary" className="w-full" disabled={!isOwner || !validAmount(dep)} busy={busy === "dep"}>Deposit</Button>
            </form>
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault();
              if (!validAmount(wd)) return;
              if (await confirm({ title: `Withdraw ${wd} NEAR to your wallet?`, body: "The amount goes back to the owner account. Reserved funds stay in the vault until their payments settle.", confirmLabel: "Withdraw", tone: "primary" }))
                run("wd", "Withdraw", () => act.withdraw(wd));
            }}>
              <Field label="Withdraw to your wallet" error={wd && !validAmount(wd) ? "Enter an amount above 0." : undefined}><AmountInput value={wd} onChange={(e) => setWd(e.target.value)} placeholder={overview ? near(overview.vault_balance, 2).replace(" NEAR", "") : ""} /></Field>
              <Button type="submit" className="w-full" disabled={!isOwner || !validAmount(wd)} busy={busy === "wd"}>Withdraw</Button>
            </form>
          </div>
          <div className="mt-4"><OwnerHint /></div>
        </Panel>

        <Panel title="Emergency kill switch" icon={<OctagonX className="size-4" />}>
          <div className="space-y-4">
            {overview?.frozen
              ? <Notice tone="hold" title="The vault is frozen">Agents can't move any funds. You can still withdraw.</Notice>
              : <p className="text-sm leading-relaxed text-dim">One click stops every agent payment. It uses your quick sign-in key so it works instantly. Unfreezing gives agents power back, so it asks for full wallet confirmation.</p>}
            <EmergencyStop />
            <OwnerHint />
          </div>
        </Panel>

        <Panel title="Notifications and refresh" icon={<BellRing className="size-4" />} className="xl:col-span-2">
          <div className="grid gap-8 md:grid-cols-2">
            <Switch checked={notify} onChange={(v) => { setNotify(v); writePref(PREF_NOTIFY_ACTIVITY, v); }} label="Notify me about agent activity" description="New approvals, blocks and payments appear in the bell while this console is open." />
            <div>
              <div className="text-sm font-medium">Check the contract every</div>
              <div className="mt-0.5 mb-3 text-[13px] text-dim">Faster refresh shows new activity sooner.</div>
              <div className="flex flex-wrap items-center gap-3">
                <Segmented label="Refresh interval" value={poll} onChange={setPoll} options={["3", "5", "8", "15", "30"].map((s) => ({ value: s, label: `${s}s` }))} />
                <Button size="sm" onClick={() => { try { localStorage.setItem(POLL_KEY, poll); } catch {} location.reload(); }}>Apply</Button>
              </div>
            </div>
          </div>
          <p className="mt-6 border-t border-line pt-4 text-[13px] text-faint">Saved in this browser only. Security rules live in the contract, not here.</p>
        </Panel>
      </div>
    </>
  );
}
