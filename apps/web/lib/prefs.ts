/** Browser-local preferences. Never security-relevant: the contract enforces everything. */
export const PREF_NOTIFY_ACTIVITY = "sentinel.notify.activity";

export function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: boolean) {
  try { localStorage.setItem(key, value ? "1" : "0"); } catch {}
}
