# Threat model

## Assets

1. NEAR held in the vault.
2. The integrity of Intent Capsules (who may pay whom, how much, until when).
3. The audit trail of agent requests.
4. The owner's and agent's keys.

## Trust boundaries

| Boundary | Trusted side | Untrusted side |
| --- | --- | --- |
| Agent ↔ external content | — | Web pages, emails, tool results the agent reads (assume hostile) |
| Agent ↔ contract | Contract | Agent and anything that influenced it |
| Browser ↔ contract | Contract | Browser UI (preview logic, parser) |
| Server route ↔ contract | Contract | Server route and the agent key it holds |
| Owner wallet ↔ contract | Both, for owner methods | — |

## Attackers

- **Prompt injector**: controls content the agent reads. Goal: redirect funds.
- **Compromised agent**: controls the agent's key or runtime. Goal: spend beyond the capsule.
- **Outsider**: any NEAR account. Goal: spend, spam storage, or disrupt.
- **Malicious UI or RPC**: tampered front end or RPC node. Goal: trick the owner into signing broader terms.

## Threats and mitigations

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| Recipient, asset or operation substitution via injection | Exact-match checks against stored capsule terms | None for funds; the agent still wastes gas |
| Amount inflation | Per-tx and cumulative checks including reserved funds | — |
| Replay of a previous request | Strict nonce sequence, consumed on any decision | — |
| Use after expiry or revocation | Time and status checks; agent revocation cascades to capsules | — |
| Agent uses another agent's capsule | `capsule_bound_to_agent` check; nonce untouched | — |
| Agent modifies its permissions | Owner-only, 1-yocto capsule methods | — |
| Double settlement / failed transfer counted as spent | Reserve-then-settle in callback; idempotent finalize; refunds | — |
| Storage spam by outsiders | Unregistered callers refused before any write | Registered agents can add records; bounded by pruning (500 requests, 500 audit events) and revocation |
| Nonce burning by a compromised agent | Owner revokes agent/capsule | Denial of service on that capsule until revoked |
| Tampered UI shows benign terms, submits broad ones | Local hash vs contract preview must match; contract enforces `expected_commitment` | A fully compromised browser could fake both; the wallet's own transaction view is the last line |
| Stolen owner function-call (session) key | Can only tighten (freeze/revoke); loosening needs 1 yocto = full-access confirmation | DoS by freezing |
| Stolen owner full-access key | Out of scope | Total loss |
| Demo route abuse | Per-IP rate limit; agent key limited to `request_transfer` with an allowance | Testnet gas spend |
| Malicious LLM output | LLM only proposes fields; server fixes capsule id and nonce; contract decides | — |

## Known limitations

See README > Limitations. In short: native NEAR only, single owner per deployment, the contract enforces whatever capsule the owner signs, on-chain data is public.
