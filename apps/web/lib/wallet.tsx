"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import "@near-wallet-selector/modal-ui/styles.css";
import { CONTRACT_ID, NETWORK_ID } from "./config";
import { extractReturn, extractTxHash } from "./rpc";

export const GAS_100T = "100000000000000";
export const GAS_300T = "300000000000000";

export interface CallResult<T = unknown> {
  hash: string | null;
  value: T | null;
  outcome: unknown;
}

interface WalletCtx {
  ready: boolean;
  accountId: string | null;
  signIn: () => void;
  signOut: () => Promise<void>;
  call: <T = unknown>(method: string, args: Record<string, unknown>, depositYocto?: string, gas?: string) => Promise<CallResult<T>>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const s = await setupWalletSelector({ network: NETWORK_ID, modules: [setupMeteorWallet(), setupMyNearWallet()] });
      const m = setupModal(s, { contractId: CONTRACT_ID });
      const sub = s.store.observable.subscribe((state) => {
        setAccountId(state.accounts.find((a) => a.active)?.accountId ?? null);
      });
      unsub = () => sub.unsubscribe();
      setSelector(s);
      setModal(m);
    })().catch((e) => console.error("Wallet selector failed to start", e));
    return () => unsub?.();
  }, []);

  const signIn = useCallback(() => modal?.show(), [modal]);

  const signOut = useCallback(async () => {
    if (!selector) return;
    const w = await selector.wallet();
    await w.signOut();
  }, [selector]);

  const call = useCallback(
    async <T,>(method: string, args: Record<string, unknown>, depositYocto = "0", gas = GAS_100T): Promise<CallResult<T>> => {
      if (!selector) throw new Error("Wallet is still loading.");
      if (!CONTRACT_ID) throw new Error("NEXT_PUBLIC_CONTRACT_ID is not set.");
      const w = await selector.wallet();
      const outcome = await w.signAndSendTransaction({
        receiverId: CONTRACT_ID,
        actions: [{ type: "FunctionCall", params: { methodName: method, args, gas, deposit: depositYocto } }],
      });
      // Redirect-based wallets return nothing; the page reloads after approval.
      return { hash: extractTxHash(outcome), value: extractReturn<T>(outcome), outcome };
    },
    [selector],
  );

  return <Ctx.Provider value={{ ready: !!selector, accountId, signIn, signOut, call }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet must be used inside WalletProvider");
  return c;
}
