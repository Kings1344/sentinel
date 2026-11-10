/**
 * Deterministic parser: owner's natural-language instruction -> structured capsule draft.
 * It only proposes. The owner reviews every field before signing, and nothing it does not
 * understand is guessed silently: unresolved fields are reported in `missing`.
 */
import { parseNear } from "./units";

export interface CapsuleDraft {
  agentId: string;
  recipient: string;
  maxPerTx: string; // NEAR, human units
  maxTotal: string;
  reviewThreshold: string; // "" = none
  expiresInSeconds: number;
  instruction: string;
}

export interface ParsedInstruction {
  draft: Partial<CapsuleDraft>;
  notes: string[];
  missing: (keyof CapsuleDraft)[];
}

const UNIT_SECONDS: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800 };

export function parseOwnerInstruction(text: string): ParsedInstruction {
  const draft: Partial<CapsuleDraft> = { instruction: text.trim() };
  const notes: string[] = [];

  const recipient = text.match(/\b(?:pay|send|transfer(?:\s+to)?|to)\s+([a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:testnet|near))\b/i)
    ?? text.match(/\b([a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:testnet|near))\b/i);
  if (recipient) draft.recipient = recipient[1].toLowerCase();

  const perTx = text.match(/\b(?:maximum of|max(?:imum)?|up to|no more than|at most|limit of)\s+(\d+(?:\.\d+)?)\s*NEAR\b/i)
    ?? text.match(/(\d+(?:\.\d+)?)\s*NEAR\b/i);
  if (perTx) draft.maxPerTx = perTx[1];

  const total = text.match(/(\d+(?:\.\d+)?)\s*NEAR\s+(?:in\s+total|total|overall|combined)\b/i)
    ?? text.match(/\b(?:total|overall|combined)\s+(?:of\s+|limit\s+of\s+)?(\d+(?:\.\d+)?)\s*NEAR\b/i);
  if (total) draft.maxTotal = total[1];
  else if (draft.maxPerTx) { draft.maxTotal = draft.maxPerTx; notes.push("No total limit stated; total limit set equal to the per-payment limit."); }

  const review = text.match(/\b(?:ask me|review|approval|approve)\b[^.]*?\b(?:above|over|more than)\s+(\d+(?:\.\d+)?)\s*NEAR\b/i);
  if (review) draft.reviewThreshold = review[1];

  const exp = text.match(/\b(?:expires?|valid|for|within)\s+(?:in\s+|for\s+)?(\d+)\s*(second|minute|hour|day|week)s?\b/i);
  if (exp) draft.expiresInSeconds = Number(exp[1]) * UNIT_SECONDS[exp[2].toLowerCase()];
  else if (/\b(?:today|24\s*h)\b/i.test(text)) draft.expiresInSeconds = 86400;

  const missing: (keyof CapsuleDraft)[] = [];
  if (!draft.recipient) missing.push("recipient");
  if (!draft.maxPerTx) missing.push("maxPerTx");
  if (!draft.expiresInSeconds) missing.push("expiresInSeconds");
  missing.push("agentId");
  if (/\b(swap|stake|token|nft|ft_|call)\b/i.test(text)) notes.push("This vault only authorizes native NEAR transfers. Swaps, staking and contract calls cannot be authorized.");
  return { draft, notes, missing };
}

/** Returns field -> error message. Empty object means valid. Mirrors the contract's capsule validation. */
export function validateCapsuleDraft(d: CapsuleDraft): Partial<Record<keyof CapsuleDraft, string>> {
  const e: Partial<Record<keyof CapsuleDraft, string>> = {};
  const acct = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
  if (!d.agentId || !acct.test(d.agentId)) e.agentId = "Choose a registered agent.";
  if (!d.recipient || !acct.test(d.recipient) || d.recipient.length < 2 || d.recipient.length > 64) e.recipient = "Enter a valid NEAR account, like vendor.testnet.";
  let per = 0n, tot = 0n;
  try { per = parseNear(d.maxPerTx); if (per === 0n) e.maxPerTx = "Must be more than 0."; } catch { e.maxPerTx = "Enter an amount in NEAR, like 3 or 0.5."; }
  try { tot = parseNear(d.maxTotal); if (tot === 0n) e.maxTotal = "Must be more than 0."; } catch { e.maxTotal = "Enter an amount in NEAR."; }
  if (!e.maxPerTx && !e.maxTotal && per > tot) e.maxTotal = "Total limit must be at least the per-payment limit.";
  if (d.reviewThreshold.trim()) {
    try {
      const r = parseNear(d.reviewThreshold);
      if (!e.maxPerTx && r >= per) e.reviewThreshold = "Review threshold must be below the per-payment limit.";
    } catch { e.reviewThreshold = "Enter an amount in NEAR, or leave empty."; }
  }
  if (!Number.isInteger(d.expiresInSeconds) || d.expiresInSeconds < 30 || d.expiresInSeconds > 30 * 86400) e.expiresInSeconds = "Expiry must be between 30 seconds and 30 days.";
  if (!d.instruction.trim()) e.instruction = "Write the instruction you are giving the agent.";
  else if (new TextEncoder().encode(d.instruction).length > 500) e.instruction = "Keep the instruction under 500 bytes.";
  if (d.recipient && d.agentId && d.recipient === d.agentId) e.recipient = "The recipient cannot be the agent itself.";
  return e;
}

/** Contract `create_capsule` input (amounts as yocto strings). */
export function draftToCapsuleInput(d: CapsuleDraft, nowMs: number) {
  return {
    agent_id: d.agentId,
    operation: "native_transfer",
    asset: "NEAR",
    recipient: d.recipient,
    max_per_tx: parseNear(d.maxPerTx).toString(),
    max_total: parseNear(d.maxTotal).toString(),
    review_threshold: d.reviewThreshold.trim() ? parseNear(d.reviewThreshold).toString() : null,
    expires_at_ms: String(nowMs + d.expiresInSeconds * 1000),
    instruction: d.instruction.trim(),
  };
}
