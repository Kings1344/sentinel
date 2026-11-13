# Five-minute demo

Prep: vault deployed, 1 NEAR deposited, agent registered, one capsule for the agent paying the vendor up to 0.3 NEAR (24 h), one second capsule with a 1-minute expiry created ~2 minutes before you start. Meteor Wallet connected as owner. Explorer tab open on the vault account.

**0:00 – The problem (30 s).** Landing page. "Agents read untrusted text. A hijacked agent doesn't drain your wallet, it makes a small payment to the wrong place. This one is under the spending limit." Point at the example intent diff.

**0:30 – The owner's intent (60 s).** Capsules page. Type the instruction, click Turn into permissions, show recipient, limits and expiry. Review capsule: may / may-not lists, commitment, "Both fingerprints match". Sign in the wallet. "The contract now stores exactly this and refuses terms that hash differently."

**1:30 – It works (45 s).** Attack lab, Guided scenarios, step 1, Run on-chain. Approved, every check green, open the transaction on the explorer, show the vendor received NEAR.

**2:15 – The attack (75 s).** Step 2, Prompt injection. Read the injected product page out loud. Run on-chain. The diff flags Asset and Recipient, the decision is Blocked: unauthorized asset. Open the transaction: it succeeded as a transaction, and the contract recorded a refusal. "Under the limit. Still refused, because it isn't what I asked for."

**3:30 – More attacks (45 s).** Steps 3 (recipient), 5 (replay), 7 (expired, using the 1-minute capsule). One sentence each.

**4:15 – Containment (30 s).** Step 8: Revoke agent now (wallet confirms instantly, no extra approval needed to tighten), Run on-chain: Revoked. Security page: events, risk score, audit log.

**4:45 – Close (15 s).** "TrustVault doesn't trust the agent, the UI or our server. The vault contract checks every field, every time. Native NEAR today; the capsule model is chain-native and auditable."

Fallback if testnet is slow: run the same steps in Simulate mode (it is labelled as simulation) and show previously recorded transaction hashes.
