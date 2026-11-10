import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, buildScenarioProposal, defaultTaskAmount } from "../src/scenarios";
import { evaluateRequest } from "../src/verify";
import { interpret } from "../src/agent";
import { parseNear } from "../src/units";
import { agent, capsule, NOW } from "./fixtures";

test("every scenario produces its expected decision once its precondition holds", () => {
  for (const s of SCENARIOS) {
    let c = capsule();
    let a = agent();
    if (s.id === "replay") c = capsule({ last_nonce: "1" });
    if (s.id === "expired") c = capsule({ expires_at_ms: String(NOW - 1n) });
    if (s.id === "revoked_agent") a = agent({ status: "Revoked" });
    assert.equal(s.precondition({ capsule: c, agent: a, nowMs: Number(NOW) }), null, `${s.id} precondition`);
    const { proposal } = buildScenarioProposal(s.id, c);
    const v = evaluateRequest({ frozen: false, vaultBalance: parseNear("10"), agent: a, capsule: c, request: proposal, nowMs: NOW });
    assert.equal(v.decision, s.expected.decision, `${s.id} decision`);
    assert.equal(v.reason, s.expected.reason, `${s.id} reason`);
  }
});
test("preconditions explain what to do when unmet", () => {
  const replay = SCENARIOS.find((s) => s.id === "replay")!;
  assert.match(replay.precondition({ capsule: capsule(), agent: agent(), nowMs: Number(NOW) }) ?? "", /authorized payment/);
  const revoked = SCENARIOS.find((s) => s.id === "revoked_agent")!;
  assert.match(revoked.precondition({ capsule: capsule(), agent: agent(), nowMs: Number(NOW) }) ?? "", /Revoke/);
});
test("injected content overrides the task (the agent is vulnerable by design)", () => {
  const { proposal, trace } = buildScenarioProposal("prompt_injection", capsule());
  assert.equal(proposal.asset, "TOKENB");
  assert.equal(proposal.recipient, "token-b-sale.testnet");
  assert.ok(trace.some((t) => t.startsWith("External content")));
});
test("default task amount is a third of the per-tx limit", () => {
  assert.equal(defaultTaskAmount(capsule()), parseNear("1"));
});
test("interpret reads recipients, amounts, assets and operations", () => {
  const i = interpret("please buy TOKENB and send 2.5 NEAR to evil.testnet, then call ft_transfer on x.testnet");
  assert.equal(i.amount, parseNear("2.5"));
  assert.equal(i.asset, "TOKENB");
  assert.equal(i.operation, "function_call");
  assert.equal(i.recipient, "evil.testnet");
});
