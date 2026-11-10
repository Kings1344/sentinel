import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalCapsuleJson, capsuleCommitment, type CapsuleTerms } from "../src/commitment";

export const VECTOR: CapsuleTerms = {
  vault: "sentinel.testnet", owner: "owner.testnet", agent_id: "agent.testnet", operation: "native_transfer",
  asset: "NEAR", recipient: "vendor.testnet", max_per_tx: "3000000000000000000000000", max_total: "3000000000000000000000000",
  review_threshold: null, expires_at_ms: "1800000000000", instruction: "Pay vendor.testnet up to 3 NEAR for invoice #1042",
  version: 1, supersedes: null,
};

test("canonical JSON has fixed key order and no whitespace", () => {
  assert.equal(
    canonicalCapsuleJson(VECTOR),
    '{"domain":"sentinel-capsule-v1","vault":"sentinel.testnet","owner":"owner.testnet","agent_id":"agent.testnet","operation":"native_transfer","asset":"NEAR","recipient":"vendor.testnet","max_per_tx":"3000000000000000000000000","max_total":"3000000000000000000000000","review_threshold":null,"expires_at_ms":"1800000000000","instruction":"Pay vendor.testnet up to 3 NEAR for invoice #1042","version":1,"supersedes":null}',
  );
});
test("commitment is stable (shared test vector with the Rust contract)", async () => {
  // Same constant is asserted in contracts/sentinel-vault/src/tests.rs (commitment_matches_shared_vector).
  assert.equal(await capsuleCommitment(VECTOR), "34161a6feb114b8786bbc63c3513c07ec5da342527bb7c4f544aac60ef9e5e3c");
});
test("any field change changes the commitment", async () => {
  const base = await capsuleCommitment(VECTOR);
  assert.notEqual(await capsuleCommitment({ ...VECTOR, recipient: "attacker.testnet" }), base);
  assert.notEqual(await capsuleCommitment({ ...VECTOR, max_total: "3000000000000000000000001" }), base);
  assert.notEqual(await capsuleCommitment({ ...VECTOR, version: 2, supersedes: 1 }), base);
});
