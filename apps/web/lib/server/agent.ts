import "server-only";
/**
 * Server-side demo agent signer. Holds ONLY the agent's own key (ideally a function-call key
 * limited to `request_transfer` on the vault). It never holds the owner's key and it cannot
 * call any owner method: the contract checks the caller on every call.
 */
import { connect, keyStores, KeyPair } from "near-api-js";
import type { TransferRequest } from "@sentinel/engine";
import { CONTRACT_ID, NETWORK_ID, RPC_URL } from "../config";

export const AGENT_ACCOUNT_ID = process.env.AGENT_ACCOUNT_ID ?? "";
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY ?? "";

export const agentConfigured = () => !!(AGENT_ACCOUNT_ID && AGENT_PRIVATE_KEY && CONTRACT_ID);

export async function submitAsAgent(request: TransferRequest) {
  if (!agentConfigured()) throw new Error("Agent signer is not configured (AGENT_ACCOUNT_ID / AGENT_PRIVATE_KEY).");
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(NETWORK_ID, AGENT_ACCOUNT_ID, KeyPair.fromString(AGENT_PRIVATE_KEY as Parameters<typeof KeyPair.fromString>[0]));
  const near = await connect({ networkId: NETWORK_ID, nodeUrl: RPC_URL, keyStore });
  const account = await near.account(AGENT_ACCOUNT_ID);
  return account.functionCall({
    contractId: CONTRACT_ID,
    methodName: "request_transfer",
    args: { request },
    gas: BigInt("100000000000000"),
    attachedDeposit: BigInt(0),
  });
}
