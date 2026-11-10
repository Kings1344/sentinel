/**
 * Deterministic demo agent.
 *
 * It stands in for an LLM agent that reads its owner's task AND untrusted external content
 * (a web page, an email, a tool result) and builds a transaction from both. It is deliberately
 * naive: later instructions override earlier ones, which is exactly how prompt injection
 * hijacks real agents. Sentinel does not try to make the agent safe; the contract enforces the
 * owner's capsule regardless of what the agent proposes.
 */
import type { Capsule, TransferRequest } from "./types";
import { parseNear } from "./units";

const ACCOUNT_TOKEN = /\b([a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:testnet|near))\b/gi;

export interface Interpretation {
  recipient?: string;
  amount?: bigint;
  asset?: string;
  operation?: string;
}

/** Extract transaction fields from free text. Last mention wins. */
export function interpret(text: string): Interpretation {
  const out: Interpretation = {};
  if (!text) return out;

  const recipients = [...text.matchAll(/\b(?:to|recipient(?:\s+is)?|account(?:\s+is)?|address(?:\s+is)?|wallet(?:\s+is)?)\s*:?\s*([a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:testnet|near))\b/gi)];
  if (recipients.length) out.recipient = recipients[recipients.length - 1][1].toLowerCase();
  else {
    const any = [...text.matchAll(ACCOUNT_TOKEN)];
    if (any.length) out.recipient = any[any.length - 1][1].toLowerCase();
  }

  const amounts = [...text.matchAll(/(\d+(?:\.\d{1,24})?)\s*NEAR\b/gi)];
  if (amounts.length) out.amount = parseNear(amounts[amounts.length - 1][1]);

  const assets = [...text.matchAll(/\b(?:buy|purchase|acquire)\s+(?:token\s+)?([A-Z][A-Z0-9-]{1,15})\b/g)];
  if (assets.length) {
    const sym = assets[assets.length - 1][1];
    out.asset = sym === "NEAR" ? "NEAR" : sym;
  }

  if (/\b(ft_transfer(?:_call)?|function[\s_-]?call|call\s+(?:the\s+)?(?:method|contract)|call\s+[a-z_]+\s+on)\b/i.test(text)) {
    out.operation = "function_call";
  }
  return out;
}

export interface AgentInput {
  capsule: Capsule;
  task: string;
  externalContent?: string;
  nonce: number;
}

export interface AgentOutput {
  proposal: TransferRequest;
  trace: string[];
}

export function proposeTransaction({ capsule, task, externalContent, nonce }: AgentInput): AgentOutput {
  const trace: string[] = [];
  const proposal: TransferRequest = {
    capsule_id: capsule.id,
    nonce,
    operation: capsule.operation,
    asset: capsule.asset,
    recipient: capsule.recipient,
    amount: "0",
    memo: "sentinel-demo-agent",
  };
  trace.push(`Loaded capsule #${capsule.id} defaults: ${capsule.operation}, ${capsule.asset}, ${capsule.recipient}.`);

  const apply = (source: string, i: Interpretation) => {
    if (i.recipient) { proposal.recipient = i.recipient; trace.push(`${source}: recipient set to ${i.recipient}.`); }
    if (i.amount !== undefined) { proposal.amount = i.amount.toString(); trace.push(`${source}: amount set to ${i.amount} yocto.`); }
    if (i.asset) { proposal.asset = i.asset; trace.push(`${source}: asset set to ${i.asset}.`); }
    if (i.operation) { proposal.operation = i.operation; trace.push(`${source}: operation set to ${i.operation}.`); }
  };

  apply("Owner task", interpret(task));
  if (externalContent && externalContent.trim()) {
    trace.push("Reading external content (untrusted)…");
    apply("External content", interpret(externalContent));
  }
  trace.push(`Proposal ready with nonce ${nonce}. Submitting to Sentinel.`);
  return { proposal, trace };
}
