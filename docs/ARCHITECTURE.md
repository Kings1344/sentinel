# Architecture

## Components

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js console]
    ENG1[engine: preview, parser, commitment, risk]
    W[Wallet Selector: owner wallet]
  end
  subgraph Server["Next.js server route /api/agent"]
    AG[Demo agent: deterministic or optional LLM]
    ENG2[engine: preview evaluation]
    K[Agent function-call key]
  end
  subgraph NEAR["NEAR Testnet"]
    V[(TrustVault contract)]
    R[Recipient account]
  end
  UI --> ENG1
  UI -- owner txs: deposit, capsules, revoke, freeze --> W --> V
  UI -- run scenario --> AG
  AG --> ENG2
  AG -- request_transfer signed by agent --> K --> V
  V -- transfer if all checks pass --> R
  V -- views: overview, capsules, requests, audit --> UI
```

The contract is the only component that can release funds. Everything else either asks it to (owner, agent) or reads it (UI).

## Request lifecycle

```mermaid
sequenceDiagram
  participant O as Owner wallet
  participant A as Agent
  participant V as Vault contract
  participant R as Recipient
  O->>V: create_capsule(terms, expected_commitment) + 1 yocto
  V-->>O: Capsule {id, commitment}
  A->>V: request_transfer {capsule_id, nonce, operation, asset, recipient, amount}
  V->>V: evaluate(): up to 15 checks, first failure decides, nonce consumed
  alt any check fails
    V-->>A: Evaluation {Blocked | Expired | Revoked, reason, checks}
    Note over V: request + audit stored, NEP-297 event, no funds move
  else review threshold exceeded
    V-->>A: Evaluation {RequiresHumanReview}
    Note over V: amount reserved until owner resolve_review
  else all checks pass
    V->>V: reserve amount (vault_balance -= amount)
    V->>R: Promise transfer(amount)
    R-->>V: on_transfer_complete(request_id)
    alt transfer succeeded
      V->>V: spent += amount, status Executed
    else transfer failed
      V->>V: refund to vault_balance, status TransferFailed
    end
    V-->>A: Evaluation {Approved, status}
  end
```

## Contract state

| Field | Purpose |
| --- | --- |
| `owner`, `frozen` | Single owner per deployment; emergency freeze flag |
| `vault_balance` | Deposited NEAR not reserved, spent or withdrawn (internal ledger, independent of storage staking) |
| `total_reserved` | NEAR reserved for settling transfers and held reviews |
| `agents: IterableMap<AccountId, Agent>` | Status (Active/Suspended/Revoked), counters, capsule ids |
| `capsules: LookupMap<u64, Capsule>` | Terms, commitment, spent, reserved, last nonce, status |
| `requests: LookupMap<u64, RequestRecord>` | Every agent request with decision and reason; finalized records older than the newest 500 are pruned |
| `audit: LookupMap<u64, AuditEvent>` | Ring buffer of the last 500 audit events |

## Off-chain parity

`packages/engine/src/verify.ts` mirrors `evaluate()` in the contract: same check names, order and decision mapping, with matching explanation wording. Decisions and reason codes are covered by tests; the exact explanation wording is not. It powers previews and the Attack Lab's simulation mode. The commitment format is pinned by a shared test vector asserted in both `packages/engine/test/commitment.test.ts` and `contracts/sentinel-vault/src/tests.rs`.

## Why not a backend policy check?

A backend that approves transactions only protects agents that choose to ask it. TrustVault's agent never has custody: the funds are in the contract, so the checks cannot be skipped.
