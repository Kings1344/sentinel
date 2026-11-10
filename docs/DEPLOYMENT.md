# Deployment (NEAR Testnet)

Every command below is real and must be run by you. Nothing in this repo has been deployed yet.

## 1. Install tools

```bash
rustup target add wasm32-unknown-unknown
cargo install --locked cargo-near
npm i -g near-cli-rs          # provides the `near` command
npm install                   # from the repo root
```

## 2. Accounts

| Account | What it is | How |
| --- | --- | --- |
| `OWNER_ID` | You. Signs capsules and controls. | Create in Meteor Wallet (testnet) and fund from the faucet |
| `CONTRACT_ID` | The vault | `scripts/create-accounts.sh` |
| `AGENT_ID` | The AI agent | `scripts/create-accounts.sh` |
| `VENDOR_ID` | A payee for the demo | `scripts/create-accounts.sh` |

```bash
export OWNER_ID=you.testnet
export CONTRACT_ID=sentinel-vault-you.testnet
export AGENT_ID=sentinel-agent-you.testnet
export VENDOR_ID=sentinel-vendor-you.testnet
bash scripts/create-accounts.sh
```

## 3. Build, test, deploy

```bash
npm test && npm run test:contract     # do not deploy if these fail
bash scripts/build.sh                 # -> contracts/sentinel-vault/target/near/sentinel_vault.wasm
bash scripts/deploy.sh                # deploys and calls new(owner_id)
near contract call-function as-read-only $CONTRACT_ID get_overview json-args '{}' network-config testnet now
```

Expect `owner` = your account, `vault_balance` = "0".

## 4. Agent key (least privilege)

```bash
node scripts/agent-key.mjs
```

It prints (a) a `near account add-key … grant-function-call-access … --function-names 'request_transfer'` command that adds a key to the agent account that can only call `request_transfer` on the vault, and (b) the `AGENT_ACCOUNT_ID` / `AGENT_PRIVATE_KEY` lines. Run (a), then put (b) in `apps/web/.env.local`. If your near-cli version names the flags differently, run `near account add-key --help` and keep the same meaning: function-call access, receiver = vault, method = `request_transfer`, small allowance.

## 5. Web app

```bash
cp .env.example apps/web/.env.local   # set NEXT_PUBLIC_CONTRACT_ID, AGENT_ACCOUNT_ID, AGENT_PRIVATE_KEY
npm run dev                           # http://localhost:3000
```

If `rpc.testnet.near.org` rate-limits you, set `NEXT_PUBLIC_RPC_URL` to another provider from https://docs.near.org/api/rpc/providers.

Hosting (optional): deploy `apps/web` to Vercel with the same env vars. Keep `AGENT_PRIVATE_KEY` as a server-only secret. Keep it up until 2026-11-18 (judging).

## 6. Owner setup in the UI

Connect `OWNER_ID` → Settings: deposit → Agents: register `AGENT_ID` → Capsules: create a capsule paying `VENDOR_ID`. Or run everything from the terminal: `bash scripts/demo-cli.sh` (needs the owner key in your near-cli keychain).

## 7. Record proof

After the demo, paste the contract address and the transaction hashes (one approved, one blocked per attack) into README > What is verified. Do not paste hashes you did not see on the explorer.
