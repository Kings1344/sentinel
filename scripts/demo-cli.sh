#!/usr/bin/env bash
# Full demo from the command line: deposit, register agent, create capsule, one authorized payment,
# then recipient substitution, amount manipulation, replay and operation substitution — all against
# the deployed contract. Requires OWNER_ID, AGENT_ID and VENDOR_ID keys in your near-cli keychain.
set -euo pipefail
cd "$(dirname "$0")/.."; source scripts/env.sh
: "${AGENT_ID:?Set AGENT_ID}"; : "${VENDOR_ID:?Set VENDOR_ID}"
call() { # signer method json deposit
  near contract call-function as-transaction "$CONTRACT_ID" "$2" json-args "$3" prepaid-gas '100 Tgas' attached-deposit "$4" sign-as "$1" network-config "$NETWORK" sign-with-keychain send
}
view() { local a="${2:-}"; [[ -z "$a" ]] && a='{}'; near contract call-function as-read-only "$CONTRACT_ID" "$1" json-args "$a" network-config "$NETWORK" now; }
YOCTO=000000000000000000000000
NOW_MS=$(($(date +%s) * 1000))
EXP=$((NOW_MS + 3600000))

echo "== Owner deposits 2 NEAR";               call "$OWNER_ID" deposit '{}' '2 NEAR'
echo "== Owner registers the agent";            call "$OWNER_ID" register_agent "{\"agent_id\":\"$AGENT_ID\",\"label\":\"CLI demo agent\"}" '1 yoctoNEAR' || true
echo "== Owner creates a capsule: pay $VENDOR_ID up to 0.3 NEAR (1 h)"
call "$OWNER_ID" create_capsule "{\"input\":{\"agent_id\":\"$AGENT_ID\",\"operation\":\"native_transfer\",\"asset\":\"NEAR\",\"recipient\":\"$VENDOR_ID\",\"max_per_tx\":\"3${YOCTO:1}\",\"max_total\":\"3${YOCTO:1}\",\"review_threshold\":null,\"expires_at_ms\":\"$EXP\",\"instruction\":\"Pay $VENDOR_ID up to 0.3 NEAR for invoice #1042\",\"expected_commitment\":null}}" '1 yoctoNEAR'
CAP=$(view get_overview | grep -o '"capsule_count": *[0-9]*' | grep -o '[0-9]*$')
echo "Capsule id: $CAP"
NONCE=$(view get_capsule "{\"capsule_id\":$CAP}" | grep -o '"last_nonce": *"[0-9]*"' | grep -o '[0-9]*')
N=$((NONCE + 1))
req() { echo "{\"request\":{\"capsule_id\":$CAP,\"nonce\":$1,\"operation\":\"$2\",\"asset\":\"$3\",\"recipient\":\"$4\",\"amount\":\"$5\",\"memo\":null}}"; }
ONE_TENTH="1${YOCTO:1}"   # 0.1 NEAR

echo "== 1. Authorized: 0.1 NEAR to $VENDOR_ID (expect Executed)"; call "$AGENT_ID" request_transfer "$(req $N native_transfer NEAR "$VENDOR_ID" "$ONE_TENTH")" '0 NEAR'
echo "== 2. Recipient substitution (expect Blocked/RecipientMismatch)"; call "$AGENT_ID" request_transfer "$(req $((N+1)) native_transfer NEAR attacker-wallet.testnet "$ONE_TENTH")" '0 NEAR'
echo "== 3. Amount manipulation 0.8 NEAR (expect AmountExceedsTxLimit)"; call "$AGENT_ID" request_transfer "$(req $((N+2)) native_transfer NEAR "$VENDOR_ID" "8${YOCTO:1}")" '0 NEAR'
echo "== 4. Replay nonce $N (expect NonceReplay)"; call "$AGENT_ID" request_transfer "$(req $N native_transfer NEAR "$VENDOR_ID" "$ONE_TENTH")" '0 NEAR'
echo "== 5. Operation substitution (expect OperationMismatch)"; call "$AGENT_ID" request_transfer "$(req $((N+3)) function_call NEAR "$VENDOR_ID" "$ONE_TENTH")" '0 NEAR'
echo "== 6. Asset substitution / prompt injection (expect AssetMismatch)"; call "$AGENT_ID" request_transfer "$(req $((N+4)) native_transfer TOKENB token-b-sale.testnet "$ONE_TENTH")" '0 NEAR'
echo "== Latest requests"; view get_requests '{"limit":6}'
echo "Copy the transaction hashes printed above into docs/DEMO_SCRIPT.md / your submission."
