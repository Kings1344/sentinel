# Sentinel

**Your AI can act. Sentinel makes sure it acts on your instructions.**

Sentinel is a NEAR smart-contract vault that holds native NEAR for an owner and releases it to an AI agent only when every field of the agent's request matches an *Intent Capsule* the owner signed: agent, operation, asset, recipient, per-payment and total limits, expiry, and a fresh nonce. Anything else is refused by the contract, recorded on-chain and explained.

Built at NEAR HACKATHON 2026. Track: **AI Security & Defense** (`security`).

**Live demo:** https://sentinel-vaults.vercel.app

**Live on NEAR Testnet:** [`oxchimaobi2026-vault.testnet`](https://testnet.nearblocks.io/address/oxchimaobi2026-vault.testnet)

---

## The problem

An agent that reads web pages, emails or tool output can be steered by text inside them. A hijacked agent rarely tries to drain a wallet. It makes a small, plausible payment to the wrong place, in the wrong asset, or through the wrong operation. A spending limit approves that payment because it is under the limit.

## On-chain proof

Every row below is a real transaction against the deployed vault. The agent (`oxchimaobi2026-agent.testnet`) signed each request with a function-call key that can only call `request_transfer`. The owner's capsule allowed 0.3 NEAR per payment, 0.9 NEAR total, to `oxchimaobi2026-vendor.testnet` only.

| # | Scenario | What the agent tried | Contract decision | Transaction |
| --- | --- | --- | --- | --- |
| 1 | Authorized payment | 0.1 NEAR to the vendor | **Approved**, paid | [dW7C8gHm…](https://testnet.nearblocks.io/txns/dW7C8gHmwbg8dMcgi5StidbxzuKWFhu1kmfo6zPX85o) |
| 2 | Prompt injection | 0.1 NEAR of `TOKENB` to `token-b-sale.testnet` (under the limit) | **Blocked**, AssetMismatch | [3jhcA6rK…](https://testnet.nearblocks.io/txns/3jhcA6rKpRqwdHhqtKjHLkbbx6MHdrCrJMzTFx97jnmg) |
| 3 | Recipient substitution | 0.1 NEAR to `attacker-wallet.testnet` | **Blocked**, RecipientMismatch | [Cds6gGan…](https://testnet.nearblocks.io/txns/Cds6gGanQdxE1Zn2LMvrRfgGGP7nnQt84TyYVhH2hsJn) |
| 4 | Spending manipulation | 0.8 NEAR (limit 0.3) | **Blocked**, AmountExceedsTxLimit | [CGVnMnio…](https://testnet.nearblocks.io/txns/CGVnMnioWcJYNdPNDobStLtXREmHn41Bx3fR8HVAwN5j) |
| 5 | Authorization replay | Reused an accepted nonce | **Blocked**, NonceReplay | [DkppM5va…](https://testnet.nearblocks.io/txns/DkppM5vaGeJzf57ZoBsRPJMb5LFTv2JseTkkHbXUvXwf) |
| 6 | Operation substitution | `function_call` instead of `native_transfer` | **Blocked**, OperationMismatch | [C3tnxoCQ…](https://testnet.nearblocks.io/txns/C3tnxoCQcJyAnEevyNUtRX9Vuvm3v5ppw8k8jDxzpjsK) |
| 7 | Expired authorization | Valid request on a capsule past its 1-minute expiry | **Expired**, CapsuleExpired | [4X2dJE4B…](https://testnet.nearblocks.io/txns/4X2dJE4BRFso5x6UuP4AB6e3QTsGrQxssVAL9BKfda64) |
| 8 | Revoked agent | Valid request after the owner revoked the agent | **Revoked**, AgentRevoked | [CMBb6LDg…](https://testnet.nearblocks.io/txns/CMBb6LDgsATinSD8iKorY3qJDQtacBxkRCih3ZPyy6Nq) |

Blocked requests are *successful transactions* whose return value is the refusal: the contract records violations instead of panicking, so the audit trail survives. Only request #1 moved funds.

Check it yourself without installing anything:

```bash
near contract call-function as-read-only oxchimaobi2026-vault.testnet get_requests json-args '{"limit":8}' network-config testnet now
near contract call-function as-read-only oxchimaobi2026-vault.testnet get_overview json-args '{}' network-config testnet now
```

## How it works

| Layer | Where it runs | Authority |
| --- | --- | --- |
| Sentinel Vault contract (Rust, near-sdk 5) | NEAR Testnet | **Decides.** Holds funds, stores capsules, checks every request, releases or refuses. |
| Security engine (`packages/engine`, TypeScript) | Browser and server | Mirrors the contract's checks for previews, Attack Lab simulation, instruction parsing and risk analysis. Never decides. |
| Web console (Next.js) | Browser + one server route | Owner signs capsules and controls with their wallet; the Attack Lab drives a demo agent. |
| Demo agent | Server route, signs as the agent account | Builds proposals from the owner task plus untrusted content. Vulnerable to injection on purpose. |

Enforced in `contracts/sentinel-vault/src/lib.rs`:

- Only registered agents can call `request_transfer`; unregistered callers are refused before any storage is written.
- 15 deterministic checks on every request. The first failure decides; all results are returned.
- Strict per-capsule nonces (`last_nonce + 1`). Blocked attempts consume their nonce.
- Approved amounts are reserved before the transfer promise and counted as spent only in the callback if the transfer succeeded. Failed transfers are refunded.
- Capsule commitment = SHA-256 of canonical JSON terms. With `expected_commitment`, the contract refuses to create a capsule whose terms differ from what the owner reviewed. The browser recomputes the hash independently.
- **Tightening vs loosening.** Freeze, suspend, revoke agent and revoke capsule work from a limited session key so the owner can react fast. Register, resume, reinstate, create capsule, unfreeze, withdraw and approving a held payment require 1 yoctoNEAR, forcing a full-access wallet confirmation.
- Optional human review: payments above a per-capsule threshold are held, with funds reserved, until the owner approves or rejects on-chain.

No LLM is consulted for any authorization decision.

## Repository layout

```
contracts/sentinel-vault/   Rust contract and unit tests (src/tests.rs)
packages/engine/            TypeScript: types, commitment, verification mirror, demo agent, scenarios, risk, tests
apps/web/                   Next.js 15 console + /api/agent route (demo agent signer)
scripts/                    agent key generator and shell helpers
docs/                       architecture, security model, threat model, competitive analysis, attack lab, demo script, deployment
```

## Try it (judge walkthrough)

### A. Use the live site (nothing to install)

1. Open https://sentinel-vaults.vercel.app and click **Open console**.
2. **Transactions:** the 8 on-chain requests above, each with its reason and an intent diff.
3. **Security:** incident timeline, agent behaviour and the contract's audit log.
4. **Attack lab:** pick a scenario and click **Simulate** to watch every check run, or **Run on-chain** to have the demo agent submit it to the deployed contract.

### A2. Run the console locally against the live vault

1. `npm install`
2. Create `apps/web/.env.local`:
   ```
   NEXT_PUBLIC_NETWORK_ID=testnet
   NEXT_PUBLIC_CONTRACT_ID=oxchimaobi2026-vault.testnet
   NEXT_PUBLIC_RPC_URL=https://test.rpc.fastnear.com
   NEXT_PUBLIC_EXPLORER_URL=https://testnet.nearblocks.io
   ```
3. `npm run dev` and open http://localhost:3000/console.
4. **Requests** page: see the 8 requests above with their reasons. Click one to see the intent diff (owner authorized vs agent proposed).
5. **Security** page: see the risk events and the contract's audit log.
6. **Attack lab → Simulate** on any scenario: see the same checks run off-chain, clearly labelled as simulation.

### B. Run your own vault end to end

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): create accounts, deploy, connect an owner wallet, deposit, register an agent, create a capsule, then use **Attack lab → Run on-chain**. Each run shows the contract's own decision and a transaction link.

## Build and test

Prerequisites: Node.js 20+, Rust (rustup), `cargo-near`, `near` CLI (near-cli-rs).

```bash
npm install
npm test                        # TypeScript engine: 38 tests
npm run test:contract           # Rust contract unit tests: 33 tests (uses the stable toolchain)
npm run build:contract          # contract wasm (toolchain pinned to Rust 1.86 for NEAR compatibility)
```

The contract is pinned to Rust 1.86 in `rust-toolchain.toml` because newer releases emit wasm features the NEAR runtime rejects. Unit tests run natively, so they use `+stable`. `.cargo/config.toml` enables Cargo's MSRV-aware resolver so dependencies stay compatible with 1.86.

## What is verified

| Item | Status |
| --- | --- |
| Engine tests (units, commitment test vector, all 15 checks, every scenario's expected decision, instruction parser, risk) | 38/38 passing |
| Contract unit tests (`cargo +stable test --lib`) | 33/33 passing on Windows |
| Contract build (`cargo near build non-reproducible-wasm --no-abi`) | Built, 286.6 KB wasm |
| Testnet deployment | Live at `oxchimaobi2026-vault.testnet` |
| Production web build (`npm run build`) | Passing: 12 pages, 2 API routes |
| Public deployment | Live at https://sentinel-vaults.vercel.app (Vercel, root directory `apps/web`) |
| Web console against the live contract | Owner wallet (Meteor), deposit, agent registration, capsule creation with commitment check, all 8 Attack Lab scenarios run on-chain (table above) |
| Sandbox end-to-end tests | Not included. The `near-workspaces` sandbox does not run on Windows; the live testnet transactions above cover the same flows. |
| ABI generation | Skipped with `--no-abi`; the contract does not need it to run. |

## Limitations

- Native NEAR only. Token transfers, swaps and arbitrary contract calls are refused, not supported.
- One vault per owner deployment.
- Sentinel enforces the capsule you sign. A capsule with the wrong recipient is enforced as written.
- The instruction parser is deterministic and narrow. It drafts; the owner must check every field.
- The demo agent route is rate-limited but unauthenticated; anyone who can reach it can spend the agent account's gas on testnet.
- Request records beyond the newest 500 are pruned from contract state (events remain in transaction logs).
- Requests, capsules and instructions are public on-chain.

## Hackathon disclosures

- Libraries: near-sdk, Next.js, React, Tailwind CSS, lucide-react, zod, NEAR Wallet Selector, near-api-js.
- AI assistance: code and documentation were generated with Claude (Anthropic), then built, tested, deployed and debugged by the author. Listed per rule Q-005.
- Built during the hackathon window. No pre-existing project code.

## Docs

[Architecture](docs/ARCHITECTURE.md) · [Security model](docs/SECURITY_MODEL.md) · [Threat model](docs/THREAT_MODEL.md) · [Attack lab](docs/ATTACK_LAB.md) · [Competitive analysis](docs/COMPETITIVE_ANALYSIS.md) · [Deployment](docs/DEPLOYMENT.md) · [Demo script](docs/DEMO_SCRIPT.md)

License: MIT.
