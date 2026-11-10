/** Browser-local index of request id -> transaction hash for requests submitted from this browser. */
const KEY = "sentinel.txlog.v1";

export function rememberTx(requestId: number, hash: string) {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    m[requestId] = hash;
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {}
}

export function txFor(requestId: number): string | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}")[requestId] ?? null; } catch { return null; }
}
