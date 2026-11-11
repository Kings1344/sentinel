import type { AgentStatus, Decision, RequestRecord } from "@sentinel/engine";
import { Ban, CheckCircle2, Clock3, Hourglass, RotateCcw, ShieldX, TimerOff, UserX } from "lucide-react";
import { Badge, cx, toneBg, toneText, type Tone } from "./ui";
import { REASON_TEXT } from "@/lib/format";

export const reasonText = (r: string) => REASON_TEXT[r] ?? r;

/** One consistent label for a request, combining the contract's decision and settlement status. */
export function requestState(r: Pick<RequestRecord, "decision" | "status" | "reason">): { label: string; tone: Tone; icon: typeof CheckCircle2 } {
  if (r.status === "PendingReview") return { label: "Awaiting approval", tone: "hold", icon: Hourglass };
  if (r.status === "PendingTransfer") return { label: "Settling", tone: "signal", icon: Clock3 };
  if (r.status === "Executed") return { label: "Paid", tone: "pass", icon: CheckCircle2 };
  if (r.status === "TransferFailed") return { label: "Failed, refunded", tone: "hold", icon: RotateCcw };
  if (r.status === "ReviewRejected") return { label: r.reason === "OwnerRejected" ? "Rejected by you" : "Approval invalid", tone: "block", icon: Ban };
  if (r.decision === "Expired") return { label: "Expired", tone: "block", icon: TimerOff };
  if (r.decision === "Revoked") return { label: "Revoked", tone: "block", icon: UserX };
  return { label: "Blocked", tone: "block", icon: ShieldX };
}

export function StatusPill({ r, size = "md" }: { r: Pick<RequestRecord, "decision" | "status" | "reason">; size?: "sm" | "md" }) {
  const s = requestState(r);
  const Icon = s.icon;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap", toneBg[s.tone], toneText[s.tone], size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]")}>
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />{s.label}
    </span>
  );
}

/** Round status node used in timelines. */
export function StatusNode({ r }: { r: Pick<RequestRecord, "decision" | "status" | "reason"> }) {
  const s = requestState(r);
  const Icon = s.icon;
  return <span className={cx("relative z-10 grid size-9 shrink-0 place-items-center rounded-full border", toneBg[s.tone], toneText[s.tone])}><Icon className="size-4" aria-hidden /></span>;
}

const DECISION_LABEL: Record<Decision, string> = { Approved: "Approved", Blocked: "Blocked", RequiresHumanReview: "Needs approval", Expired: "Expired", Revoked: "Revoked" };
export function DecisionBadge({ decision }: { decision: Decision }) {
  return <Badge dot tone={decision === "Approved" ? "pass" : decision === "RequiresHumanReview" ? "hold" : "block"}>{DECISION_LABEL[decision]}</Badge>;
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return <Badge dot tone={status === "Active" ? "pass" : status === "Suspended" ? "hold" : "block"}>{status === "Suspended" ? "Frozen" : status}</Badge>;
}

export function CapsuleStatusBadge({ status }: { status: string }) {
  return <Badge dot tone={status === "Active" ? "pass" : status === "Exhausted" ? "neutral" : status === "Expired" ? "hold" : "block"}>{status === "Exhausted" ? "Used up" : status}</Badge>;
}
