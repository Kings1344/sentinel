# TrustVault

**Your AI can act. TrustVault makes sure it acts on your instructions.**

TrustVault is a NEAR smart-contract vault that holds native NEAR for an owner and releases it to an AI agent only when every field of the agent's request matches an *Intent Capsule* the owner signed: agent, operation, asset, recipient, per-payment and total limits, expiry, and a fresh nonce. Anything else is refused by the contract, recorded on-chain and explained.

Built at NEAR HACKATHON 2026. Track: **AI Security & Defense** (`security`).

**Live demo:** https://trustvault-nearhack.vercel.app

**Live contract on NEAR Testnet:** [`oxchimaobi2026-vault.testnet`](https://testnet.nearblocks.io/address/oxchimaobi2026-vault.testnet)

---

## The problem

An agent that reads web pages, emails or tool output can be steered by text inside them. A hijacked agent rarely tries to drain a wallet. It makes a small, plausible payment to the wrong place, in the wrong asset, or through the wrong operation. A spending limit approves that payment because it is under the limit.

## On-chain proof

The first eight agent requests sent to the deployed vault, one per Attack Lab scenario. The agent `oxchimaobi2026-agent.testnet` signed each request with a function-call key that can only call `request_transfer` on the vault. Capsule #1 allowed 0.3 NEAR per payment and 0.9 NEAR in total, to `oxchimaobi2026-vendor.testnet` only.

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

Blocked requests are *successful transactions* whose return value is the refusal: the contract records violations instead of panicking, so the audit trail survives. Of these eight, only #1 moved funds. The vault has received more requests since (for example from the live Attack Lab); `get_requests` returns all of them.

Contract upgrade that deployed the storage-clipping security fix (found in our own audit, see [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md)): [CwgX1tbi…](https://testnet.nearblocks.io/txns/CwgX1tbicw343uZPxJmnQ56EU6DCYnPwUb6PLNwqUQba). It replaced the code with `without-init-call`, so all prior state was kept.

Check the live state yourself (requires [near-cli-rs](https://github.com/near/near-cli-rs)):

```bash
near contract call-function as-read-only oxchimaobi2026-vault.testnet get_overview json-args '{}' network-config testnet now
near contract call-function as-read-only oxchimaobi2026-vault.testnet get_requests json-args '{"limit":20}' network-config testnet now
```

## How it works

| Layer | Where it runs | Authority |
| --- | --- | --- |
| TrustVault contract (Rust, near-sdk 5) | NEAR Testnet | **Decides.** Holds funds, stores capsules, checks every request, releases or refuses. |
| Security engine (`packages/engine`, TypeScript) | Browser and server | Mirrors the contract's checks for previews, Attack Lab simulation, instruction parsing and risk analysis. Never decides. |
| Web console (Next.js 15) | Browser + two API routes on Vercel | Owner signs capsules and controls with their wallet; the Attack Lab drives a demo agent. |
| Demo agent | `/api/agent` route, signs as the agent account | Builds proposals from the owner task plus untrusted content. Deterministic and vulnerable to injection on purpose. An optional LLM mode exists (`ANTHROPIC_API_KEY`) but is not used in the deployment and is untested. |

Enforced in `contracts/sentinel-vault/src/lib.rs`:

- Only registered agents can call `request_transfer`; unregistered callers are refused before any storage is written.
- Up to 15 deterministic checks per request (the review-threshold check runs only when a capsule sets a threshold; evaluation stops early if the capsule is missing or belongs to another agent). The first failure decides; every evaluated check is returned.
- Strict per-capsule nonces (`last_nonce + 1`). Blocked attempts consume their nonce.
- Approved amounts are reserved before the transfer promise and counted as spent only in the callback if the transfer succeeded. Failed transfers are refunded to the vault ledger.
- Agent-supplied strings are clipped before they are stored or logged (fields 64 bytes, memo 256, explanation 600), so a compromised agent cannot inflate contract storage. Evaluation runs on the original values.
- Capsule commitment = SHA-256 of canonical JSON terms. With `expected_commitment`, the contract refuses to create a capsule whose terms differ from what the owner reviewed. The browser recomputes the hash independently; the same test vector is asserted in Rust and TypeScript.
- **Tightening vs loosening.** `freeze`, `suspend_agent`, `revoke_agent` and `revoke_capsule` need no attached deposit, so a limited function-call key can call them. `register_agent`, `resume_agent`, `reinstate_agent`, `create_capsule`, `amend_capsule`, `unfreeze`, `withdraw` and approving a held payment require exactly 1 yoctoNEAR, which forces a full-access wallet confirmation.
- Optional human review: payments above a per-capsule threshold are held, with funds reserved, until the owner approves or rejects on-chain.

No LLM is consulted for any authorization decision.

### Public visitors

The console opens on a welcome screen. A visitor either connects a NEAR wallet or chooses **View the live demo vault**. Anyone who is not the vault owner sees a banner explaining that they are viewing this vault's public on-chain records read-only; owner-only controls are disabled for them and refused by the contract anyway. This deployment is one vault (one contract) with one owner; per-user vaults are future work.

## Claims and where to verify them

| Claim | Evidence |
| --- | --- |
| The contract refuses mismatched recipient, asset, operation, amount, replay, expiry and revocation | `contracts/sentinel-vault/src/tests.rs` (42 tests) and the 8 transactions above |
| Off-chain previews use the same rules as the contract | `packages/engine/src/verify.ts` mirrors `evaluate()` in `lib.rs`; `packages/engine/test/*.test.ts` (53 tests) |
| Capsule fingerprints match between browser and contract | `commitment_matches_shared_vector` (Rust) and `commitment.test.ts` (TypeScript) assert the same hash |
| The agent key can't call owner methods | Owner checks in `lib.rs` (`assert_owner`); tests `agent_cannot_*`; the deployed agent key is a function-call key limited to `request_transfer` |
| Secrets stay on the server | `apps/web/lib/server/*` import `server-only`; only four `NEXT_PUBLIC_*` values reach the browser |
| Simulated results are labelled | Attack Lab shows "On-chain result" or "Simulation, not sent to the contract"; on-chain checks are read from the contract's event log |

## Repository layout

```
contracts/sentinel-vault/   Rust contract (src/lib.rs) and unit tests (src/tests.rs)
packages/engine/            TypeScript: types, commitment, verification mirror, demo agent, scenarios, risk, tests
apps/web/                   Next.js 15 console + /api/agent and /api/agent/info routes
scripts/                    bash helpers for macOS/Linux, agent key generator
docs/                       architecture, security model, threat model, competitive analysis, attack lab, demo script, deployment
PRODUCTION_READINESS_REPORT.md   our own audit: tests run, issues found and fixed, open risks
```

## Try it

### A. Use the live site (nothing to install)

1. Open https://trustvault-nearhack.vercel.app/console and click **View the live demo vault**.
2. **Transactions:** every request the vault has received, with its reason. Open one to see the intent diff (what the owner authorized vs what the agent asked for).
3. **Security:** incident timeline, agent behaviour and the contract's audit log.
4. **Attack lab:** pick a scenario and click **Simulate** to watch every check run off-chain. **Run on-chain** submits the scenario to the deployed contract as the demo agent; it works while the demo agent is active and has an active capsule.

### B. Run the console locally against the live vault

1. `npm install`
2. Create `apps/web/.env.local`:
   ```
   NEXT_PUBLIC_NETWORK_ID=testnet
   NEXT_PUBLIC_CONTRACT_ID=oxchimaobi2026-vault.testnet
   NEXT_PUBLIC_RPC_URL=https://test.rpc.fastnear.com
   NEXT_PUBLIC_EXPLORER_URL=https://testnet.nearblocks.io
   ```
3. `npm run dev` and open http://localhost:3000/console. Without `AGENT_ACCOUNT_ID` and `AGENT_PRIVATE_KEY`, the Attack Lab runs in clearly labelled simulation mode.

### C. Deploy your own vault

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). It includes the exact Windows PowerShell commands used for the live deployment.

## Build and test

Prerequisites: Node.js 20+, Rust via rustup (stable plus 1.86.0 with the `wasm32-unknown-unknown` target), `cargo-near`, `near` CLI (near-cli-rs).

```bash
npm install
npm test                        # TypeScript engine: 53 tests
npm run test:contract           # Rust contract unit tests: 42 tests (runs `cargo +stable test --lib`)
npm run build                   # Next.js production build
npm run build:contract          # contract wasm: `cargo near build non-reproducible-wasm --no-abi`
```

`rust-toolchain.toml` pins Rust 1.86.0, the toolchain used to build the deployed wasm. Unit tests run natively, so they use `+stable`. `.cargo/config.toml` enables Cargo's MSRV-aware resolver so dependencies stay compatible with 1.86. The ABI step is skipped (`--no-abi`); the contract does not need an ABI file to run.

## What is verified

| Item | Status |
| --- | --- |
| Engine tests (units, commitment test vector, all 15 checks, every scenario, instruction parser, risk, adversarial inputs) | 53/53 passing |
| Contract unit tests (`cargo +stable test --lib`) | 42/42 passing |
| Contract build (`cargo near build non-reproducible-wasm --no-abi`) | Builds (≈287 KB wasm) |
| Testnet deployment | Live at `oxchimaobi2026-vault.testnet`, upgraded with the audit fix |
| Production web build (`npm run build`) | Passing: 12 pages, 2 API routes |
| Public deployment | Live at https://trustvault-nearhack.vercel.app (Vercel, root directory `apps/web`) |
| Web console against the live contract | Owner wallet (Meteor), deposit, agent registration, capsule creation with commitment check, all 8 Attack Lab scenarios run on-chain (table above) |
| End-to-end sandbox tests (`near-workspaces`) | Not included: the sandbox does not run on Windows, where this project was built. The live testnet transactions cover the same flows. |
| Independent security audit | Not done. Our own audit is in PRODUCTION_READINESS_REPORT.md. |

## Limitations

- Native NEAR only. Token transfers, swaps and arbitrary contract calls are refused, not supported.
- One vault per contract deployment, with one owner. Visitors see the demo vault read-only.
- TrustVault enforces the capsule you sign. A capsule with the wrong recipient is enforced as written.
- The instruction parser is deterministic and narrow. It drafts; the owner must check every field.
- The demo agent route is rate-limited per IP but unauthenticated; anyone can spend the agent key's gas allowance, and only on payments the active capsule allows.
- Request records beyond the newest 500 are pruned from contract state (events remain in transaction logs).
- The vault account still has a full-access key held by the deployer, which could replace the contract. Acceptable on testnet; it must be removed or put under multisig before real funds (see the readiness report, C-1).
- Requests, capsules and instructions are public on-chain.

## Hackathon disclosures

- Libraries: near-sdk, Next.js, React, Tailwind CSS, Geist (font, via the `geist` package), lucide-react, zod, server-only, NEAR Wallet Selector, near-api-js; tsx for tests.
- AI assistance: code and documentation were generated with Claude (Anthropic), then built, tested, deployed and debugged by the author. Listed per rule Q-005.
- Built during the hackathon window.

## Docs

[Architecture](docs/ARCHITECTURE.md) · [Security model](docs/SECURITY_MODEL.md) · [Threat model](docs/THREAT_MODEL.md) · [Attack lab](docs/ATTACK_LAB.md) · [Competitive analysis](docs/COMPETITIVE_ANALYSIS.md) · [Deployment](docs/DEPLOYMENT.md) · [Demo script](docs/DEMO_SCRIPT.md) · [Readiness report](PRODUCTION_READINESS_REPORT.md)

License: MIT.
