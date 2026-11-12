# Security model

## Roles

| Role | Can | Cannot |
| --- | --- | --- |
| Owner (`owner` set at init) | Deposit, withdraw unreserved funds, register/suspend/resume/revoke/reinstate agents, create/amend/revoke capsules, freeze/unfreeze, approve/reject held payments | Bypass the checks for an agent request |
| Agent (registered account) | Call `request_transfer` | Create or change capsules, approve its own requests, withdraw, call owner methods, act after revocation |
| Anyone else | Read views | Call `request_transfer` (refused before storage is written) or any owner method |
| Contract itself | Run its callbacks (`#[private]`) | — |

## Intent Capsule

Fields: id, version, supersedes, agent, operation (`native_transfer` only), asset (`NEAR` only), recipient, max per transaction, max total, optional review threshold, instruction text, created/expires timestamps, status (Active, Revoked, Exhausted; Expired is computed from time), spent, reserved, last nonce, commitment.

### Commitment

`commitment = hex(sha256(canonical_json))` where `canonical_json` is compact JSON with this exact key order:

```
domain ("sentinel-capsule-v1"), vault, owner, agent_id, operation, asset, recipient,
max_per_tx, max_total, review_threshold, expires_at_ms, instruction, version, supersedes
```

u64/u128 values are decimal strings; `version` and `supersedes` are numbers; absent values are `null`. Binding the vault and owner prevents a commitment from being replayed into another vault.

Flow: the browser computes the commitment locally and asks the contract's `preview_commitment` view for its value. The owner can sign only if both agree, and the signed `create_capsule` includes `expected_commitment`, so the contract refuses terms that differ from what the owner reviewed.

What the commitment does **not** do: the contract stores the full terms and checks requests against those stored terms. The hash is an integrity and review aid (and lets an off-chain copy of the terms be verified), not an extra cryptographic gate on each request.

## Verification checks (in order)

| # | Check | Failure decision / reason |
| --- | --- | --- |
| 1 | `vault_active` | Blocked / VaultFrozen |
| 2 | `agent_active` | Revoked / AgentRevoked, Blocked / AgentSuspended |
| 3 | `capsule_exists` | Blocked / CapsuleNotFound (stops evaluation) |
| 4 | `capsule_bound_to_agent` | Blocked / CapsuleAgentMismatch (stops evaluation) |
| 5 | `capsule_active` | Revoked / CapsuleRevoked, Blocked / CapsuleExhausted |
| 6 | `capsule_not_expired` | Expired / CapsuleExpired |
| 7 | `nonce_sequence` | Blocked / NonceReplay or NonceOutOfOrder |
| 8 | `operation_matches` | Blocked / OperationMismatch |
| 9 | `asset_matches` | Blocked / AssetMismatch |
| 10 | `recipient_matches` | Blocked / RecipientMismatch |
| 11 | `amount_within_tx_limit` | Blocked / InvalidAmount or AmountExceedsTxLimit |
| 12 | `cumulative_within_limit` (spent + reserved + amount, overflow-checked) | Blocked / CumulativeLimitExceeded |
| 13 | `memo_valid` (≤ 256 bytes) | Blocked / InvalidMemo |
| 14 | `vault_liquidity` | Blocked / InsufficientVaultBalance |
| 15 | `review_threshold` (if set) | RequiresHumanReview / ReviewThresholdExceeded |

All checks are reported; the first failure decides. No LLM output is consulted.

## Key guarantees and how they are enforced

- **No agent custody.** Funds are in the contract. The agent's key (ideally a function-call key limited to `request_transfer`) cannot move them.
- **No silent permission expansion.** Only `create_capsule`/`amend_capsule` set terms; both require the owner and 1 yoctoNEAR. Amendments create a new version and revoke the old one.
- **Replay protection.** Strict per-capsule nonce sequence; blocked attempts consume their nonce; foreign agents cannot advance another agent's nonce.
- **Bounded storage from agents.** Agent-supplied strings are clipped before they are stored or logged (fields 64 bytes, memo 256, explanation 600, check details 300). Storage is paid from the same account balance that holds vault funds, so this stops a compromised agent from locking funds as storage stake. Evaluation still runs on the original values.
- **Correct async accounting.** Reserve before the promise; settle in `on_transfer_complete`; `finalize_transfer` is idempotent (only acts on `PendingTransfer`); failed transfers are refunded and counted as failed, never spent. The settlement callback gets 25 Tgas.
- **Overflow safety.** `overflow-checks = true` in release; checked additions for cumulative limits; saturating arithmetic in callbacks so they cannot panic.
- **Fast containment.** Freeze, suspend, revoke work without the 1-yocto confirmation. Revoking an agent revokes all its capsules permanently; reinstating does not restore them.
- **Emergency exit.** The owner can withdraw unreserved funds while frozen.

## Not protected

- A capsule that authorizes the wrong thing. The contract enforces what the owner signed.
- Compromise of the owner's full-access key.
- Payments within a capsule's terms that the owner later regrets (use small limits, short expiries, review thresholds).
- Recipient-side behaviour after a correct payment.
- Privacy: requests, capsules and instructions are public on-chain.
