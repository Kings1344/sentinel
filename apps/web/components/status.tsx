import type { AgentStatus, Decision, RequestStatus } from "@sentinel/engine";
import { Badge } from "./ui";
import { REASON_TEXT } from "@/lib/format";

const DECISION_LABEL: Record<Decision, string> = {
  Approved: "Approved", Blocked: "Blocked", RequiresHumanReview: "Needs review", Expired: "Expired", Revoked: "Revoked",
};
export function DecisionBadge({ decision }: { decision: Decision }) {
  const tone = decision === "Approved" ? "pass" : decision === "RequiresHumanReview" ? "hold" : "block";
  return <Badge tone={tone}>{DECISION_LABEL[decision]}</Badge>;
}

const STATUS_LABEL: Record<RequestStatus, string> = {
  Rejected: "Rejected", PendingReview: "Awaiting owner", PendingTransfer: "Settling", Executed: "Paid", TransferFailed: "Failed, refunded", ReviewRejected: "Rejected in review",
};
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const tone = status === "Executed" ? "pass" : status === "PendingReview" || status === "PendingTransfer" ? "hold" : "neutral";
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return <Badge tone={status === "Active" ? "pass" : status === "Suspended" ? "hold" : "block"}>{status}</Badge>;
}

export function CapsuleStatusBadge({ status }: { status: string }) {
  return <Badge tone={status === "Active" ? "pass" : status === "Exhausted" ? "neutral" : "block"}>{status}</Badge>;
}

export const reasonText = (r: string) => REASON_TEXT[r] ?? r;
