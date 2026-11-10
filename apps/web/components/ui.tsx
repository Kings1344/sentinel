"use client";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

import { cx } from "@/lib/cx";
export { cx };

type Variant = "primary" | "secondary" | "danger" | "ghost";
export function Button({ variant = "secondary", busy, className, children, disabled, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...p}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-signal text-white hover:bg-[#1f6af0]",
        variant === "secondary" && "border border-line bg-raised text-fg hover:border-dim/50",
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

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-line bg-panel", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
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

const inputCls = "w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-signal focus:outline-none";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx(inputCls, className)} />;
});
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, "min-h-24 leading-relaxed", className)} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, "appearance-none", className)}>{children}</select>;
}

type Tone = "pass" | "block" | "hold" | "signal" | "neutral";
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "pass" && "bg-pass/12 text-pass",
        tone === "block" && "bg-block/12 text-block",
        tone === "hold" && "bg-hold/12 text-hold",
        tone === "signal" && "bg-signal/15 text-[#7fb0ff]",
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
        "rounded-md border px-3 py-2.5 text-sm leading-relaxed",
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

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-dim">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="text-sm text-dim">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
  );
}
