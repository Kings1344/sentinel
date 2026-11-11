"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Activity, Bot, ExternalLink, FileLock2, FlaskConical, LayoutGrid, LogOut, OctagonX, Radar, Settings, ShieldCheck, Snowflake, UserCheck } from "lucide-react";
import { WalletProvider, useWallet, type CallResult } from "@/lib/wallet";
import { VaultProvider, useVault } from "@/lib/vault";
import { ownerActions } from "@/lib/actions";
import { NETWORK_ID, CONTRACT_ID, txUrl, accountUrl } from "@/lib/config";
import { useNow } from "@/lib/useNow";
import { ConfirmProvider, NotificationBell, NotificationProvider, useConfirm, useNotifications } from "./Overlays";
import { Button, cx, Mono } from "./ui";
import { short } from "@/lib/format";

const NAV = [
  { href: "/console", label: "Overview", icon: LayoutGrid },
  { href: "/console/approvals", label: "Approvals", icon: UserCheck, badge: "approvals" as const },
  { href: "/console/capsules", label: "Intent capsules", icon: FileLock2 },
  { href: "/console/agents", label: "AI agents", icon: Bot },
  { href: "/console/transactions", label: "Transactions", icon: Activity },
  { href: "/console/attack-lab", label: "Attack lab", icon: FlaskConical },
  { href: "/console/security", label: "Security", icon: Radar },
  { href: "/console/settings", label: "Settings", icon: Settings },
];

// ------------------------------------------------------------------ actions

type Toast = { id: number; tone: "pass" | "block"; text: string; hash?: string | null };
interface ActionCtx {
  busy: string | null;
  run: (key: string, label: string, fn: () => Promise<CallResult | void>) => Promise<CallResult | void>;
  toast: (tone: "pass" | "block", text: string, hash?: string | null) => void;
}
const ActionContext = createContext<ActionCtx | null>(null);
export function useAction() {
  const c = useContext(ActionContext);
  if (!c) throw new Error("useAction outside ConsoleShell");
  return c;
}

function ActionProvider({ children }: { children: ReactNode }) {
  const { refresh } = useVault();
  const { push } = useNotifications();
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((tone: "pass" | "block", text: string, hash?: string | null) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p.slice(-3), { id, tone, text, hash }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 8000);
  }, []);
  const run = useCallback(async (key: string, label: string, fn: () => Promise<CallResult | void>) => {
    setBusy(key);
    try {
      const r = await fn();
      const hash = r && "hash" in r ? r.hash : null;
      toast("pass", `${label}: confirmed on-chain.`, hash);
      push({ tone: "pass", title: `${label} confirmed`, hash });
      await refresh();
      return r;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).replace(/^.*Smart contract panicked: /, "");
      toast("block", `${label} failed. ${msg}`);
      push({ tone: "block", title: `${label} failed`, body: msg });
    } finally {
      setBusy(null);
    }
  }, [toast, push, refresh]);

  return (
    <ActionContext.Provider value={{ busy, run, toast }}>
      {children}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cx("dialog-in rounded-xl border bg-panel px-4 py-3 text-sm shadow-2xl", t.tone === "pass" ? "border-pass/50" : "border-block/50")}>
            <p className={t.tone === "block" ? "text-block" : "text-fg"}>{t.text}</p>
            {t.hash && <a className="mt-1 inline-flex items-center gap-1 text-xs text-[#8fb6ff] hover:underline" href={txUrl(t.hash)} target="_blank" rel="noreferrer">View transaction <ExternalLink className="size-3" /></a>}
          </div>
        ))}
      </div>
    </ActionContext.Provider>
  );
}

// ------------------------------------------------------------------- header

function WalletButton() {
  const { accountId, signIn, signOut, ready } = useWallet();
  const { isOwner, overview } = useVault();
  if (!accountId) return <Button variant="primary" onClick={signIn} disabled={!ready}>Connect wallet</Button>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="text-right leading-tight">
        <Mono className="text-sm">{short(accountId, 14)}</Mono>
        <div className={cx("text-xs", isOwner ? "text-pass" : "text-faint")}>{isOwner ? "Vault owner" : overview ? "View only, not the owner" : NETWORK_ID}</div>
      </div>
      <Button variant="ghost" onClick={signOut} aria-label="Disconnect wallet" title="Disconnect wallet"><LogOut className="size-4" /></Button>
    </div>
  );
}

/** Emergency kill switch: freeze is a tightening action and needs no full-access confirmation. */
export function EmergencyStop({ compact = false }: { compact?: boolean }) {
  const { overview, isOwner } = useVault();
  const { call } = useWallet();
  const { run, busy } = useAction();
  const confirm = useConfirm();
  if (!overview) return null;
  const act = ownerActions(call);
  if (overview.frozen) {
    return (
      <Button
        variant="secondary"
        disabled={!isOwner}
        busy={busy === "unfreeze"}
        title={isOwner ? "Let agents request payments again" : "Connect the owner wallet to unfreeze"}
        onClick={async () => {
          if (await confirm({ title: "Unfreeze the vault?", body: "Agents can request payments again, within their capsules. Your wallet will ask for full confirmation.", confirmLabel: "Unfreeze vault", tone: "primary" }))
            run("unfreeze", "Unfreeze vault", act.unfreeze);
        }}
      >
        <Snowflake className="size-4 text-hold" />{compact ? "Unfreeze" : "Vault frozen, unfreeze"}
      </Button>
    );
  }
  return (
    <Button
      variant="danger"
      disabled={!isOwner}
      busy={busy === "freeze"}
      title={isOwner ? "Stop every agent payment immediately" : "Connect the owner wallet to use the kill switch"}
      onClick={async () => {
        if (await confirm({ title: "Freeze the vault now?", body: "Every agent request will be refused until you unfreeze. You can still withdraw your funds while frozen.", confirmLabel: "Freeze vault", tone: "danger" }))
          run("freeze", "Freeze vault", act.freeze);
      }}
    >
      <OctagonX className="size-4" />Emergency stop
    </Button>
  );
}

function NetworkStatus() {
  const { error, updatedAt, overview } = useVault();
  const now = useNow(1000);
  const age = updatedAt ? Math.round((now - updatedAt) / 1000) : null;
  const ok = !error && age !== null && age < 30;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cx("size-2 rounded-full", ok ? "live-dot bg-pass" : error ? "bg-block" : "bg-hold")} aria-hidden />
      <span className="text-dim">
        {error ? "Can't reach NEAR right now, retrying" : age === null ? "Connecting to NEAR…" : <>NEAR {NETWORK_ID}, updated {age}s ago</>}
      </span>
      {overview?.frozen && <span className="rounded-md bg-hold/12 px-1.5 py-0.5 text-xs font-medium text-hold">Frozen</span>}
    </div>
  );
}

// --------------------------------------------------------------------- shell

function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { requests } = useVault();
  const pending = requests.filter((r) => r.status === "PendingReview").length;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line/70 bg-[#0d1528]/80 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-4 lg:block">
          <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold"><ShieldCheck className="size-5 text-pass" />Sentinel</Link>
          <div className="flex items-center gap-1 lg:hidden"><NotificationBell /><WalletButton /></div>
        </div>
        <nav aria-label="Console" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col">
          {NAV.map(({ href, label, icon: Icon, badge }) => {
            const active = href === "/console" ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={cx("flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors", active ? "bg-raised text-fg" : "text-dim hover:bg-raised/50 hover:text-fg")}>
                <Icon className="size-4" />{label}
                {badge && pending > 0 && <span className="ml-auto rounded-full bg-hold px-1.5 text-[11px] leading-5 font-semibold text-[#1d1200] tabular">{pending}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="hidden space-y-1 px-5 pt-6 text-xs text-faint lg:block">
          <div>Network: NEAR {NETWORK_ID}</div>
          {CONTRACT_ID && <a className="block hover:text-dim" href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer">Vault contract <Mono>{short(CONTRACT_ID, 12)}</Mono></a>}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3 lg:px-6">
          <NetworkStatus />
          <div className="flex items-center gap-2">
            <EmergencyStop compact />
            <div className="hidden items-center gap-2 lg:flex"><NotificationBell /><WalletButton /></div>
          </div>
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
        <NotificationProvider>
          <ConfirmProvider>
            <ActionProvider>
              <Shell>{children}</Shell>
            </ActionProvider>
          </ConfirmProvider>
        </NotificationProvider>
      </VaultProvider>
    </WalletProvider>
  );
}

export function PageTitle({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dim">{children}</p>}
      </div>
      {action}
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
      {accountId
        ? <>Only the vault owner, <Mono>{overview.owner}</Mono>, can do this. You're connected as <Mono>{accountId}</Mono>.</>
        : <>Connect the owner wallet (<Mono>{overview.owner}</Mono>) to do this. <button className="text-[#8fb6ff] hover:underline" onClick={signIn}>Connect wallet</button></>}
    </p>
  );
}
