/**
 * Security intelligence: deterministic pattern detection over the contract's request history.
 * Scores are heuristics for triage. They never affect authorization, which the contract decides.
 */
import type { Agent, ReasonCode, RequestRecord } from "./types";

export type Severity = "low" | "medium" | "high" | "critical";

export interface RiskEvent {
  id: string;
  severity: Severity;
  kind: string;
  agentId: string;
  requestIds: number[];
  summary: string;
  atMs: number;
}

const INTENT_REASONS: Partial<Record<ReasonCode, { kind: string; severity: Severity; label: string }>> = {
  RecipientMismatch: { kind: "recipient_substitution", severity: "high", label: "tried to pay an unauthorized recipient" },
  AssetMismatch: { kind: "asset_substitution", severity: "high", label: "tried to use an unauthorized asset" },
  OperationMismatch: { kind: "operation_substitution", severity: "high", label: "tried an unauthorized operation" },
  AmountExceedsTxLimit: { kind: "amount_manipulation", severity: "medium", label: "requested more than the per-payment limit" },
  CumulativeLimitExceeded: { kind: "limit_exhaustion", severity: "medium", label: "tried to exceed the capsule's total limit" },
  NonceReplay: { kind: "replay", severity: "high", label: "replayed an already-used authorization" },
  NonceOutOfOrder: { kind: "nonce_anomaly", severity: "low", label: "submitted an out-of-order nonce" },
  AgentRevoked: { kind: "post_revocation_activity", severity: "critical", label: "kept acting after it was revoked" },
  CapsuleRevoked: { kind: "revoked_capsule_use", severity: "high", label: "used a revoked capsule" },
  CapsuleExpired: { kind: "expired_capsule_use", severity: "medium", label: "used an expired capsule" },
  CapsuleAgentMismatch: { kind: "capsule_hijack", severity: "high", label: "used another agent's capsule" },
};

export function analyzeRisk(requests: RequestRecord[], agents: Agent[], windowMs = 10 * 60_000): RiskEvent[] {
  const events: RiskEvent[] = [];
  for (const r of requests) {
    const m = INTENT_REASONS[r.reason];
    if (!m) continue;
    events.push({
      id: `req-${r.id}`,
      severity: m.severity,
      kind: m.kind,
      agentId: r.agent_id,
      requestIds: [r.id],
      summary: `${r.agent_id} ${m.label}. ${r.explanation}`,
      atMs: Number(r.created_at_ms),
    });
  }
  // Burst of violations from one agent inside the window.
  const byAgent = new Map<string, RequestRecord[]>();
  for (const r of requests) if (r.decision !== "Approved" && r.decision !== "RequiresHumanReview") {
    byAgent.set(r.agent_id, [...(byAgent.get(r.agent_id) ?? []), r]);
  }
  for (const [agentId, list] of byAgent) {
    const sorted = [...list].sort((a, b) => Number(a.created_at_ms) - Number(b.created_at_ms));
    for (let i = 0; i + 2 < sorted.length; i++) {
      if (Number(sorted[i + 2].created_at_ms) - Number(sorted[i].created_at_ms) <= windowMs) {
        const ids = sorted.slice(i, i + 3).map((r) => r.id);
        const agent = agents.find((a) => a.account_id === agentId);
        events.push({
          id: `burst-${agentId}-${ids[0]}`,
          severity: "critical",
          kind: "repeated_violations",
          agentId,
          requestIds: ids,
          summary: `${agentId} had 3 blocked requests within ${Math.round(windowMs / 60000)} minutes.${agent?.status === "Active" ? " Consider suspending it." : ""}`,
          atMs: Number(sorted[i + 2].created_at_ms),
        });
        break;
      }
    }
  }
  return events.sort((a, b) => b.atMs - a.atMs);
}

/** 0 (clean) to 100. Weighted share of blocked requests plus severity of recent events. */
export function agentRiskScore(agentId: string, requests: RequestRecord[], events: RiskEvent[]): number {
  const mine = requests.filter((r) => r.agent_id === agentId);
  if (!mine.length) return 0;
  const blocked = mine.filter((r) => r.decision !== "Approved" && r.decision !== "RequiresHumanReview").length;
  const weights: Record<Severity, number> = { low: 2, medium: 6, high: 12, critical: 25 };
  const sev = events.filter((e) => e.agentId === agentId).reduce((s, e) => s + weights[e.severity], 0);
  return Math.min(100, Math.round((blocked / mine.length) * 50 + sev));
}
