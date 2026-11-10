import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRequest } from "../src/verify";
import { parseNear } from "../src/units";
import { agent, capsule, NOW } from "./fixtures";
import type { TransferRequest } from "../src/types";

const req = (over: Partial<TransferRequest> = {}): TransferRequest => ({
  capsule_id: 1, nonce: 1, operation: "native_transfer", asset: "NEAR", recipient: "vendor.testnet",
  amount: parseNear("1").toString(), memo: null, ...over,
});
const run = (over: Partial<Parameters<typeof evaluateRequest>[0]> = {}) =>
  evaluateRequest({ frozen: false, vaultBalance: parseNear("10"), agent: agent(), capsule: capsule(), request: req(), nowMs: NOW, ...over });

test("matching request is approved with every check passing", () => {
  const v = run();
  assert.equal(v.decision, "Approved");
  assert.equal(v.reason, "Authorized");
  assert.ok(v.checks.every((c) => c.passed));
  assert.deepEqual(v.checks.map((c) => c.name), [
    "vault_active", "agent_active", "capsule_exists", "capsule_bound_to_agent", "capsule_active", "capsule_not_expired",
    "nonce_sequence", "operation_matches", "asset_matches", "recipient_matches", "amount_within_tx_limit",
    "cumulative_within_limit", "memo_valid", "vault_liquidity",
  ]);
});
test("recipient substitution is blocked", () => {
  const v = run({ request: req({ recipient: "attacker.testnet" }) });
  assert.equal(v.decision, "Blocked"); assert.equal(v.reason, "RecipientMismatch");
});
test("asset substitution is blocked even under the spending limit", () => {
  const v = run({ request: req({ asset: "TOKENB", amount: parseNear("0.1").toString() }) });
  assert.equal(v.reason, "AssetMismatch");
});
test("operation substitution is blocked", () => assert.equal(run({ request: req({ operation: "function_call" }) }).reason, "OperationMismatch"));
test("amount above per-tx limit is blocked", () => assert.equal(run({ request: req({ amount: parseNear("8").toString() }) }).reason, "AmountExceedsTxLimit"));
test("zero amount is invalid", () => assert.equal(run({ request: req({ amount: "0" }) }).reason, "InvalidAmount"));
test("cumulative limit counts spent and reserved funds", () => {
  const v = run({ capsule: capsule({ spent: parseNear("1.5").toString(), reserved: parseNear("1").toString() }) });
  assert.equal(v.reason, "CumulativeLimitExceeded");
});
test("replayed nonce is blocked", () => assert.equal(run({ capsule: capsule({ last_nonce: "3" }), request: req({ nonce: 3 }) }).reason, "NonceReplay"));
test("skipped nonce is blocked", () => assert.equal(run({ request: req({ nonce: 5 }) }).reason, "NonceOutOfOrder"));
test("expired capsule returns EXPIRED", () => {
  const v = run({ capsule: capsule({ expires_at_ms: String(NOW - 1n) }) });
  assert.equal(v.decision, "Expired"); assert.equal(v.reason, "CapsuleExpired");
});
test("revoked capsule and revoked agent return REVOKED", () => {
  assert.equal(run({ capsule: capsule({ status: "Revoked" }) }).decision, "Revoked");
  const v = run({ agent: agent({ status: "Revoked" }) });
  assert.equal(v.decision, "Revoked"); assert.equal(v.reason, "AgentRevoked");
});
test("frozen vault blocks before anything else", () => assert.equal(run({ frozen: true, request: req({ recipient: "x.testnet" }) }).reason, "VaultFrozen"));
test("another agent's capsule is rejected", () => assert.equal(run({ capsule: capsule({ agent_id: "other.testnet" }) }).reason, "CapsuleAgentMismatch"));
test("missing capsule is rejected", () => assert.equal(run({ capsule: null }).reason, "CapsuleNotFound"));
test("insufficient vault liquidity is rejected", () => assert.equal(run({ vaultBalance: parseNear("0.5") }).reason, "InsufficientVaultBalance"));
test("amount over review threshold requires human review", () => {
  const v = run({ capsule: capsule({ review_threshold: parseNear("0.5").toString() }) });
  assert.equal(v.decision, "RequiresHumanReview"); assert.equal(v.reason, "ReviewThresholdExceeded");
});
test("first failure decides; all checks are still reported", () => {
  const v = run({ request: req({ recipient: "attacker.testnet", amount: parseNear("8").toString() }) });
  assert.equal(v.reason, "RecipientMismatch");
  assert.equal(v.checks.find((c) => c.name === "amount_within_tx_limit")?.passed, false);
});
