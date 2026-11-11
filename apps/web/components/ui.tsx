"use client";
/** Sentinel design system primitives. Every page builds on these, so spacing and type stay consistent. */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown, Loader2, Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cx } from "@/lib/cx";
export { cx };

// ------------------------------------------------------------------ buttons

type Variant = "primary" | "secondary" | "danger" | "ghost" | "approve" | "outline-danger";
type Size = "sm" | "md" | "lg";

/** Button look, reusable for links that should look like buttons. */
export function buttonStyles(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cx(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
    size === "sm" && "h-8 px-3 text-[13px]",
    size === "md" && "h-9 px-3.5 text-sm",
    size === "lg" && "h-11 px-5 text-[15px]",
    variant === "primary" && "bg-signal text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] hover:bg-[#5374f5]",
    variant === "approve" && "bg-pass text-[#03140d] shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] hover:bg-[#0ea271]",
    variant === "danger" && "bg-block text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] hover:bg-[#dc3b3b]",
    variant === "outline-danger" && "border border-block/35 bg-block/8 text-[#ff8a8a] hover:border-block/60 hover:bg-block/14",
    variant === "secondary" && "border border-line-strong bg-raised text-fg hover:border-[#3a4766] hover:bg-hover",
    variant === "ghost" && "text-dim hover:bg-hover hover:text-fg",
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }>(function Button(
  { variant = "secondary", size = "md", busy, className, children, disabled, ...p }, ref,
) {
  return (
    <button ref={ref} {...p} disabled={disabled || busy} className={buttonStyles(variant, size, className)}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function IconButton({ label, children, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tip label={label}>
      <button {...p} aria-label={label} className={cx("grid size-9 place-items-center rounded-lg text-dim transition-colors hover:bg-hover hover:text-fg", className)}>{children}</button>
    </Tip>
  );
}

/** Tooltip on hover and keyboard focus. */
export function Tip({ label, children, side = "top" }: { label: string; children: ReactNode; side?: "top" | "bottom" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span role="tooltip" className={cx(
        "pointer-events-none absolute left-1/2 z-50 w-max max-w-[240px] -translate-x-1/2 rounded-md border border-line-strong bg-[#151d31] px-2.5 py-1.5 text-center text-xs leading-snug text-fg opacity-0 shadow-xl transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
        side === "top" ? "bottom-full mb-2" : "top-full mt-2",
      )}>{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------- surfaces

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("surface", className)}>{children}</div>;
}

export function Panel({ title, description, action, icon, children, className, padded = true }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx("surface", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && <span className="mt-0.5 text-dim">{icon}</span>}
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
              {description && <p className="mt-0.5 text-[13px] leading-relaxed text-dim">{description}</p>}
            </div>
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={padded ? "p-6" : ""}>{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------ forms

export function Field({ label, hint, error, optional, children }: { label: string; hint?: ReactNode; error?: string; optional?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-fg">
        {label}
        {optional && <span className="text-xs font-normal text-faint">Optional</span>}
      </span>
      {children}
      {error ? <span className="mt-1.5 flex items-center gap-1 text-[13px] text-[#ff8a8a]"><XCircle className="size-3.5" aria-hidden />{error}</span> : hint ? <span className="mt-1.5 block text-[13px] leading-relaxed text-faint">{hint}</span> : null}
    </label>
  );
}

const inputCls = "h-10 w-full rounded-lg border border-line-strong bg-ink/60 px-3 text-sm text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)] transition-colors placeholder:text-faint hover:border-[#36425f] focus:border-signal focus:bg-ink focus:outline-none";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx(inputCls, className)} />;
});

/** Amount input with a fixed NEAR unit inside the field. */
export function AmountInput({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <input inputMode="decimal" {...p} className={cx(inputCls, "pr-14 tabular", className)} />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] font-medium text-faint">NEAR</span>
    </div>
  );
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, "h-auto min-h-28 py-2.5 leading-relaxed", className)} />;
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...p} className={cx(inputCls, "cursor-pointer appearance-none pr-9", className)}>{children}</select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
    </div>
  );
}

/** Segmented control for a small set of options. */
export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-ink/60 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-raised text-fg shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.05)]" : "text-dim hover:text-fg",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cx("tabular", value === o.value ? "text-dim" : "text-faint")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="mt-0.5 text-[13px] leading-relaxed text-dim">{description}</div>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors duration-200", checked ? "border-pass bg-pass" : "border-line-strong bg-raised")}>
        <span className={cx("absolute top-0.5 size-[18px] rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

// ------------------------------------------------------------ indicators

export type Tone = "pass" | "block" | "hold" | "signal" | "neutral";
const toneText: Record<Tone, string> = { pass: "text-[#34d399]", block: "text-[#ff7b7b]", hold: "text-[#fbbf24]", signal: "text-link", neutral: "text-dim" };
const toneBg: Record<Tone, string> = { pass: "bg-pass/10 border-pass/25", block: "bg-block/10 border-block/25", hold: "bg-hold/10 border-hold/25", signal: "bg-signal/12 border-signal/30", neutral: "bg-raised border-line-strong" };
const toneDot: Record<Tone, string> = { pass: "bg-pass", block: "bg-block", hold: "bg-hold", signal: "bg-signal", neutral: "bg-faint" };
export { toneText, toneBg, toneDot };

export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap", toneBg[tone], toneText[tone])}>
      {dot && <span className={cx("size-1.5 rounded-full", toneDot[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[0.88em] break-all", className)}>{children}</span>;
}

export function Notice({ tone = "neutral", title, children }: { tone?: "neutral" | "block" | "hold" | "pass"; title?: string; children: ReactNode }) {
  const Icon = tone === "pass" ? CheckCircle2 : tone === "block" ? XCircle : tone === "hold" ? AlertTriangle : Info;
  return (
    <div role="status" className={cx("flex gap-3 rounded-[10px] border px-4 py-3 text-sm leading-relaxed", toneBg[tone === "neutral" ? "neutral" : tone])}>
      <Icon className={cx("mt-0.5 size-4 shrink-0", toneText[tone === "neutral" ? "neutral" : tone])} aria-hidden />
      <div className="min-w-0 text-fg/90">{title && <div className="font-medium text-fg">{title}</div>}{children}</div>
    </div>
  );
}

export function Empty({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-xl border border-line-strong bg-raised text-dim">{icon}</div>}
      <p className="text-[15px] font-medium">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-dim">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Metric card: label + icon, large value, one supporting line. */
export function MetricCard({ label, value, footnote, icon, tone }: { label: string; value: ReactNode; footnote?: ReactNode; icon?: ReactNode; tone?: "pass" | "block" | "hold" }) {
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-dim">{label}</span>
        {icon && <span className={cx("grid size-8 place-items-center rounded-lg border", tone ? cx(toneBg[tone], toneText[tone]) : "border-line-strong bg-raised text-dim")}>{icon}</span>}
      </div>
      <div className={cx("mt-3 text-[30px] leading-none font-semibold tracking-[-0.03em] tabular", tone === "block" && "text-[#ff7b7b]", tone === "pass" && "text-[#34d399]", tone === "hold" && "text-[#fbbf24]")}>{value}</div>
      {footnote && <div className="mt-2.5 text-[13px] leading-snug text-faint">{footnote}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton rounded-md", className)} />;
}

export function MetricSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="surface p-5"><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-8 w-20" /><Skeleton className="mt-3 h-3.5 w-36" /></div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4"><Skeleton className="size-9 shrink-0 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3.5 w-2/3" /></div></div>
      ))}
    </div>
  );
}

export function Meter({ value, max = 100, tone = "pass", label }: { value: number; max?: number; tone?: "pass" | "hold" | "block" | "signal"; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx("h-full rounded-full transition-[width] duration-500", toneDot[tone])} style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }} />
    </div>
  );
}

/** Two-column definition list row. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-dim">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
