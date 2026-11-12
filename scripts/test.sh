#!/usr/bin/env bash
# Runs every automated test suite: the TypeScript engine (53 tests) and the Rust contract unit tests (42 tests).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== Engine (TypeScript) =="; npm test
echo "== Contract unit tests (Rust, stable toolchain) =="; (cd contracts/sentinel-vault && cargo +stable test --lib)
echo "All suites passed."
