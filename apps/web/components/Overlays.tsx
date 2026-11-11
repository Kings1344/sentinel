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
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => close(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="dialog-in w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-3">
              {state.tone === "danger" && <AlertTriangle className="mt-0.5 size-5 shrink-0 text-block" aria-hidden />}
              <div>
                <h2 id="confirm-title" className="text-base font-semibold">{state.title}</h2>
                <div className="mt-1.5 text-sm leading-relaxed text-dim">{state.body}</div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => close(false)}>Cancel</Button>
              <button
                ref={confirmRef}
                onClick={() => close(true)}
                className={cx(
                  "inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium",
                  state.tone === "danger" ? "bg-block text-white hover:bg-[#dc4141]" : state.tone === "approve" ? "bg-pass text-[#04120c] hover:bg-[#0ea371]" : "bg-signal text-white hover:bg-[#3b7af0]",
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
        className="relative rounded-lg p-2 text-dim hover:bg-raised hover:text-fg"
      >
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-block px-1 text-[10px] leading-4 font-semibold text-white tabular">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="dialog-in absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-2rem))] rounded-xl border border-line bg-panel shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-semibold">Notifications</span>
            <div className="flex gap-1">
              <button onClick={markAllRead} className="rounded-md p-1.5 text-dim hover:bg-raised hover:text-fg" aria-label="Mark all as read" title="Mark all as read"><CheckCheck className="size-4" /></button>
              <button onClick={clear} className="rounded-md p-1.5 text-dim hover:bg-raised hover:text-fg" aria-label="Clear notifications" title="Clear"><X className="size-4" /></button>
            </div>
          </div>
          <ul className="max-h-[60vh] divide-y divide-line/70 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-dim">Nothing yet. New agent requests, blocks and your confirmed actions appear here.</li>}
            {items.map((n) => (
              <li key={n.id} className={cx("flex gap-3 px-4 py-3 text-sm", !n.read && "bg-raised/40")}>
                <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.tone === "pass" && "bg-pass", n.tone === "block" && "bg-block", n.tone === "hold" && "bg-hold", n.tone === "neutral" && "bg-faint")} aria-hidden />
                <div className="min-w-0 flex-1">
                  {n.href ? <Link href={n.href} onClick={() => setOpen(false)} className="font-medium hover:underline">{n.title}</Link> : <p className="font-medium">{n.title}</p>}
                  {n.body && <p className="mt-0.5 break-words text-dim">{n.body}</p>}
                  <div className="mt-1 flex items-center gap-3 text-xs text-faint">
                    <span>{ago(n.at)}</span>
                    {n.hash && <a href={txUrl(n.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#8fb6ff] hover:underline">Transaction <ExternalLink className="size-3" /></a>}
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
