/** Minimal NEAR JSON-RPC view client. Works in the browser and in route handlers. */
import { CONTRACT_ID, RPC_URL } from "./config";

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export async function viewCall<T>(method: string, args: Record<string, unknown> = {}, contractId = CONTRACT_ID): Promise<T> {
  if (!contractId) throw new Error("NEXT_PUBLIC_CONTRACT_ID is not set. Deploy the contract and add it to .env.local.");
  // A hung RPC node must not freeze the page or a serverless function: give up after 10 s.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: controller.signal,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "sentinel",
      method: "query",
      params: { request_type: "call_function", finality: "optimistic", account_id: contractId, method_name: method, args_base64: toBase64(JSON.stringify(args)) },
    }),
  }).catch((e) => {
    throw new Error(e?.name === "AbortError" ? "The NEAR RPC did not respond within 10 seconds." : `Can't reach the NEAR RPC: ${e?.message ?? e}`);
  }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`RPC ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.data ?? json.error.message ?? "RPC error");
  if (json.result?.error) throw new Error(json.result.error);
  const text = new TextDecoder().decode(Uint8Array.from(json.result.result as number[]));
  return JSON.parse(text) as T;
}

/** Pull NEP-297 events emitted by the Sentinel contract out of a transaction outcome. */
export function extractEvents(outcome: unknown): { event: string; data: any[] }[] {
  const o = outcome as { receipts_outcome?: { outcome: { logs: string[] } }[] } | undefined;
  const logs = o?.receipts_outcome?.flatMap((r) => r.outcome.logs) ?? [];
  return logs
    .filter((l) => l.startsWith("EVENT_JSON:"))
    .map((l) => {
      try { return JSON.parse(l.slice("EVENT_JSON:".length)); } catch { return null; }
    })
    .filter((e): e is { standard: string; event: string; data: any[] } => !!e && e.standard === "sentinel");
}

/** Decode the final return value of a transaction, if it succeeded. */
export function extractReturn<T>(outcome: unknown): T | null {
  const s = (outcome as { status?: { SuccessValue?: string } })?.status;
  if (!s || typeof s.SuccessValue !== "string" || s.SuccessValue === "") return null;
  try { return JSON.parse(fromBase64(s.SuccessValue)) as T; } catch { return null; }
}

export function extractTxHash(outcome: unknown): string | null {
  const o = outcome as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | undefined;
  return o?.transaction?.hash ?? o?.transaction_outcome?.id ?? null;
}
