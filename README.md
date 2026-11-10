# Sentinel

**Your AI can act. Sentinel makes sure it acts on your instructions.**

Sentinel is a NEAR smart contract vault that holds native NEAR for an owner and only releases it to an AI agent's request when every field of that request matches an *Intent Capsule* the owner signed: the agent, the operation, the asset, the recipient, the per-payment and total limits, the expiry, and a fresh nonce. Anything else is refused by the contract, recorded on-chain and explained.

Built at NEAR HACKATHON 2026, track: **AI Security & Defense** (`security`). Testnet only.

> Status: see [What is verified](#what-is-verified) before relying on any claim in this README.

---

## The problem

An agent that reads web pages, emails or tool output can be steered by text inside them. A hijacked agent rarely tries to drain a wallet. It makes a small, plausible payment to the wrong place, in the wrong asset, or through the wrong operation. A spending limit approves that payment because it is under the limit.

## What Sentinel does

| Layer | Where it runs | Authority |
| --- | --- | --- |
| Sentinel Vault contract (Rust, near-sdk 5) | NEAR Testnet | **Decides.** Holds funds, stores capsules, checks every request, releases or refuses. |
| Security engine (`packages/engine`, TypeScript) | Browser and server | Mirrors the contract's checks for previews, the Attack Lab simulation, instruction parsing and risk analysis. Never decides. |
| Web console (Next.js) | Browser + one server route | Owner signs capsules and controls with their wallet; the Attack Lab drives a demo agent. |
| Demo agent | Server route, signs as the agent account | Builds proposals from the owner task plus untrusted content. Vulnerable to injection on purpose. |

Key properties, all enforced in `contracts/sentinel-vault/src/lib.rs`:

- Only registered agents can call `request_transfer`; unregistered callers are refused before any storage is written.
- 15 deterministic checks run on every request. The first failure decides. Policy violations are **returned and stored, not panicked**, so the audit record survives.
- Nonces are strict per capsule (`last_nonce + 1`). Blocked attempts consume their nonce, so they cannot be replayed later.
- Approved amounts are reserved before the transfer promise and only counted as spent in the callback if the transfer succeeded. Failed transfers are refunded to the vault ledger.
- Capsule commitment = SHA-256 of canonical JSON terms. The owner can pass `expected_commitment`; the contract refuses to create a capsule whose terms hash differently ("what you reviewed is what gets committed"). The browser recomputes the hash independently.
- **Tightening vs loosening.** Freeze, suspend, revoke agent and revoke capsule work from a limited function-call key so the owner can react fast. Register, resume, reinstate, create/amend capsule, unfreeze, withdraw and approving a held payment require 1 yoctoNEAR, which forces a full-access wallet confirmation.
- Optional human review: payments above a per-capsule threshold are held (funds reserved) until the owner approves or rejects on-chain.

## Repository layout

```
contracts/sentinel-vault/   Rust contract, unit tests (src/tests.rs), sandbox e2e tests (tests/sandbox.rs)
packages/engine/            TypeScript: types, commitment, verification mirror, demo agent, scenarios, risk, tests
apps/web/                   Next.js 15 console + /api/agent route (demo agent signer)
scripts/                    build, test, account creation, deploy, agent key, CLI demo
docs/                       architecture, security model, threat model, competitive analysis, attack lab, demo script, deployment
```

## Prerequisites

- Node.js 20+ and npm
- Rust via rustup (the contract pins 1.86.0 in `rust-toolchain.toml`) with `wasm32-unknown-unknown`
- `cargo-near`: `cargo install --locked cargo-near`
- `near` CLI (near-cli-rs): `npm i -g near-cli-rs` or see https://docs.near.org/tools/near-cli
- A NEAR testnet wallet for the owner (Meteor Wallet recommended: it returns results without a page redirect)

## Run it

```bash
npm install
npm test                       # engine tests (38 tests)
npm run test:contract          # contract unit tests
npm run test:sandbox           # contract end-to-end tests on a local NEAR sandbox
```

Deploy to testnet (full detail in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)):

```bash
export OWNER_ID=you.testnet                       # your wallet account
export CONTRACT_ID=sentinel-vault-you.testnet
export AGENT_ID=sentinel-agent-you.testnet
export VENDOR_ID=sentinel-vendor-you.testnet
bash scripts/create-accounts.sh                   # vault, agent, vendor via faucet
bash scripts/build.sh
bash scripts/deploy.sh
node scripts/agent-key.mjs                        # prints the add-key command + env lines
cp .env.example apps/web/.env.local               # fill in CONTRACT_ID, AGENT_ACCOUNT_ID, AGENT_PRIVATE_KEY
npm run dev                                       # http://localhost:3000
```

## Try it (judge walkthrough)

Each step is "do X, see Y". Steps 2-6 need the owner wallet; steps 7-10 need the agent signer env vars.

1. Open http://localhost:3000. **See** the landing page explaining the intent diff.
2. Console > Settings > Connect wallet with `OWNER_ID`. **See** "Vault owner" under your account.
3. Settings > Deposit 1 NEAR. **See** a toast with the transaction link and Vault balance 1 NEAR on Overview.
4. Agents > Register `AGENT_ID`. **See** it listed as Active.
5. Capsules > Draft fields from instruction (default text pays `vendor.testnet` up to 3 NEAR). Change the recipient to `VENDOR_ID` and the limits to `0.3`. Review capsule. **See** the may / may-not lists and a commitment marked "Matches the hash computed independently in your browser."
6. Sign and commit capsule. **See** the capsule listed as Active with its commitment.
7. Attack lab > Guided demo > step 1 Authorized payment > Run on-chain. **See** Approved, "funds sent", every check green, and a transaction link. The vendor's balance increases by the amount.
8. Step 2 Prompt injection > Run on-chain. **See** Blocked, "Unauthorized asset", the Asset and Recipient rows flagged in the intent diff, and a transaction link proving the contract recorded the refusal.
9. Steps 3-6 (recipient, amount, replay, operation). **See** Blocked with the matching reason for each.
10. Step 8 Revoked agent: Revoke agent now (wallet), then Run on-chain. **See** Revoked, "Agent revoked".
11. Requests and Security pages. **See** every request with its reason, the intent diff per request, risk events and the contract's audit log.

No agent key? The Attack Lab runs in clearly labelled simulation mode using the same check logic off-chain. Prefer the CLI? `bash scripts/demo-cli.sh` runs the owner setup and six on-chain scenarios from the terminal.

## What is verified

Be precise about this when judging or presenting:

| Item | Status |
| --- | --- |
| Engine tests (units, commitment vector, all 15 checks, every scenario's expected decision, instruction parser, risk) | **Run and passing: 38/38** in the build environment |
| Engine and web code typecheck | Engine: full typecheck passed. Web: typechecked against loose stubs of external packages, not the real package types. Run `npm run typecheck` after install. |
| Contract unit tests and sandbox tests | **Written, not yet run.** The build environment had no Rust toolchain or network. Run `npm run test:contract` and `npm run test:sandbox`. |
| `next build` | **Not yet run** (no network in the build environment). |
| Testnet deployment, transaction hashes | **None yet.** No contract address or hash in this repo is real until you deploy and paste them below. |
| Dependency versions | Chosen from known stable lines (near-sdk 5.x, near-workspaces 0.20, Next 15, wallet-selector 8.x, near-api-js 5.x). Adjust if `npm install` / `cargo build` reports a conflict. |

Deployed contract: `TBD` · Demo transactions: `TBD`

## Limitations

- Native NEAR only. Token transfers, swaps and arbitrary contract calls are refused, not supported.
- One vault per owner deployment.
- Sentinel enforces the capsule you sign. A capsule with the wrong recipient is enforced as written.
- The instruction parser is deterministic and narrow. It drafts; the owner must check every field.
- The demo agent route is rate-limited but unauthenticated; anyone who can reach it can spend the agent account's gas on testnet.
- Request records beyond the newest 500 are pruned from contract state (events remain in transaction logs).

## Hackathon disclosures

- Libraries: near-sdk, near-workspaces, Next.js, React, Tailwind CSS, lucide-react, zod, NEAR Wallet Selector, near-api-js.
- AI assistance: code and documentation were generated with Claude (Anthropic) and reviewed by the author. Listed per rule Q-005.
- Built during the hackathon window (from 2026-10-19). No pre-existing project code.

## Docs

[Architecture](docs/ARCHITECTURE.md) · [Security model](docs/SECURITY_MODEL.md) · [Threat model](docs/THREAT_MODEL.md) · [Attack lab](docs/ATTACK_LAB.md) · [Competitive analysis](docs/COMPETITIVE_ANALYSIS.md) · [Deployment](docs/DEPLOYMENT.md) · [Demo script](docs/DEMO_SCRIPT.md)

License: MIT.
