#!/usr/bin/env bash
# Creates the vault, agent and vendor accounts on testnet using the faucet.
# Usage: CONTRACT_ID=sentinel-vault-you.testnet AGENT_ID=sentinel-agent-you.testnet VENDOR_ID=sentinel-vendor-you.testnet OWNER_ID=you.testnet bash scripts/create-accounts.sh
set -euo pipefail
cd "$(dirname "$0")/.."; source scripts/env.sh
for acct in "$CONTRACT_ID" "${AGENT_ID:?Set AGENT_ID}" "${VENDOR_ID:?Set VENDOR_ID}"; do
  echo "Creating $acct"
  near account create-account sponsor-by-faucet-service "$acct" autogenerate-new-keypair save-to-keychain network-config "$NETWORK" create
done
echo "Done. The owner account ($OWNER_ID) is your own wallet account; create it in a wallet (e.g. Meteor) if you have not."
