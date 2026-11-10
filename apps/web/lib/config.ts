/** Public configuration (safe for the browser). Server secrets live in lib/server/*. */
export const NETWORK_ID = (process.env.NEXT_PUBLIC_NETWORK_ID ?? "testnet") as "testnet" | "mainnet";
export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.near.org";
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.nearblocks.io";

export const isConfigured = () => CONTRACT_ID.length > 0;
export const txUrl = (hash: string) => `${EXPLORER_URL}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER_URL}/address/${id}`;
