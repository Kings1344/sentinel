/** Fixed-point NEAR accounting. All amounts are bigint yoctoNEAR (1 NEAR = 10^24 yocto). */
export const YOCTO_PER_NEAR = 10n ** 24n;

/** Parse a human NEAR amount ("1.5") into yoctoNEAR. Rejects negatives, exponents and >24 decimals. */
export function parseNear(input: string): bigint {
  const s = String(input).trim();
  if (!/^\d+(\.\d{1,24})?$/.test(s)) throw new Error(`Invalid NEAR amount: "${input}"`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * YOCTO_PER_NEAR + BigInt((frac + "0".repeat(24)).slice(0, 24));
}

/** Format yoctoNEAR with up to `maxDecimals` decimals (truncated, never rounded up). */
export function formatNear(yocto: bigint | string, maxDecimals = 24): string {
  const y = typeof yocto === "bigint" ? yocto : BigInt(yocto);
  const whole = y / YOCTO_PER_NEAR;
  let frac = (y % YOCTO_PER_NEAR).toString().padStart(24, "0").slice(0, maxDecimals);
  frac = frac.replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Identical to the contract's fmt_near(): full precision, trailing zeros trimmed. */
export function fmtNear(yocto: bigint | string): string {
  return `${formatNear(yocto, 24)} NEAR`;
}

const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export function isValidAccountId(id: string): boolean {
  return typeof id === "string" && id.length >= 2 && id.length <= 64 && ACCOUNT_RE.test(id);
}
