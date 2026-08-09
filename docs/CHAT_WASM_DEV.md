# Chat WASM development prerequisites

## Tooling

- Rust stable (repo pins via `rust-toolchain.toml`)
- `rustup target add wasm32-unknown-unknown`
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) (`cargo install wasm-pack`)
- Node 20+ for the monorepo

## Commands

```bash
# Native unit tests for chat core
npm run test:wasm

# Build WASM package into apps/web/src/wasm/chat
npm run build:wasm

# Web unit tests with real WASM (optional)
VITEST_CHAT_WASM=1 npm run test --workspace=apps/web

# Force TS fallback (no WASM)
VITE_CHAT_WASM=0 npm run dev
```

See [chat-wasm-api.md](./chat-wasm-api.md) for the JS ↔ WASM boundary contract.

Feature flag: `VITE_CHAT_WASM` (default on in production). `prefers-reduced-motion` and WASM init failures fall back to TypeScript implementations.
