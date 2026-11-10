# Competitive analysis

Research done on 2026-11-09. Short and honest by design: a feature is listed as "documented" only where a public source says so, and nothing here claims Sentinel's ideas are new. Re-check before submitting; projects change during a hackathon.

## What was found

**OutLayer (NEAR ecosystem partner, agent custody).** Its documentation describes custody wallets for AI agents where key derivation, transaction signing and policy evaluation happen inside a TEE. The owner's policy is stored encrypted on NEAR and decrypted and enforced inside the enclave on every transaction; the agent cannot bypass or change it. The custody API supports NEAR transfers, token swaps, contract calls and cross-chain withdrawals through NEAR Intents. NEAR's own docs note it is a third-party platform whose attestation and custody model should be evaluated before production use. Sources: outlayer.fastnear.com/docs/agent-custody, docs.near.org/primitives/off-chain-compute/outlayer.

**AgentLeash (EVM, not NEAR).** A hackathon project giving agents granular, time-limited spending permissions via ERC-7715 through MetaMask Flask, testnet only. Source: github.com/edwardtay/agent-leash.

**PolicyLayer / LetAgentPay (off-chain middleware).** Gateways that enforce budgets, categories, approvals and rate limits on agent tool calls or payments before they reach the service, including NEAR MCP tools. Enforcement is in the gateway, not on-chain.

**Veto, Semilla1 Guard, Allowance, LeashPay, NEAR Agent Spend Guard.** Named in the brief as competitors. No public documentation or repository could be verified for these at the time of writing. They are listed as **unverified**; compare against their actual repositories in the hackathon directory before making any claim about them.

## Comparison

| | OutLayer Agent Custody | AgentLeash | Gateway middleware (PolicyLayer, LetAgentPay) | Sentinel |
| --- | --- | --- | --- | --- |
| Chain | NEAR (+ cross-chain via Intents) | EVM (ERC-7715) | Off-chain | NEAR |
| Where rules are enforced | TEE | Wallet permission system | Gateway server | NEAR smart contract |
| Agent holds keys to funds | No (TEE holds them) | Agent signs within permission | Depends | No (contract holds funds) |
| Spending limits | Documented | Documented | Documented | Yes |
| Recipient restriction | Not verified | Not verified | Documented (policy rules) | Exact match per capsule |
| Asset / operation binding per task | Not verified | Not verified | Tool-level allow/deny | Exact match per capsule |
| Task-scoped authorization with expiry and version | Not verified | Time-limited permissions | Not verified | Yes (capsule, versioned) |
| Commitment of reviewed terms | Encrypted policy on-chain | — | — | SHA-256 commitment, `expected_commitment` check |
| Replay protection | Not verified | Not verified | Not verified | Strict per-capsule nonce |
| Human review for large payments | Not verified | — | Documented (LetAgentPay) | Yes, on-chain hold |
| Audit trail | Not verified | Not verified | Documented | On-chain records + NEP-297 events |
| Attack simulation for users | — | — | — | Attack Lab, on-chain |
| Asset coverage | Broad | ERC-20 etc. | Broad | Native NEAR only |

## Where Sentinel overlaps

- Spending limits, freeze and revoke are table stakes. OutLayer and the middleware tools cover them, often with broader asset support.
- Policy enforcement the agent cannot bypass is also OutLayer's core claim. OutLayer gets it from a TEE; Sentinel gets it from contract custody.

## Where Sentinel is different (and narrow)

1. **Task-scoped intent, not account-wide policy.** A capsule binds one agent to one recipient, one operation, one asset, limits and an expiry for one instruction. The demo point is a payment that passes the spending limit and is still refused because it is not what the owner asked for.
2. **Verifiable on-chain, no extra trust.** Enforcement is plain contract code anyone can read and test; there is no enclave or operator to trust. The cost: native NEAR only and public data.
3. **Reviewed-terms commitment.** The owner signs the hash they reviewed; the contract refuses anything else.
4. **Tightening vs loosening key split.** Containment actions work from a session key; anything that grants power needs a full-access confirmation.
5. **Refusals are first-class records.** Violations are stored and returned rather than panicked, so the audit trail shows attacks, not just successes.
6. **Attack Lab against the real contract.** Judges trigger seven attack classes and see the contract's own decision and transaction.

Sentinel and OutLayer are complementary: a capsule check could sit in front of a TEE custody wallet. That is future work, not a claim.
