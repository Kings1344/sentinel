"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Activity, Bot, FlaskConical, LayoutGrid, Radar, Settings, ShieldCheck, FileLock2, LogOut, ExternalLink, Snowflake } from "lucide-react";
import { WalletProvider, useWallet, type CallResult } from "@/lib/wallet";
import { VaultProvider, useVault } from "@/lib/vault";
import { NETWORK_ID, CONTRACT_ID, txUrl, accountUrl } from "@/lib/config";
import { Button, cx, Mono } from "./ui";
import { short } from "@/lib/format";

const NAV = [
  { href: "/console", label: "Overview", icon: LayoutGrid },
  { href: "/console/capsules", label: "Intent capsules", icon: FileLock2 },
  { href: "/console/agents", label: "Agents", icon: Bot },
  { href: "/console/transactions", label: "Requests", icon: Activity },
  { href: "/console/attack-lab", label: "Attack lab", icon: FlaskConical },
  { href: "/console/security", label: "Security", icon: Radar },
  { href: "/console/settings", label: "Settings", icon: Settings },
];

type Toast = { id: number; tone: "pass" | "block" | "neutral"; text: string; hash?: string | null };
interface ActionCtx {
  busy: string | null;
  run: (key: string, label: string, fn: () => Promise<CallResult | void>) => Promise<CallResult | void>;
  notify: (t: Omit<Toast, "id">) => void;
}
const ActionContext = createContext<ActionCtx | null>(null);
export function useAction() {
  const c = useContext(ActionContext);
  if (!c) throw new Error("useAction outside ConsoleShell");
  return c;
}

function ActionProvider({ children }: { children: ReactNode }) {
  const { refresh } = useVault();
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 9000);
  }, []);
  const run = useCallback(async (key: string, label: string, fn: () => Promise<CallResult | void>) => {
    setBusy(key);
    try {
      const r = await fn();
      notify({ tone: "pass", text: `${label}: confirmed on-chain.`, hash: r && "hash" in r ? r.hash : null });
      await refresh();
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify({ tone: "block", text: `${label} failed. ${msg.replace(/^.*Smart contract panicked: /, "")}` });
    } finally {
      setBusy(null);
    }
  }, [notify, refresh]);
  return (
    <ActionContext.Provider value={{ busy, run, notify }}>
      {children}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cx("rounded-md border bg-panel px-3 py-2.5 text-sm shadow-lg", t.tone === "pass" ? "border-pass/50" : t.tone === "block" ? "border-block/50" : "border-line")}>
            <p className={t.tone === "block" ? "text-block" : "text-fg"}>{t.text}</p>
            {t.hash && <a className="mt-1 inline-flex items-center gap-1 text-xs text-[#7fb0ff] hover:underline" href={txUrl(t.hash)} target="_blank" rel="noreferrer">View transaction <ExternalLink className="size-3" /></a>}
          </div>
        ))}
      </div>
    </ActionContext.Provider>
  );
}

function WalletButton() {
  const { accountId, signIn, signOut, ready } = useWallet();
  const { isOwner, overview } = useVault();
  if (!accountId) return <Button variant="primary" onClick={signIn} disabled={!ready}>Connect wallet</Button>;
  return (
    <div className="flex items-center gap-2">
      <div className="text-right leading-tight">
        <Mono className="text-sm">{short(accountId, 14)}</Mono>
        <div className="text-xs text-faint">{isOwner ? "Vault owner" : overview ? "Not the vault owner" : NETWORK_ID}</div>
      </div>
      <Button variant="ghost" onClick={signOut} aria-label="Disconnect wallet"><LogOut className="size-4" /></Button>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { overview, error } = useVault();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="border-b border-line bg-panel/60 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <Link href="/" className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-signal" />Sentinel</Link>
          <div className="lg:hidden"><WalletButton /></div>
        </div>
        <nav aria-label="Console" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:px-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/console" ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={cx("flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm", active ? "bg-raised text-fg" : "text-dim hover:text-fg")}>
                <Icon className="size-4" />{label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden px-4 pt-6 text-xs text-faint lg:block">
          <div>Network: {NETWORK_ID}</div>
          {CONTRACT_ID && <a className="hover:text-dim" href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer">Vault: <Mono>{short(CONTRACT_ID, 12)}</Mono></a>}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="hidden items-center justify-between border-b border-line px-6 py-3 lg:flex">
          <div className="text-sm text-dim">
            {overview?.frozen ? <span className="inline-flex items-center gap-1.5 text-hold"><Snowflake className="size-4" />Vault frozen. Agents cannot move funds.</span> : overview ? "Vault active" : error ? "Contract unreachable" : "Loading vault…"}
          </div>
          <WalletButton />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <VaultProvider>
        <ActionProvider>
          <Shell>{children}</Shell>
        </ActionProvider>
      </VaultProvider>
    </WalletProvider>
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dim">{children}</p>}
    </div>
  );
}

/** Shown when an owner-only control is visible but the connected account cannot use it. */
export function OwnerHint() {
  const { accountId, signIn } = useWallet();
  const { isOwner, overview } = useVault();
  if (isOwner || !overview) return null;
  return (
    <p className="text-xs text-faint">
      {accountId ? <>Owner controls need <Mono>{overview.owner}</Mono>. You are connected as <Mono>{accountId}</Mono>.</> : <>Connect the owner wallet (<Mono>{overview.owner}</Mono>) to use these controls. <button className="text-[#7fb0ff] hover:underline" onClick={signIn}>Connect</button></>}
    </p>
  );
}
