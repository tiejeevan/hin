#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
cargo test -p hin-chat-core
npm run test --workspace=apps/web -- src/lib/chatMessages.test.ts src/lib/panelMorph.test.ts src/lib/chatWasmBridge.test.ts
echo "verify-wasm-parity: ok"
