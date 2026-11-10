#!/usr/bin/env bash
# Build the contract to contracts/sentinel-vault/target/near/sentinel_vault.wasm
set -euo pipefail
cd "$(dirname "$0")/../contracts/sentinel-vault"
command -v cargo-near >/dev/null || { echo "cargo-near is not installed. See README > Prerequisites."; exit 1; }
cargo near build non-reproducible-wasm
ls -lh target/near/sentinel_vault.wasm
