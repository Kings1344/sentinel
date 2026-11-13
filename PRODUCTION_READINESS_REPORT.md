# TrustVault: Production Readiness Report

Audit date: 2026-11-11 · Scope: entire repository (`contracts/sentinel-vault`, `packages/engine`, `apps/web`), the deployed testnet contract `oxchimaobi2026-vault.testnet`, and the Vercel deployment `https://trustvault-nearhack.vercel.app`.

## Summary

**Readiness rating: 58 / 100 for real users with real funds. Not production-ready.** (52 at audit time; raised after the fixes below were tested and deployed.)

For its actual purpose, a NEAR Testnet hackathon demo, TrustVault is in good shape (roughly 84/100): the contract enforces every claimed rule, eight on-chain transactions show it refusing attacks, the production build passes, and the site is deployed.

What keeps it from production:

1. The vault account still has a **full-access key**. Whoever holds it can replace the contract and bypass every check (C-1).
2. One **storage-amplification** vulnerability was found, fixed, tested (42/42 contract tests) and **deployed to the live contract** (H-1, upgrade transaction `CwgX1tbicw343uZPxJmnQ56EU6DCYnPwUb6PLNwqUQba`).
3. The **asynchronous failure paths** (refund on failed transfer, restore on failed withdrawal) have never run against a real NEAR runtime; the sandbox tests that cover them can't run on Windows (H-2).
4. There has been **no independent security audit**.

No issue was found that lets an agent move funds outside a signed capsule.

## How evidence was gathered

Each result below is marked with where it came from:

- **[Run here]**: executed by the auditor in this session. No network, no Rust toolchain.
- **[Run by owner]**: executed on the owner's Windows laptop; output seen in screenshots during this session.
- **[Not run]**: not executed; the reason is given. Nothing marked "Not run" is claimed to work.

Independent re-fetching of the transactions from NearBlocks was attempted and **blocked by the explorer's bot protection**, so the on-chain references below have not been re-verified by the auditor. Section 9 has the steps to confirm them.

## 1. Smart contract security

### 1.1 Access control (code review [Run here] + unit tests [Run by owner])

| Entry point | Guard | Result |
| --- | --- | --- |
| `new` | `#[init] #[private]`: only the contract account, once | Pass |
| `deposit` | owner only | Pass (test `non_owner_cannot_deposit`) |
| `withdraw` | owner + 1 yocto; amount ≤ unreserved balance | Pass (`cannot_withdraw_reserved_funds`) |
| `freeze` | owner (tightening, no yocto by design) | Pass (`agent_cannot_revoke_or_freeze`) |
| `unfreeze` | owner + 1 yocto | Pass (`loosening_actions_require_full_access_confirmation`) |
| `register_agent`, `resume_agent`, `reinstate_agent` | owner + 1 yocto | Pass |
| `suspend_agent`, `revoke_agent`, `revoke_capsule` | owner (tightening) | Pass |
| `create_capsule`, `amend_capsule` | owner + 1 yocto + full validation | Pass (`agent_cannot_create_its_own_capsule`) |
| `resolve_review` | owner; approving needs 1 yocto | Pass, plus new test `agent_cannot_resolve_its_own_review` |
| `request_transfer` | registered agent; unregistered callers panic before any write | Pass (`unregistered_agent_is_rejected`) |
| `on_transfer_complete`, `on_withdraw_complete` | `#[private]` callbacks | Pass (code review) |

New regression tests added in this audit (**[Run by owner] all passing**): `agent_cannot_withdraw`, `agent_cannot_reinstate_itself`, `agent_cannot_resolve_its_own_review`.

### 1.2 Capsule validation [Run by owner]

Pass: per-tx above total rejected; past/too-soon expiry rejected; unsupported operation rejected; commitment mismatch rejected; amendment versions and revokes the old capsule. Code review confirms: recipient ≠ vault, recipient ≠ agent, review threshold < per-tx limit, instruction 1–500 bytes, expiry 10 s – 30 days, agent must be active.

### 1.3 Spending limits, expiry, revocation, replay [Run by owner + Run here]

| Test | Contract (Rust) | Engine mirror (TS) |
| --- | --- | --- |
| Amount above per-tx limit blocked | Pass | Pass |
| Exactly at the limit allowed; 1 yocto over blocked | Pass (added in audit) | Pass |
| Cumulative limit counts spent + reserved | Pass | Pass, including the exact boundary |
| Capsule exhausted after reaching total | Pass | n/a |
| Expired capsule; request at the exact expiry instant | Pass (boundary test added in audit) | Pass |
| Revoked capsule | Pass | Pass |
| Revoked agent; capsules stay revoked after reinstatement | Pass | Pass |
| Suspended agent blocked until resumed | Pass | Pass |
| Replayed nonce; blocked attempt consumes its nonce; out-of-order nonce | Pass | Pass, including nonce 0 and huge nonces |
| Another agent's capsule; foreign agent can't burn nonces | Pass | Pass |
| Frozen vault blocks agents; owner can still withdraw | Pass | Pass |
| Human review hold, owner reject (refund), owner approve | Pass | Pass |

### 1.4 Unauthorized recipients and assets [Run here + Run by owner]

Pass. Wrong-case, whitespace-padded, zero-width-space, Cyrillic look-alike, suffix-extended and 750-character recipients are all rejected by exact byte comparison (`adversarial.test.ts`; Rust `lookalike_recipients_are_blocked`, both passing). Operation and asset variants (`Native_Transfer`, `near`, `wNEAR`, empty strings) are rejected.

### 1.5 Reentrancy and asynchronous transfers (code review)

- **Reentrancy:** not applicable in the classic sense. NEAR cross-contract calls are asynchronous, and all state (reservation, nonce, request record) is committed before the transfer promise is created. Pass.
- **Double settlement:** `finalize_transfer` only acts on `PendingTransfer` and is idempotent. Pass (`finalize_twice_does_not_double_count`).
- **Failed transfer:** the amount is refunded to the ledger, not counted as spent, and the request is marked `TransferFailed`. Pass in unit tests that call `finalize_transfer(false)` directly; **not exercised with a real failing promise** (H-2).
- **Callback gas:** 15 Tgas raised to 25 Tgas in this audit (M-2). Not measured on-chain.
- **Integer safety:** `overflow-checks = true`, checked/saturating arithmetic in the ledger and callbacks. Pass.

### 1.6 Vulnerabilities found

**C-1 · CRITICAL (production) · Vault account holds a full-access key. Unresolved.**
`oxchimaobi2026-vault.testnet` was created with a full-access key saved in the owner's local keychain. Anyone with that key can deploy different code or move the account's NEAR directly, bypassing every TrustVault check. Agents cannot exploit this, but the README's claim that "only the contract's checks can release funds" depends on this key being kept safe. Fix for production: after the final deployment, delete the vault account's full-access keys (irreversible: no further upgrades), or move control to a multisig or DAO with an upgrade timelock. Not done here, because it is irreversible and needs your decision.

**H-1 · HIGH · Storage amplification by a compromised agent. Fixed and deployed.**
`request_transfer` stored the agent-supplied `recipient`, `operation`, `asset` and `memo` verbatim, three times per request: in the record, in the explanation and in the audit event. NEAR pays storage from the contract account's balance, which is the same balance that holds vault funds. A compromised agent, which is exactly TrustVault's threat model, could pad requests to lock vault NEAR as storage stake, and owner withdrawals would then fail with `LackBalanceForState`. Fix: stored and logged copies are now clipped (fields 64 bytes, memo 256, explanation 600, check details 300). Evaluation still runs on the original values, and transfers always use the capsule's recipient, so clipping cannot turn a mismatch into a match (`clipping_never_turns_a_mismatch_into_a_match`). Regression tests: `oversized_agent_strings_are_clipped_before_storage`, `clip_respects_utf8_boundaries`. **[Run by owner] 42/42 contract tests passed; contract upgraded in place with `without-init-call` in transaction `CwgX1tbicw343uZPxJmnQ56EU6DCYnPwUb6PLNwqUQba`. After the upgrade, `get_overview` returned the same owner and all prior state (10 requests, 3 capsules, 20 audit events).**

**M-1 · MEDIUM · Storage stake is not reconciled with the vault ledger. Unresolved.**
`vault_balance` is an internal ledger; storage stake comes out of the same account balance. If storage grows faster than the surplus, transfers and withdrawals fail. They are refunded correctly, but funds stay stuck until storage is freed. Mitigation: keep a surplus (at least 3 NEAR) above `vault_balance` on the account. **[Run by owner] after the upgrade: contract balance ≈ 10.89 NEAR, vault ledger 0.89 NEAR, so the surplus is ≈ 10 NEAR. OK for now.** Proper fix: include storage cost in the liquidity check.

**M-2 · MEDIUM · No recovery path if a settlement callback fails. Mitigated.**
If `on_transfer_complete` ran out of gas, the request would stay `PendingTransfer` and the amount reserved forever. Callback gas was raised from 15 to 25 Tgas (deployed in the H-1 upgrade). A proper fix would be an owner-only reconciliation method; not added, to avoid untested state-changing code.

**L-1 · LOW · Agent `approved_count` also counts approvals whose transfer later failed. Unresolved** (cosmetic metric).

## 2. NEAR blockchain integration

| Operation | Evidence | Status |
| --- | --- | --- |
| Contract built to wasm (286.6 KB) | `cargo near build … --no-abi` output [Run by owner] | Verified |
| Deployed and initialized; `get_overview` shows owner `oxchimaobi2026-owner.testnet`, vault balance 0 | CLI output [Run by owner] | Verified |
| Owner deposit (1 NEAR), agent registration, capsule creation with commitment check | Console UI after Meteor signing [Run by owner] | Verified via contract state shown in UI |
| 8 agent requests evaluated on-chain | Requests page read from `get_requests` [Run by owner]; hashes below | Verified from contract state; explorer re-check by auditor blocked |
| Failed transaction handling in UI | Code review; this audit fixed wallets that return a failed outcome being shown as "confirmed" (L-4) | Fixed, not yet re-tested |
| Refund on failed transfer / failed withdrawal | Unit tests only | **Not verified on-chain** (H-2) |

### Transaction references

The agent `oxchimaobi2026-agent.testnet` signed each request with a key that can only call `request_transfer`.

| # | Scenario | Contract decision | Transaction |
| --- | --- | --- | --- |
| 1 | Authorized payment, 0.1 NEAR to vendor | Approved, paid | `dW7C8gHmwbg8dMcgi5StidbxzuKWFhu1kmfo6zPX85o` |
| 2 | Prompt injection (asset `TOKENB`, recipient `token-b-sale.testnet`) | Blocked, AssetMismatch | `3jhcA6rKpRqwdHhqtKjHLkbbx6MHdrCrJMzTFx97jnmg` |
| 3 | Recipient substitution (`attacker-wallet.testnet`) | Blocked, RecipientMismatch | `Cds6gGanQdxE1Zn2LMvrRfgGGP7nnQt84TyYVhH2hsJn` |
| 4 | Spending manipulation (0.8 NEAR, limit 0.3) | Blocked, AmountExceedsTxLimit | `CGVnMnioWcJYNdPNDobStLtXREmHn41Bx3fR8HVAwN5j` |
| 5 | Replay | Blocked, NonceReplay | `DkppM5vaGeJzf57ZoBsRPJMb5LFTv2JseTkkHbXUvXwf` |
| 6 | Operation substitution | Blocked, OperationMismatch | `C3tnxoCQcJyAnEevyNUtRX9Vuvm3v5ppw8k8jDxzpjsK` |
| 7 | Expired capsule (#2, 1-minute expiry) | Expired, CapsuleExpired | `4X2dJE4BRFso5x6UuP4AB6e3QTsGrQxssVAL9BKfda64` |
| 8 | Revoked agent | Revoked, AgentRevoked | `CMBb6LDgsATinSD8iKorY3qJDQtacBxkRCih3ZPyy6Nq` |

Explorer: `https://testnet.nearblocks.io/txns/<hash>`. Hashes come from the app's browser record, matched to request numbers. Contract upgrade (H-1 fix): `CwgX1tbicw343uZPxJmnQ56EU6DCYnPwUb6PLNwqUQba`. The decisions come from the contract's `get_requests` view.

## 3. Security verification engine

- **[Run here] and [Run by owner]** 53/53 TypeScript tests pass: the original 38, plus 15 adversarial tests added in this audit (look-alike recipients, case variants, boundary values, multi-byte memo length, check ordering, multi-account injection, commitment binding to vault and owner, hostile draft inputs).
- All 15 checks have a pass test and at least one failing test. The order and decision mapping match the contract; the Rust and TypeScript commitments match a shared test vector.
- **Can the frontend or API bypass a decision?** No. The engine is preview-only. The `/api/agent` route signs with the agent's key, so whatever it sends is still evaluated by the contract. Owner-only methods check the caller on-chain. Evidence: request #2 was built by the demo agent and refused on-chain.
- **Agent manipulation:** the deterministic agent is vulnerable by design (later instructions override earlier ones). Tests confirm that every attack scenario is still refused by the checks. An injection that reproduces exactly the authorized fields is approved, because it is exactly what the owner signed. That is the documented boundary of the model.

## 4. Frontend and backend

| Test | Result |
| --- | --- |
| Type check of all web code [Run here, against library stubs] | Pass |
| Real type check and production build (`next build`) [Run by owner] | Pass: 12 pages, 2 API routes |
| Every `<button>` has a handler or submits a form; every internal link points to an existing route [Run here, static scan] | Pass |
| Secret scan of tracked files (private keys, API keys) [Run here] | Pass: none found |
| Server/client boundary: agent and LLM keys only in `lib/server/*` with `server-only`; browser gets 4 `NEXT_PUBLIC_*` values | Pass |
| `/api/agent` input validation (zod: scenario enum, positive integer capsule, text length limits) | Pass (code review) |
| API refuses to sign for a capsule bound to another agent | Pass (code review) |
| Wallet connect, disconnect, owner detection [Run by owner, localhost] | Pass |
| Loading skeletons, empty states, error banner keeping last good data | Pass (code review + screenshots) |
| Manual click-through of every page on the **deployed** site | **Not run** (section 9) |
| Mobile responsiveness on a real device | **Not run**; layouts reviewed in code only |
| Automated UI tests | **None exist** (M-7) |

Fixes made in this audit:
- **L-4 · LOW · Fixed.** A failed transaction outcome returned by a wallet (rather than thrown) was reported as "confirmed". It is now treated as a failure, showing the contract's panic message.
- **L-5 · LOW · Fixed.** RPC calls had no timeout (now 10 s). Polls could overlap on a slow RPC (now one at a time). Background tabs kept polling (now paused until visible).
- **M-3 · MEDIUM · Partially mitigated.** The `/api/agent` rate limit was lowered from 20 to 10 requests per minute per IP. It is still in-memory per serverless instance, so it is not a real global limit.

## 5. Attack Lab

| Scenario | Off-chain (engine tests) | On-chain (contract) |
| --- | --- | --- |
| Prompt injection | Blocked, AssetMismatch | Blocked: request #2 |
| Recipient substitution | Blocked | Blocked: #3 |
| Spending manipulation | Blocked | Blocked: #4 |
| Authorization replay | Blocked | Blocked: #5 |
| Operation substitution | Blocked | Blocked: #6 |
| Expired authorization | Expired | Expired: #7 |
| Revoked agent | Revoked | Revoked: #8 |

- **Simulated vs on-chain labelling:** results carry an "On-chain result" or "Simulation, not sent to the contract" badge. On-chain checks are taken from the contract's NEP-297 event, not from the engine. Pass (code review + screenshots).
- **Genuine rejection:** on-chain refusals are successful transactions whose return value is the refusal (by design, so the audit record survives). Request #1 is the only one that moved funds; the Overview reads a vault balance of 0.9 NEAR after a 1 NEAR deposit, which is consistent.

## 6. Performance and reliability

| Item | Finding |
| --- | --- |
| Landing page first load | 107 KB JS. Good. |
| Console pages first load | About 665 KB JS (wallet selector + near-api-js in the browser). **M-5 · MEDIUM**: slow on mobile data. Unresolved. |
| Polling | 5 view calls every 8 s per open tab. Now paused in background tabs, never overlapping (fixed). |
| RPC dependency | Single free provider (FastNEAR); no fallback. **M-6 · MEDIUM.** Unresolved. |
| Database | None. State is on-chain; preferences, notifications and transaction links are in browser storage. No database failure mode. |
| Network failure | The error banner keeps the last good data; the API returns readable errors. Pass. |
| Transaction failure and recovery | Wallet rejection or a contract panic shows an error toast; agent submission failure is returned as `failed: true` with the reason. Pass (code review). |
| Production build stability | `next build` passed after removing the build-time Google Fonts download (fonts are now bundled via `geist`). |

## 7. Deployment

| Item | Finding |
| --- | --- |
| Vercel project | Root directory `apps/web`, Next.js preset; deployed to production in 59 s [Run by owner, screenshot]. |
| API routes | Run as serverless functions on the same origin: no CORS needed, no separate API URL. `maxDuration` 60 s, Node runtime. |
| Environment variables | 4 public plus `AGENT_ACCOUNT_ID` and `AGENT_PRIVATE_KEY` (server only). Whether they are set correctly on Vercel is **not verified by the auditor**: check that the live console shows your 8 requests. |
| Security headers | nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy. No CSP (**L-2 · LOW**). |
| Public agent route (**M-3**) | Anyone can press "Run on-chain". This spends the agent key's 1 NEAR gas allowance and can only pay what the active capsule allows, to its recipient. **L-8 · LOW**: when the allowance runs out, on-chain runs stop until you add a new key. |
| Contract configuration | Owner `oxchimaobi2026-owner.testnet`. The agent was revoked during testing; on-chain runs need a reinstated agent and an active capsule. |
| Repository README | **L-10 · LOW**: the copy on GitHub was the earliest version. Fixed: replaced with the final README (live link, proof table). |
| Sandbox tests | Removed locally because `near-workspaces` doesn't run on Windows. End-to-end async coverage now relies on testnet only (**H-2**). |
| Key custody | **M-4 · MEDIUM**: single owner; owner key stored in plaintext in `~/.near-credentials` and in the Meteor extension. Acceptable on testnet, not for real funds. |

## 8. Issue register

| ID | Severity | Issue | Status |
| --- | --- | --- | --- |
| C-1 | CRITICAL (production) | Vault account full-access key can bypass the contract | Unresolved (needs your decision) |
| H-1 | HIGH | Storage amplification by a compromised agent | **Fixed and deployed** (`CwgX1tbi…`) |
| H-2 | HIGH | Async failure paths (failed transfer refund, failed withdraw restore) never run on a real runtime; no external audit | Unresolved |
| M-1 | MEDIUM | Storage stake not reconciled with vault ledger | Unresolved, mitigation documented |
| M-2 | MEDIUM | No recovery if a settlement callback fails | Mitigated and deployed (callback gas 25 Tgas) |
| M-3 | MEDIUM | Public agent route; per-instance rate limit | Partially mitigated |
| M-4 | MEDIUM | Single owner key, plaintext local storage | Unresolved (testnet acceptable) |
| M-5 | MEDIUM | 665 KB first load on console pages | Unresolved |
| M-6 | MEDIUM | Single RPC provider | Unresolved |
| M-7 | MEDIUM | No automated UI tests; no real-device mobile testing | Unresolved |
| L-1 | LOW | `approved_count` includes failed transfers | Unresolved |
| L-2 | LOW | No Content-Security-Policy | Unresolved |
| L-3 | LOW | Redirect wallets (MyNearWallet) return no transaction link | Unresolved |
| L-4 | LOW | Failed wallet outcome shown as confirmed | Fixed |
| L-5 | LOW | No RPC timeout; overlapping and background polling | Fixed |
| L-6 | LOW | ABI not generated (`--no-abi`) | Unresolved (not needed to run) |
| L-7 | LOW | Request records older than the newest 500 are pruned | By design, documented |
| L-8 | LOW | Agent gas allowance will run out on a public site | Monitor |
| L-9 | LOW | Engine/contract explanation text parity not tested (decisions and reasons are) | Unresolved |
| L-10 | LOW | Outdated README on GitHub | Fixed |

## 9. Actions after the audit

Done (verified by the owner during this audit):

1. Installed the audit fixes; `npm test` 53/53 and `cargo +stable test --lib` 42/42 passing.
2. Rebuilt the contract (`cargo near build non-reproducible-wasm --no-abi`) and upgraded the live contract in place with `without-init-call` (transaction `CwgX1tbicw343uZPxJmnQ56EU6DCYnPwUb6PLNwqUQba`). `get_overview` afterwards showed the same owner and all prior state.
3. `npm run build` passing; pushed to GitHub, so Vercel redeployed the web fixes.
4. Replaced the outdated README with the version containing the live link and proof table (L-10).
5. Added a welcome screen and a read-only banner so visitors don't mistake the demo vault's public records for their own.

Still open:

6. **Verify the transactions yourself:** open each explorer link in section 2 and check that the receiver is the vault and the method is `request_transfer`.
7. **Keep the demo usable for judges:** keep the agent active with a 30-day capsule and small limits, and top up the agent key's allowance if on-chain runs start failing (L-8).
8. **Keep a storage surplus:** at least 3 NEAR more on the vault account than `vault_balance` (M-1).
9. **Before real funds (after the hackathon):** remove or govern the vault's full-access key (C-1); run end-to-end tests on a real NEAR runtime, e.g. `near-workspaces` on Linux or macOS (H-2); get an external audit.

## 10. Rating

**58 / 100 for production with real users and real funds.**

| Area | Score | Why |
| --- | --- | --- |
| Contract logic and access control | 20/25 | Correct and well tested; the storage DoS fix is deployed. Async failure paths are not proven on a real runtime. |
| Key management and governance | 3/15 | Full-access key on the vault; single owner key in plaintext. |
| Testing evidence | 14/20 | 53 engine tests and 42 contract tests passing, real on-chain refusals. No end-to-end runtime tests, no UI tests, no external audit. |
| Frontend/API security | 9/15 | No secrets exposed, server-side key isolation, contract-enforced decisions. Public signing route, no CSP. |
| Reliability and performance | 6/10 | Graceful RPC failure handling. Heavy bundle, single RPC. |
| Deployment and operations | 6/15 | Deployed, building, contract upgraded. README update and web redeploy pending; no monitoring or alerting. |

TrustVault does what it claims on testnet, and the core idea is backed by real on-chain evidence. It should not hold real funds until C-1 and H-2 are closed and an independent audit has been done.
