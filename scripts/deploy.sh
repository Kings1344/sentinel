#!/usr/bin/env bash
# Deploys the vault and initializes it with OWNER_ID as owner.
# Usage: CONTRACT_ID=... OWNER_ID=... bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."; source scripts/env.sh
[[ -f "$WASM" ]] || bash scripts/build.sh
near contract deploy "$CONTRACT_ID" use-file "$WASM" \
  with-init-call new json-args "{\"owner_id\":\"$OWNER_ID\"}" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  network-config "$NETWORK" sign-with-keychain send
echo
echo "Deployed. Check it:"
echo "  near contract call-function as-read-only $CONTRACT_ID get_overview json-args '{}' network-config $NETWORK now"
echo "Set NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID in apps/web/.env.local"
