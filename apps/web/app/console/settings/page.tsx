"use client";
import { useEffect, useState } from "react";
import { parseNear } from "@sentinel/engine";
import { useVault, POLL_KEY } from "@/lib/vault";
import { useWallet } from "@/lib/wallet";
import { ownerActions } from "@/lib/actions";
import { CONTRACT_ID, NETWORK_ID, RPC_URL, EXPLORER_URL, accountUrl } from "@/lib/config";
import { PageTitle, OwnerHint, useAction } from "@/components/ConsoleShell";
import { Button, Field, Input, Mono, Notice, Panel, Select } from "@/components/ui";
import { near } from "@/lib/format";

const validAmount = (v: string) => { try { return parseNear(v) > 0n; } catch { return false; } };

export default function SettingsPage() {
  const { overview, isOwner, refresh } = useVault();
  const { accountId, signIn, signOut, call } = useWallet();
  const { run, busy } = useAction();
  const act = ownerActions(call);
  const [dep, setDep] = useState("1");
  const [wd, setWd] = useState("");
  const [poll, setPoll] = useState("8");
  useEffect(() => { try { setPoll(localStorage.getItem(POLL_KEY) ?? "8"); } catch {} }, []);

  return (
    <>
      <PageTitle title="Settings">Wallet, network and vault controls.</PageTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Wallet">
          {accountId ? (
            <div className="space-y-3 text-sm">
              <p>Connected as <Mono>{accountId}</Mono>{isOwner ? ", the vault owner." : "."}</p>
              <Button onClick={signOut}>Disconnect</Button>
            </div>
          ) : (
            <div className="space-y-3 text-sm"><p className="text-dim">No wallet connected.</p><Button variant="primary" onClick={signIn}>Connect wallet</Button></div>
          )}
        </Panel>

        <Panel title="Network">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-dim">Network</dt><dd>{NETWORK_ID}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Vault contract</dt><dd>{CONTRACT_ID ? <a className="text-[#7fb0ff] hover:underline" href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer"><Mono>{CONTRACT_ID}</Mono></a> : <span className="text-block">not set</span>}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">RPC</dt><dd><Mono>{RPC_URL}</Mono></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-dim">Explorer</dt><dd><Mono>{EXPLORER_URL}</Mono></dd></div>
          </dl>
          <p className="mt-3 text-xs text-faint">Change these in apps/web/.env.local and restart the app. They are fixed at build time so a page cannot be pointed at a different vault.</p>
          <div className="mt-4 flex items-end gap-2">
            <Field label="Refresh contract data every">
              <Select value={poll} onChange={(e) => setPoll(e.target.value)}>
                {["3", "5", "8", "15", "30"].map((s) => <option key={s} value={s}>{s} seconds</option>)}
              </Select>
            </Field>
            <Button onClick={() => { try { localStorage.setItem(POLL_KEY, poll); } catch {} location.reload(); }}>Save</Button>
          </div>
        </Panel>

        <Panel title="Vault funds">
          {overview && <p className="mb-3 text-sm">Available: <span className="tabular">{near(overview.vault_balance)}</span>. Reserved for settling payments: <span className="tabular">{near(overview.total_reserved)}</span>.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (validAmount(dep)) run("dep", "Deposit", () => act.deposit(dep)); }}>
              <Field label="Deposit (NEAR)" error={dep && !validAmount(dep) ? "Enter an amount above 0." : undefined}><Input inputMode="decimal" value={dep} onChange={(e) => setDep(e.target.value)} /></Field>
              <Button type="submit" variant="primary" disabled={!isOwner || !validAmount(dep)} busy={busy === "dep"}>Deposit</Button>
            </form>
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (validAmount(wd)) run("wd", "Withdraw", () => act.withdraw(wd)); }}>
              <Field label="Withdraw to owner (NEAR)" error={wd && !validAmount(wd) ? "Enter an amount above 0." : undefined}><Input inputMode="decimal" value={wd} onChange={(e) => setWd(e.target.value)} placeholder={overview ? near(overview.vault_balance, 2).replace(" NEAR", "") : ""} /></Field>
              <Button type="submit" disabled={!isOwner || !validAmount(wd)} busy={busy === "wd"}>Withdraw</Button>
            </form>
          </div>
          <div className="mt-3"><OwnerHint /></div>
        </Panel>

        <Panel title="Emergency controls">
          {overview?.frozen ? (
            <div className="space-y-3">
              <Notice tone="hold">Frozen. Agents cannot move any funds. You can still withdraw.</Notice>
              <Button disabled={!isOwner} busy={busy === "unfreeze"} onClick={() => run("unfreeze", "Unfreeze vault", act.unfreeze)}>Unfreeze vault</Button>
              <p className="text-xs text-faint">Unfreezing gives agents power back, so your wallet asks for full confirmation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-dim">Freezing stops every agent request immediately. It works from a limited session key so you can react fast.</p>
              <Button variant="danger" disabled={!isOwner} busy={busy === "freeze"} onClick={() => run("freeze", "Freeze vault", act.freeze)}>Freeze vault</Button>
            </div>
          )}
          <div className="mt-3"><OwnerHint /></div>
          <Button variant="ghost" className="mt-2 px-0" onClick={() => refresh()}>Reload contract state</Button>
        </Panel>
      </div>
    </>
  );
}
