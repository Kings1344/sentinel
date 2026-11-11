"use client";
/** Confirmation dialogs and the notification centre. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, CheckCheck, ExternalLink, X } from "lucide-react";
import type { RequestRecord } from "@sentinel/engine";
import { useVault } from "@/lib/vault";
import { txUrl } from "@/lib/config";
import { ago, near, REASON_TEXT } from "@/lib/format";
import { PREF_NOTIFY_ACTIVITY, readPref } from "@/lib/prefs";
import { Button, cx } from "./ui";

// ------------------------------------------------------------------ confirm

interface ConfirmOptions { title: string; body: ReactNode; confirmLabel: string; tone?: "danger" | "primary" | "approve" }
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error("useConfirm outside ConfirmProvider");
  return c;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };

  useEffect(() => {
    if (!state) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="fade-in fixed inset-0 z-[60] flex items-end justify-center bg-[#02050c]/75 p-4 backdrop-blur-[2px] sm:items-center" onClick={() => close(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="dialog-in w-full max-w-[440px] rounded-2xl border border-line-strong bg-panel p-6 shadow-[0_24px_64px_-12px_rgb(0_0_0/0.8)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-3">
              {state.tone === "danger" && <span className="grid size-10 shrink-0 place-items-center rounded-full border border-block/30 bg-block/10 text-[#ff7b7b]"><AlertTriangle className="size-5" aria-hidden /></span>}
              <div>
                <h2 id="confirm-title" className="text-[17px] font-semibold tracking-[-0.01em]">{state.title}</h2>
                <div className="mt-2 text-sm leading-relaxed text-dim">{state.body}</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <Button onClick={() => close(false)}>Cancel</Button>
              <button
                ref={confirmRef}
                onClick={() => close(true)}
                className={cx(
                  "inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors active:scale-[0.98]",
                  state.tone === "danger" ? "bg-block text-white hover:bg-[#dc3b3b]" : state.tone === "approve" ? "bg-pass text-[#03140d] hover:bg-[#0ea271]" : "bg-signal text-white hover:bg-[#5374f5]",
                )}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

// ------------------------------------------------------------ notifications

export interface Notification {
  id: string;
  tone: "pass" | "block" | "hold" | "neutral";
  title: string;
  body?: string;
  href?: string;
  hash?: string | null;
  at: number;
  read: boolean;
}

interface NotifyCtx {
  items: Notification[];
  unread: number;
  push: (n: Omit<Notification, "id" | "at" | "read">) => void;
  markAllRead: () => void;
  clear: () => void;
}
const NotificationCtx = createContext<NotifyCtx | null>(null);
const STORE = "sentinel.notifications.v1";

export function useNotifications(): NotifyCtx {
  const c = useContext(NotificationCtx);
  if (!c) throw new Error("useNotifications outside NotificationProvider");
  return c;
}

function describe(r: RequestRecord): Omit<Notification, "id" | "at" | "read"> {
  const href = `/console/transactions/${r.id}`;
  if (r.status === "PendingReview") return { tone: "hold", title: `Approval needed for request #${r.id}`, body: `${near(r.amount)} to ${r.recipient}`, href: "/console/approvals" };
  if (r.decision === "Approved") return { tone: "pass", title: `Payment approved, request #${r.id}`, body: `${near(r.amount)} to ${r.recipient}`, href };
  return { tone: "block", title: `Request #${r.id} stopped: ${REASON_TEXT[r.reason] ?? r.reason}`, body: `${r.agent_id} tried ${near(r.amount)} to ${r.recipient}`, href };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { requests } = useVault();
  const [items, setItems] = useState<Notification[]>([]);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem(STORE) ?? "[]")); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(items.slice(0, 40))); } catch {}
  }, [items]);

  const push = useCallback((n: Omit<Notification, "id" | "at" | "read">) => {
    setItems((p) => [{ ...n, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), read: false }, ...p].slice(0, 40));
  }, []);

  // Watch the contract for new agent requests between polls.
  useEffect(() => {
    if (!requests.length) return;
    const max = Math.max(...requests.map((r) => r.id));
    if (seen.current === null) { seen.current = max; return; }
    if (max <= seen.current) return;
    const fresh = requests.filter((r) => r.id > (seen.current as number)).sort((a, b) => a.id - b.id);
    seen.current = max;
    if (!readPref(PREF_NOTIFY_ACTIVITY, true)) return;
    fresh.forEach((r) => push(describe(r)));
  }, [requests, push]);

  const markAllRead = useCallback(() => setItems((p) => p.map((n) => ({ ...n, read: true }))), []);
  const clear = useCallback(() => setItems([]), []);
  const unread = items.filter((n) => !n.read).length;

  return <NotificationCtx.Provider value={{ items, unread, push, markAllRead, clear }}>{children}</NotificationCtx.Provider>;
}

export function NotificationBell() {
  const { items, unread, markAllRead, clear } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative grid size-9 place-items-center rounded-lg text-dim transition-colors hover:bg-hover hover:text-fg"
      >
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute top-1 right-1 min-w-4 rounded-full border-2 border-ink bg-block px-1 text-[10px] leading-3.5 font-semibold text-white tabular">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="dialog-in absolute right-0 z-50 mt-2 w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_24px_64px_-12px_rgb(0_0_0/0.8)]">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <span className="text-[15px] font-semibold">Notifications</span>
            <div className="flex gap-1">
              <button onClick={markAllRead} className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover hover:text-fg" aria-label="Mark all as read" title="Mark all as read"><CheckCheck className="size-4" /></button>
              <button onClick={clear} className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover hover:text-fg" aria-label="Clear notifications" title="Clear"><X className="size-4" /></button>
            </div>
          </div>
          <ul className="scroll-quiet max-h-[60vh] divide-y divide-line/70 overflow-y-auto">
            {items.length === 0 && <li className="px-6 py-10 text-center text-sm leading-relaxed text-dim">Nothing yet. New agent requests, blocks and your confirmed actions appear here.</li>}
            {items.map((n) => (
              <li key={n.id} className={cx("flex gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-hover/50", !n.read && "bg-signal/[0.04]")}>
                <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.tone === "pass" && "bg-pass", n.tone === "block" && "bg-block", n.tone === "hold" && "bg-hold", n.tone === "neutral" && "bg-faint")} aria-hidden />
                <div className="min-w-0 flex-1">
                  {n.href ? <Link href={n.href} onClick={() => setOpen(false)} className="font-medium hover:underline">{n.title}</Link> : <p className="font-medium">{n.title}</p>}
                  {n.body && <p className="mt-0.5 break-words text-dim">{n.body}</p>}
                  <div className="mt-1 flex items-center gap-3 text-[12.5px] text-faint">
                    <span>{ago(n.at)}</span>
                    {n.hash && <a href={txUrl(n.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">Transaction <ExternalLink className="size-3" /></a>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
