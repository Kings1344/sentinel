import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRisk, agentRiskScore } from "../src/risk";
import type { RequestRecord } from "../src/types";
import { agent } from "./fixtures";

const rec = (id: number, reason: RequestRecord["reason"], decision: RequestRecord["decision"], t: number): RequestRecord => ({
  id, capsule_id: 1, agent_id: "agent.testnet", nonce: String(id), operation: "native_transfer", asset: "NEAR",
  recipient: "vendor.testnet", amount: "1", memo: null, decision, reason, explanation: "x", status: "Rejected",
  created_at_ms: String(t), block_height: "1",
});

test("intent mismatches become risk events; approvals do not", () => {
  const ev = analyzeRisk([rec(1, "Authorized", "Approved", 1), rec(2, "RecipientMismatch", "Blocked", 2)], [agent()]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, "recipient_substitution");
});
test("three violations inside the window raise a critical burst event", () => {
  const ev = analyzeRisk([rec(1, "AssetMismatch", "Blocked", 0), rec(2, "NonceReplay", "Blocked", 1000), rec(3, "AgentRevoked", "Revoked", 2000)], [agent()]);
  assert.ok(ev.some((e) => e.kind === "repeated_violations" && e.severity === "critical"));
  assert.ok(ev.some((e) => e.kind === "post_revocation_activity"));
});
test("risk score is 0 for a clean agent and grows with violations", () => {
  const clean = [rec(1, "Authorized", "Approved", 1)];
  assert.equal(agentRiskScore("agent.testnet", clean, analyzeRisk(clean, [agent()])), 0);
  const dirty = [rec(1, "RecipientMismatch", "Blocked", 1), rec(2, "Authorized", "Approved", 2)];
  assert.ok(agentRiskScore("agent.testnet", dirty, analyzeRisk(dirty, [agent()])) > 30);
});
