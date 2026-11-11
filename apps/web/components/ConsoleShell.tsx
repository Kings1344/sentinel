"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity, Bot, CheckCircle2, Copy, ExternalLink, FileLock2, FlaskConical, LayoutGrid, LogOut, Menu, OctagonX, Radar,
  Settings, ShieldCheck, Snowflake, UserCheck, Wallet, X, XCircle,
} from "lucide-react";
import { WalletProvider, useWallet, type CallResult } from "@/lib/wallet";
import { VaultProvider, useVault } from "@/lib/vault";
import { ownerActions } from "@/lib/actions";
import { NETWORK_ID, CONTRACT_ID, txUrl, accountUrl } from "@/lib/config";
import { useNow } from "@/lib/useNow";
import { ConfirmProvider, NotificationBell, NotificationProvider, useConfirm, useNotifications } from "./Overlays";
import { Button, Tip, cx, Mono } from "./ui";
import { short } from "@/lib/format";

const GROUPS = [
  { label: "Monitor", items: [
    { href: "/console", label: "Overview", icon: LayoutGrid },
    { href: "/console/transactions", label: "Transactions", icon: Activity },
    { href: "/console/security", label: "Security", icon: Radar },
  ] },
  { label: "Control", items: [
    { href: "/console/approvals", label: "Approvals", icon: UserCheck, badge: true },
    { href: "/console/capsules", label: "Intent capsules", icon: FileLock2 },
    { href: "/console/agents", label: "AI agents", icon: Bot },
  ] },
  { label: "Test", items: [{ href: "/console/attack-lab", label: "Attack lab", icon: FlaskConical }] },
];
const ALL = [...GROUPS.flatMap((g) => g.items), { href: "/console/settings", label: "Settings", icon: Settings }];

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
      toast("pass", `${label} confirmed on-chain.`, hash);
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
      <div aria-live="polite" className="pointer-events-none fixed right-5 bottom-5 z-[70] flex w-[min(400px,calc(100vw-2.5rem))] flex-col gap-2.5">
        {toasts.map((t) => (
          <div key={t.id} className="dialog-in pointer-events-auto flex gap-3 rounded-xl border border-line-strong bg-panel px-4 py-3.5 text-sm shadow-[0_16px_48px_-12px_rgb(0_0_0/0.8)]">
            {t.tone === "pass" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#34d399]" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-[#ff7b7b]" aria-hidden />}
            <div className="min-w-0">
              <p className="leading-relaxed">{t.text}</p>
              {t.hash && <a className="mt-1 inline-flex items-center gap-1 text-[13px] text-link hover:underline" href={txUrl(t.hash)} target="_blank" rel="noreferrer">View transaction <ExternalLink className="size-3" /></a>}
            </div>
          </div>
        ))}
      </div>
    </ActionContext.Provider>
  );
}

// ------------------------------------------------------------------ wallet

function WalletMenu() {
  const { accountId, signIn, signOut, ready } = useWallet();
  const { isOwner, overview } = useVault();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!accountId) return <Button variant="primary" size="sm" onClick={signIn} disabled={!ready}><Wallet className="size-4" />Connect wallet</Button>;
  const role = isOwner ? "Owner" : overview ? "Viewer" : "Connected";
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-9 items-center gap-2.5 rounded-lg border border-line-strong bg-raised pr-3 pl-1 transition-colors hover:border-[#3a4766] hover:bg-hover">
        <span className={cx("grid size-7 place-items-center rounded-md text-[13px] font-semibold uppercase", isOwner ? "bg-pass/15 text-[#34d399]" : "bg-signal/15 text-link")}>{accountId.slice(0, 1)}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[150px] truncate text-[13px] font-medium">{accountId}</span>
          <span className={cx("block text-[11.5px]", isOwner ? "text-[#34d399]" : "text-faint")}>{role}</span>
        </span>
      </button>
      {open && (
        <div className="dialog-in absolute right-0 z-50 mt-2 w-[300px] overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_24px_64px_-12px_rgb(0_0_0/0.8)]">
          <div className="border-b border-line px-5 py-4">
            <div className="text-[13px] text-dim">Signed in as</div>
            <Mono className="mt-0.5 block text-sm text-fg">{accountId}</Mono>
            <p className={cx("mt-2 text-[13px] leading-relaxed", isOwner ? "text-[#34d399]" : "text-dim")}>
              {isOwner ? "You own this vault. You can sign capsules and use every control." : overview ? `View only. The vault owner is ${overview.owner}.` : "Reading the vault…"}
            </p>
          </div>
          <div className="p-1.5 text-sm">
            <button onClick={async () => { try { await navigator.clipboard.writeText(accountId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-hover"><Copy className="size-4 text-dim" />{copied ? "Copied" : "Copy account ID"}</button>
            <a href={accountUrl(accountId)} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-hover"><ExternalLink className="size-4 text-dim" />View on NearBlocks</a>
            <button onClick={() => { setOpen(false); signOut(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[#ff8a8a] hover:bg-hover"><LogOut className="size-4" />Disconnect</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Emergency kill switch. Freezing is a tightening action and needs no full-access confirmation. */
export function EmergencyStop({ size = "md", block = false }: { size?: "sm" | "md"; block?: boolean }) {
  const { overview, isOwner } = useVault();
  const { call } = useWallet();
  const { run, busy } = useAction();
  const confirm = useConfirm();
  if (!overview) return null;
  const act = ownerActions(call);
  const cls = block ? "w-full" : undefined;
  const button = overview.frozen ? (
    <Button size={size} className={cls} disabled={!isOwner} busy={busy === "unfreeze"} onClick={async () => {
      if (await confirm({ title: "Unfreeze the vault?", body: "Agents can request payments again, within their capsules. Your wallet asks for full confirmation.", confirmLabel: "Unfreeze vault", tone: "primary" }))
        run("unfreeze", "Unfreeze vault", act.unfreeze);
    }}><Snowflake className="size-4 text-[#fbbf24]" />Unfreeze vault</Button>
  ) : (
    <Button variant="outline-danger" size={size} className={cls} disabled={!isOwner} busy={busy === "freeze"} onClick={async () => {
      if (await confirm({ title: "Freeze the vault now?", body: "Every agent request will be refused until you unfreeze. You can still withdraw your funds while frozen.", confirmLabel: "Freeze vault", tone: "danger" }))
        run("freeze", "Freeze vault", act.freeze);
    }}><OctagonX className="size-4" />Emergency stop</Button>
  );
  return isOwner ? button : <Tip label="Connect the owner wallet to use this" side="bottom">{button}</Tip>;
}

function SyncStatus() {
  const { error, updatedAt, overview } = useVault();
  const now = useNow(1000);
  const age = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const ok = !error && age !== null && age < 30;
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span className="inline-flex h-7 items-center gap-2 rounded-full border border-line bg-panel px-3">
        <span className={cx("size-2 rounded-full", ok ? "live-dot bg-pass" : error ? "bg-block" : "bg-hold")} aria-hidden />
        <span className="text-dim">{error ? "Reconnecting to NEAR" : age === null ? "Connecting" : <>Testnet <span className="text-faint">synced {age}s ago</span></>}</span>
      </span>
      {overview?.frozen && <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hold/30 bg-hold/10 px-3 text-[#fbbf24]"><Snowflake className="size-3.5" />Vault frozen</span>}
    </div>
  );
}

// ----------------------------------------------------------------- sidebar

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { requests, overview } = useVault();
  const pending = requests.filter((r) => r.status === "PendingReview").length;
  const item = ({ href, label, icon: Icon, badge }: { href: string; label: string; icon: typeof LayoutGrid; badge?: boolean }) => {
    const active = href === "/console" ? path === href : path.startsWith(href);
    return (
      <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
        className={cx("group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors", active ? "bg-hover text-fg" : "text-dim hover:bg-hover/60 hover:text-fg")}>
        {active && <span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-signal" aria-hidden />}
        <Icon className={cx("size-[18px]", active ? "text-link" : "text-faint group-hover:text-dim")} />
        <span className="font-medium">{label}</span>
        {badge && pending > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-hold px-1.5 text-[11px] font-semibold text-[#1f1400] tabular">{pending}</span>}
      </Link>
    );
  };
  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="flex h-16 items-center gap-2.5 px-6">
        <span className="grid size-8 place-items-center rounded-lg border border-pass/30 bg-pass/10"><ShieldCheck className="size-[18px] text-[#34d399]" /></span>
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Sentinel</span>
        <span className="ml-auto rounded-md border border-line-strong px-1.5 py-0.5 text-[11px] font-medium text-dim">{NETWORK_ID}</span>
      </Link>
      <nav aria-label="Console" className="scroll-quiet flex-1 space-y-6 overflow-y-auto px-6 pt-2">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="mb-1.5 px-3 text-xs font-medium text-faint">{g.label}</div>
            <div className="space-y-0.5">{g.items.map(item)}</div>
          </div>
        ))}
      </nav>
      <div className="space-y-3 border-t border-line p-4">
        {item({ href: "/console/settings", label: "Settings", icon: Settings })}
        {CONTRACT_ID && (
          <a href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer" className="block rounded-[10px] border border-line bg-panel px-3.5 py-3 transition-colors hover:border-line-strong">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <span className={cx("size-2 rounded-full", overview?.frozen ? "bg-hold" : overview ? "bg-pass" : "bg-faint")} aria-hidden />
              {overview?.frozen ? "Vault frozen" : overview ? "Vault protected" : "Vault"}
            </div>
            <Mono className="mt-1 block truncate text-xs text-faint">{CONTRACT_ID}</Mono>
          </a>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const current = ALL.find((n) => (n.href === "/console" ? path === n.href : path.startsWith(n.href)));
  useEffect(() => { setDrawer(false); }, [path]);

  return (
    <div className="min-h-screen lg:pl-[264px]">
      <aside className="fixed inset-y-0 left-0 hidden w-[264px] border-r border-line bg-sidebar lg:block"><Sidebar /></aside>
      {drawer && (
        <div className="fade-in fixed inset-0 z-50 bg-[#02050c]/70 lg:hidden" onClick={() => setDrawer(false)}>
          <aside className="drawer-in h-full w-[280px] border-r border-line bg-sidebar" onClick={(e) => e.stopPropagation()} aria-label="Navigation">
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-4 sm:px-6 lg:px-10">
          <button className="grid size-9 place-items-center rounded-lg text-dim hover:bg-hover hover:text-fg lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation"><Menu className="size-5" /></button>
          <div className="hidden items-center gap-2 text-sm md:flex">
            <span className="text-faint">Console</span><span className="text-faint">/</span><span className="font-medium">{current?.label ?? "Overview"}</span>
          </div>
          <div className="hidden xl:block"><SyncStatus /></div>
          <div className="ml-auto flex items-center gap-2">
            <EmergencyStop size="sm" />
            <NotificationBell />
            <WalletMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-4 pt-8 pb-16 sm:px-6 lg:px-10 lg:pt-10">
        <div className="mb-6 xl:hidden"><SyncStatus /></div>
        {children}
      </main>
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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em]">{title}</h1>
        {children && <p className="mt-2 text-[15px] leading-relaxed text-dim">{children}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/** Explains why an owner-only control is disabled. */
export function OwnerHint() {
  const { accountId, signIn } = useWallet();
  const { isOwner, overview } = useVault();
  if (isOwner || !overview) return null;
  return (
    <p className="text-[13px] leading-relaxed text-faint">
      {accountId
        ? <>Only the vault owner (<Mono>{overview.owner}</Mono>) can do this. You're signed in as <Mono>{accountId}</Mono>.</>
        : <>Only the vault owner can do this. <button className="font-medium text-link hover:underline" onClick={signIn}>Connect wallet</button></>}
    </p>
  );
}
