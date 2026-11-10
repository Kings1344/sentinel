"use client";
/** Live contract state. The contract is the source of truth; this only reads and re-polls it. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Agent, AuditEvent, Capsule, Overview, RequestRecord, RiskEvent } from "@sentinel/engine";
import { analyzeRisk } from "@sentinel/engine";
import { viewCall } from "./rpc";
import { isConfigured } from "./config";
import { useWallet } from "./wallet";

interface VaultState {
  overview: Overview | null;
  agents: Agent[];
  capsules: Capsule[];
  requests: RequestRecord[];
  audit: AuditEvent[];
  risk: RiskEvent[];
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  isOwner: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<VaultState | null>(null);
export const POLL_KEY = "sentinel.pollSeconds";

export function VaultProvider({ children }: { children: ReactNode }) {
  const { accountId } = useWallet();
  const [s, setS] = useState<Omit<VaultState, "refresh" | "isOwner" | "risk">>({
    overview: null, agents: [], capsules: [], requests: [], audit: [], loading: true, error: null, updatedAt: null,
  });

  const refresh = useCallback(async () => {
    if (!isConfigured()) {
      setS((p) => ({ ...p, loading: false, error: "No contract configured. Set NEXT_PUBLIC_CONTRACT_ID in apps/web/.env.local." }));
      return;
    }
    try {
      const [overview, agents, capsules, requests, audit] = await Promise.all([
        viewCall<Overview>("get_overview"),
        viewCall<Agent[]>("get_agents"),
        viewCall<Capsule[]>("get_capsules", { limit: 100 }),
        viewCall<RequestRecord[]>("get_requests", { limit: 100 }),
        viewCall<AuditEvent[]>("get_audit", { limit: 100 }),
      ]);
      setS({ overview, agents, capsules, requests, audit, loading: false, error: null, updatedAt: Date.now() });
    } catch (e) {
      setS((p) => ({ ...p, loading: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);

  useEffect(() => {
    refresh();
    let seconds = 8;
    try { seconds = Math.max(3, Number(localStorage.getItem(POLL_KEY) ?? 8)); } catch {}
    const id = setInterval(refresh, seconds * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  const risk = useMemo(() => analyzeRisk(s.requests, s.agents), [s.requests, s.agents]);
  const isOwner = !!accountId && !!s.overview && accountId === s.overview.owner;

  return <Ctx.Provider value={{ ...s, risk, isOwner, refresh }}>{children}</Ctx.Provider>;
}

export function useVault(): VaultState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useVault must be used inside VaultProvider");
  return c;
}
