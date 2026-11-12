# Deployment

The live deployment is `oxchimaobi2026-vault.testnet` (contract) and https://sentinel-vaults.vercel.app (web). It was built and deployed from **Windows PowerShell** with the commands in section A, which are the ones actually run. Section B is the same flow for macOS/Linux using the bash helpers in `scripts/`. Those scripts follow the same commands but were not used for the live deployment.

## Tools

- Node.js 20+ and npm
- Rust via rustup, plus the wasm target: `rustup toolchain install 1.86.0` and `rustup target add wasm32-unknown-unknown --toolchain 1.86.0`
- `cargo-near` (on Windows, the prebuilt installer: `powershell -ExecutionPolicy Bypass -c "irm https://github.com/near/cargo-near/releases/latest/download/cargo-near-installer.ps1 | iex"`)
- `near` CLI: `npm install -g near-cli-rs`
- `npm install` from the repo root

## A. Windows PowerShell (used for the live deployment)

### 1. Test and build

```powershell
npm test                                  # 53 tests
cd contracts/sentinel-vault
cargo +stable test --lib                  # 42 tests
cargo near build non-reproducible-wasm --no-abi
```

If the test build fails with "disk full" (`LNK1106`), free space; `$env:CARGO_PROFILE_DEV_DEBUG="0"` makes the test build much smaller.

### 2. Accounts

Pick unique names. One account each for owner, vault, agent and vendor (payee). When asked for a key type, choose `ed25519`.

```powershell
$OWNER = "yourname-owner.testnet"; $VAULT = "yourname-vault.testnet"; $AGENT = "yourname-agent.testnet"; $VENDOR = "yourname-vendor.testnet"
near account create-account sponsor-by-faucet-service $OWNER autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near account create-account sponsor-by-faucet-service $VAULT autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near account create-account sponsor-by-faucet-service $AGENT autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near account create-account sponsor-by-faucet-service $VENDOR autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
```

### 3. Deploy and initialize

The init arguments are passed as base64 to avoid PowerShell quoting problems.

```powershell
$INIT = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"owner_id":"' + $OWNER + '"}'))
near contract deploy $VAULT use-file target\near\sentinel_vault.wasm with-init-call new base64-args $INIT prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
near contract call-function as-read-only $VAULT get_overview json-args '{}' network-config testnet now
```

Expect your owner account and `"vault_balance": "0"`.

### 4. Agent key (least privilege)

From the repo root:

```powershell
cd ../..
$env:CONTRACT_ID = $VAULT; $env:AGENT_ID = $AGENT
node scripts/agent-key.mjs
```

It prints an `near account add-key … grant-function-call-access … --function-names 'request_transfer'` command, plus two lines for `.env.local`. Change `sign-with-keychain` to `sign-with-legacy-keychain` in the printed command before running it.

### 5. Upgrading the contract later

Code-only upgrade that keeps all state (used for the audit fix):

```powershell
cd contracts/sentinel-vault
cargo near build non-reproducible-wasm --no-abi
near contract deploy $VAULT use-file target\near\sentinel_vault.wasm without-init-call network-config testnet sign-with-legacy-keychain send
```

## B. macOS / Linux (bash helpers)

```bash
export OWNER_ID=you.testnet CONTRACT_ID=sentinel-vault-you.testnet AGENT_ID=sentinel-agent-you.testnet VENDOR_ID=sentinel-vendor-you.testnet
bash scripts/create-accounts.sh      # vault, agent and vendor via the faucet (create the owner in your wallet)
bash scripts/build.sh                # cargo near build non-reproducible-wasm --no-abi
bash scripts/deploy.sh               # deploy + new(owner_id)
CONTRACT_ID=$CONTRACT_ID AGENT_ID=$AGENT_ID node scripts/agent-key.mjs
bash scripts/demo-cli.sh             # optional: deposit, register, capsule and six scenarios from the terminal
```

The scripts use the near CLI's system keychain (`save-to-keychain`, `sign-with-keychain`). On machines without a keychain service, replace them with `save-to-legacy-keychain` and `sign-with-legacy-keychain`.

## Web app

```bash
cp .env.example apps/web/.env.local   # set NEXT_PUBLIC_CONTRACT_ID, AGENT_ACCOUNT_ID, AGENT_PRIVATE_KEY
npm run dev                           # http://localhost:3000
npm run build                         # production build
```

The default RPC is `https://test.rpc.fastnear.com`. Fonts are bundled through the `geist` package, so the build needs no access to Google Fonts.

### Owner setup in the UI

Import the owner account into a browser wallet (Meteor Wallet was used), connect it in the console, then: Settings → deposit; AI agents → register the agent; Intent capsules → create a capsule paying the vendor.

## Public website on Vercel

The web app and its two API routes (`/api/agent`, `/api/agent/info`) deploy together as one Vercel project. The API routes run as serverless functions on the same domain, so there is no separate backend, no API URL and no CORS configuration. The contract stays on NEAR Testnet.

1. Push the code to GitHub.
2. vercel.com → **Continue with GitHub** → **Add New… → Project** → **Import** the repository.
3. **Root Directory → `apps/web`**. Framework preset: **Next.js**. Leave build and install commands as default.
4. **Environment Variables:**

   | Name | Value | Secret? |
   | --- | --- | --- |
   | `NEXT_PUBLIC_NETWORK_ID` | `testnet` | No (shipped to the browser) |
   | `NEXT_PUBLIC_CONTRACT_ID` | your vault account | No |
   | `NEXT_PUBLIC_RPC_URL` | `https://test.rpc.fastnear.com` | No |
   | `NEXT_PUBLIC_EXPLORER_URL` | `https://testnet.nearblocks.io` | No |
   | `AGENT_ACCOUNT_ID` | your agent account | No |
   | `AGENT_PRIVATE_KEY` | the agent's function-call key | **Yes**, server only |

5. **Deploy**. Every `git push` redeploys.

If the build log says it can't find `@sentinel/engine`: **Settings → Build and Deployment → Install Command** → `cd ../.. && npm install`, then redeploy.

### What is public

- Visitors land on a welcome screen and can open the vault read-only; they can run simulations.
- Only the owner's wallet can deposit, withdraw, create capsules, approve, freeze or revoke. The contract checks the caller.
- Anyone can press **Run on-chain** in the Attack Lab. That spends gas from the agent key's allowance and can only make payments the active capsule allows. To make the public site simulation-only, remove `AGENT_PRIVATE_KEY` from Vercel and redeploy.
- `AGENT_PRIVATE_KEY` is read only in `apps/web/lib/server/*`, which imports `server-only`; Next.js refuses to bundle those files into browser code.
