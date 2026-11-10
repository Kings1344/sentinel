# Shared settings for the shell scripts. Override any of these in your shell before running.
export NETWORK="${NETWORK:-testnet}"
export CONTRACT_ID="${CONTRACT_ID:?Set CONTRACT_ID, e.g. sentinel-vault-yourname.testnet}"
export OWNER_ID="${OWNER_ID:?Set OWNER_ID to the account that will own the vault}"
export AGENT_ID="${AGENT_ID:-}"
export VENDOR_ID="${VENDOR_ID:-}"
export WASM="contracts/sentinel-vault/target/near/sentinel_vault.wasm"
