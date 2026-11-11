"use client";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "@/lib/cx";
export { cx };

type Variant = "primary" | "secondary" | "danger" | "ghost" | "approve";
export function Button({ variant = "secondary", busy, className, children, disabled, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...p}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-signal text-white hover:bg-[#3b7af0]",
        variant === "approve" && "bg-pass text-[#04120c] hover:bg-[#0ea371]",
        variant === "secondary" && "border border-line bg-raised text-fg hover:border-faint",
        variant === "danger" && "border border-block/50 bg-block/10 text-block hover:bg-block/20",
        variant === "ghost" && "text-dim hover:text-fg",
        className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Panel({ title, description, action, children, className, padded = true }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx("rounded-xl border border-line/80 bg-panel", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-dim">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="block text-xs text-block">{error}</span> : hint ? <span className="block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-ink/70 px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-signal focus:outline-none";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx(inputCls, className)} />;
});
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, "min-h-24 leading-relaxed", className)} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, "appearance-none", className)}>{children}</select>;
}

export type Tone = "pass" | "block" | "hold" | "signal" | "neutral";
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "pass" && "bg-pass/12 text-pass",
        tone === "block" && "bg-block/12 text-block",
        tone === "hold" && "bg-hold/12 text-hold",
        tone === "signal" && "bg-signal/15 text-[#8fb6ff]",
        tone === "neutral" && "bg-raised text-dim",
      )}
    >
      {children}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[0.85em] break-all", className)}>{children}</span>;
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "block" | "hold" | "pass"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cx(
        "rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed",
        tone === "neutral" && "border-line bg-raised/60 text-dim",
        tone === "block" && "border-block/40 bg-block/8 text-block",
        tone === "hold" && "border-hold/40 bg-hold/8 text-hold",
        tone === "pass" && "border-pass/40 bg-pass/8 text-pass",
      )}
    >
      {children}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-9 text-center">
      {icon && <div className="mb-2 flex justify-center text-faint">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-dim">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "pass" | "block" | "hold"; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line/80 bg-panel px-4 py-3.5">
      <div className="flex items-center justify-between text-sm text-dim">{label}{icon}</div>
      <div className={cx("mt-1.5 text-2xl font-semibold tracking-tight tabular", tone === "pass" && "text-pass", tone === "block" && "text-block", tone === "hold" && "text-hold")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton rounded-md", className)} />;
}

export function StatSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-line/80 bg-panel px-4 py-3.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-7 w-20" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-faint">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-pass" : "bg-line")}
      >
        <span className={cx("absolute top-0.5 size-4 rounded-full bg-white transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

/** Horizontal usage bar (spent vs limit, risk score…). */
export function Meter({ value, max = 100, tone = "pass", label }: { value: number; max?: number; tone?: "pass" | "hold" | "block" | "signal"; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-raised" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx("h-full rounded-full", tone === "pass" && "bg-pass", tone === "hold" && "bg-hold", tone === "block" && "bg-block", tone === "signal" && "bg-signal")} style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }} />
    </div>
  );
}
