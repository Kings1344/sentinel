"use client";
import { useEffect, useState } from "react";
import { parseNear } from "@sentinel/engine";
import { useVault, POLL_KEY } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { PREF_NOTIFY_ACTIVITY, readPref, writePref } from "@/lib/prefs";
import { CONTRACT_ID, NETWORK_ID, RPC_URL, EXPLORER_URL, accountUrl } from "@/lib/config";
import { PageTitle, OwnerHint, EmergencyStop, useAction } from "@/components/ConsoleShell";
import { useConfirm } from "@/components/Overlays";
import { Button, Field, Input, Mono, Notice, Panel, Select, Switch } from "@/components/ui";
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
      <PageTitle title="Settings">Your wallet, the network this app reads from, your vault's funds and the emergency controls.</PageTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Wallet">
          {accountId ? (
            <div className="space-y-3 text-sm">
              <p>Connected as <Mono>{accountId}</Mono>.</p>
              {overview && <p className={isOwner ? "text-pass" : "text-dim"}>{isOwner ? "This is the vault owner. You can sign capsules and use every control." : `This isn't the vault owner (${overview.owner}). You can view everything but can't change it.`}</p>}
              <Button onClick={signOut}>Disconnect wallet</Button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-dim">Connect the owner's NEAR wallet to deposit, create capsules and approve payments. Viewing works without a wallet.</p>
              <Button variant="primary" onClick={signIn}>Connect wallet</Button>
            </div>
          )}
        </Panel>

        <Panel title="Network">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-dim">Network</dt><dd>NEAR {NETWORK_ID}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Vault contract</dt><dd>{CONTRACT_ID ? <a className="text-[#8fb6ff] hover:underline" href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer"><Mono>{CONTRACT_ID}</Mono></a> : <span className="text-block">Not set</span>}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Data source</dt><dd><Mono>{RPC_URL}</Mono></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Explorer</dt><dd><Mono>{EXPLORER_URL}</Mono></dd></div>
          </dl>
          <p className="mt-3 text-xs text-faint">These are fixed when the app is built, so nobody can point this page at a different vault.</p>
        </Panel>

        <Panel title="Vault funds">
          {overview && <p className="mb-4 text-sm">Available <span className="font-semibold tabular">{near(overview.vault_balance)}</span>, reserved for payments in progress <span className="tabular">{near(overview.total_reserved)}</span>.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (validAmount(dep)) run("dep", "Deposit", () => act.deposit(dep)); }}>
              <Field label="Add funds (NEAR)" error={dep && !validAmount(dep) ? "Enter an amount above 0." : undefined}><Input inputMode="decimal" value={dep} onChange={(e) => setDep(e.target.value)} /></Field>
              <Button type="submit" variant="primary" disabled={!isOwner || !validAmount(dep)} busy={busy === "dep"}>Deposit</Button>
            </form>
            <form className="space-y-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!validAmount(wd)) return;
              if (await confirm({ title: `Withdraw ${wd} NEAR to your wallet?`, body: "The amount goes back to the owner account. Reserved funds stay in the vault until their payments settle.", confirmLabel: "Withdraw", tone: "primary" }))
                run("wd", "Withdraw", () => act.withdraw(wd));
            }}>
              <Field label="Withdraw to your wallet (NEAR)" error={wd && !validAmount(wd) ? "Enter an amount above 0." : undefined}><Input inputMode="decimal" value={wd} onChange={(e) => setWd(e.target.value)} placeholder={overview ? near(overview.vault_balance, 2).replace(" NEAR", "") : ""} /></Field>
              <Button type="submit" disabled={!isOwner || !validAmount(wd)} busy={busy === "wd"}>Withdraw</Button>
            </form>
          </div>
          <div className="mt-3"><OwnerHint /></div>
        </Panel>

        <Panel title="Emergency kill switch">
          <div className="space-y-3 text-sm">
            {overview?.frozen
              ? <Notice tone="hold">The vault is frozen. Agents can't move any funds. You can still withdraw.</Notice>
              : <p className="text-dim">One click stops every agent payment. It uses your quick sign-in key, so it works instantly. Unfreezing gives agents power back, so it asks for full wallet confirmation.</p>}
            <EmergencyStop />
            <OwnerHint />
          </div>
        </Panel>

        <Panel title="Notifications and refresh" className="lg:col-span-2">
          <div className="grid gap-6 sm:grid-cols-2">
            <Switch
              checked={notify}
              onChange={(v) => { setNotify(v); writePref(PREF_NOTIFY_ACTIVITY, v); }}
              label="Notify me about agent activity"
              description="New approvals, blocks and payments appear in the bell while this app is open."
            />
            <div className="flex items-end gap-2">
              <Field label="Check the contract every">
                <Select value={poll} onChange={(e) => setPoll(e.target.value)}>
                  {["3", "5", "8", "15", "30"].map((s) => <option key={s} value={s}>{s} seconds</option>)}
                </Select>
              </Field>
              <Button onClick={() => { try { localStorage.setItem(POLL_KEY, poll); } catch {} location.reload(); }}>Save</Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-faint">Saved in this browser only. Security rules live in the contract, not here.</p>
        </Panel>
      </div>
    </>
  );
}
