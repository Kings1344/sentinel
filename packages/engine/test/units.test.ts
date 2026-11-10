import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNear, formatNear, fmtNear, isValidAccountId } from "../src/units";

test("parseNear handles whole and fractional amounts exactly", () => {
  assert.equal(parseNear("3"), 3n * 10n ** 24n);
  assert.equal(parseNear("0.5"), 5n * 10n ** 23n);
  assert.equal(parseNear("0.000000000000000000000001"), 1n);
});
test("parseNear rejects unsafe input", () => {
  for (const bad of ["-1", "1e3", "abc", "", "1.0000000000000000000000001", " 1 2"]) assert.throws(() => parseNear(bad));
});
test("formatNear truncates and trims", () => {
  assert.equal(formatNear(parseNear("1.23456"), 2), "1.23");
  assert.equal(formatNear(parseNear("2")), "2");
  assert.equal(fmtNear(parseNear("0.1")), "0.1 NEAR");
});
test("account id validation", () => {
  assert.ok(isValidAccountId("vendor.testnet"));
  assert.ok(!isValidAccountId("Vendor.testnet"));
  assert.ok(!isValidAccountId("a"));
  assert.ok(!isValidAccountId("bad..testnet"));
});
