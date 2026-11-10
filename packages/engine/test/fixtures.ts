import type { Agent, Capsule } from "../src/types";
import { parseNear } from "../src/units";

export const NOW = 1_800_000_000_000n;

export function agent(over: Partial<Agent> = {}): Agent {
  return { account_id: "agent.testnet", label: "Demo agent", status: "Active", registered_at_ms: "1", approved_count: 0, blocked_count: 0, capsule_ids: [1], ...over };
}

export function capsule(over: Partial<Capsule> = {}): Capsule {
  return {
    id: 1, version: 1, supersedes: null, agent_id: "agent.testnet", operation: "native_transfer", asset: "NEAR",
    recipient: "vendor.testnet", max_per_tx: parseNear("3").toString(), max_total: parseNear("3").toString(),
    review_threshold: null, instruction: "Pay vendor.testnet up to 3 NEAR for invoice #1042",
    created_at_ms: String(NOW - 1000n), expires_at_ms: String(NOW + 86_400_000n), status: "Active",
    spent: "0", reserved: "0", last_nonce: "0", commitment: "ab".repeat(32), ...over,
  };
}
