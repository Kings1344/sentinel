#!/usr/bin/env bash
# Runs every test suite. Pass --sandbox to include the NEAR sandbox end-to-end tests.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== Engine (TypeScript) =="; npm test
echo "== Contract unit tests (Rust) =="; (cd contracts/sentinel-vault && cargo test --lib)
if [[ "${1:-}" == "--sandbox" ]]; then
  echo "== Contract sandbox end-to-end tests =="; (cd contracts/sentinel-vault && cargo test --test sandbox -- --nocapture)
fi
echo "All requested suites passed."
