import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOwnerInstruction, validateCapsuleDraft, draftToCapsuleInput, type CapsuleDraft } from "../src/instruction";

test("parses the canonical owner instruction", () => {
  const p = parseOwnerInstruction("Allow my AI agent to pay vendor.testnet a maximum of 3 NEAR for a service invoice. This authorization expires in 24 hours.");
  assert.equal(p.draft.recipient, "vendor.testnet");
  assert.equal(p.draft.maxPerTx, "3");
  assert.equal(p.draft.maxTotal, "3");
  assert.equal(p.draft.expiresInSeconds, 86400);
  assert.deepEqual(p.missing, ["agentId"]);
});
test("parses totals, review thresholds and minute expiries", () => {
  const p = parseOwnerInstruction("Pay vendor.testnet up to 1 NEAR per payment, 5 NEAR in total. Ask me before anything above 0.5 NEAR. Valid for 10 minutes.");
  assert.equal(p.draft.maxPerTx, "1");
  assert.equal(p.draft.maxTotal, "5");
  assert.equal(p.draft.reviewThreshold, "0.5");
  assert.equal(p.draft.expiresInSeconds, 600);
});
test("reports missing fields instead of guessing", () => {
  const p = parseOwnerInstruction("Handle my vendor payments");
  assert.ok(p.missing.includes("recipient") && p.missing.includes("maxPerTx") && p.missing.includes("expiresInSeconds"));
});
test("flags unsupported operations", () => {
  assert.ok(parseOwnerInstruction("swap 2 NEAR for a token at swap.testnet").notes.some((n) => n.includes("native NEAR")));
});

const good: CapsuleDraft = { agentId: "agent.testnet", recipient: "vendor.testnet", maxPerTx: "3", maxTotal: "3", reviewThreshold: "", expiresInSeconds: 3600, instruction: "Pay the vendor" };
test("valid draft has no errors and converts to contract input", () => {
  assert.deepEqual(validateCapsuleDraft(good), {});
  const input = draftToCapsuleInput(good, 1000);
  assert.equal(input.max_per_tx, "3000000000000000000000000");
  assert.equal(input.expires_at_ms, String(1000 + 3_600_000));
  assert.equal(input.review_threshold, null);
});
test("validation mirrors contract rules", () => {
  assert.ok(validateCapsuleDraft({ ...good, maxTotal: "1" }).maxTotal);
  assert.ok(validateCapsuleDraft({ ...good, reviewThreshold: "3" }).reviewThreshold);
  assert.ok(validateCapsuleDraft({ ...good, expiresInSeconds: 10 }).expiresInSeconds);
  assert.ok(validateCapsuleDraft({ ...good, recipient: "Bad Account" }).recipient);
  assert.ok(validateCapsuleDraft({ ...good, recipient: "agent.testnet" }).recipient);
  assert.ok(validateCapsuleDraft({ ...good, maxPerTx: "-1" }).maxPerTx);
});
