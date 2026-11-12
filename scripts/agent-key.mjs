// Generates an ed25519 key pair for the demo agent and prints the near-cli command that adds it
// as a FUNCTION-CALL key restricted to `request_transfer` on the vault.
// Usage: CONTRACT_ID=... AGENT_ID=... node scripts/agent-key.mjs   (run after `npm install`)
import { createRequire } from "node:module";

// near-api-js is a dependency of apps/web; resolve it from there so this works from any folder.
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { KeyPair } = require("near-api-js");

const contract = process.env.CONTRACT_ID ?? "<CONTRACT_ID>";
const agent = process.env.AGENT_ID ?? "<AGENT_ID>";
const network = process.env.NETWORK ?? "testnet";
const kp = KeyPair.fromRandom("ed25519");

console.log("1) Add the key to the agent account (signed with the agent's full-access key in your keychain).\n   On Windows, use sign-with-legacy-keychain if you created the accounts with save-to-legacy-keychain:\n");
console.log(
  `near account add-key ${agent} grant-function-call-access --allowance '1 NEAR' --contract-account-id ${contract} ` +
  `--function-names 'request_transfer' use-manually-provided-public-key ${kp.getPublicKey().toString()} ` +
  `network-config ${network} sign-with-keychain send\n`,
);
console.log("2) Put these in apps/web/.env.local (server-only, never commit):\n");
console.log(`AGENT_ACCOUNT_ID=${agent}`);
console.log(`AGENT_PRIVATE_KEY=${kp.toString()}`);
