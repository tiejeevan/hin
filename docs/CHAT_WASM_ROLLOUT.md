# Chat WASM + interactions rollout

## PR sequence

1. Rust crate + build pipeline + parity tests
2. `chatWasmBridge` + TS fallback
2b. API reply/delete + migration `0047_message_reply_to`
3. Engine wiring in App / `useChatEngine` (reply draft + delete handlers)
4. ChatBox UI (swipe, double-tap menu, quote bar, overscroll, open effects)
5. E2E + smoke + CI

## Feature flag

- `VITE_CHAT_WASM=1` in production builds (default when unset in prod)
- `VITE_CHAT_WASM=0` forces TypeScript fallback
- Staging: enable WASM, monitor console + chat send/receive, then prod

## Multi-agent ownership (reference)

| Agent | Owns |
|-------|------|
| 0 Lead | `docs/chat-wasm-api.md`, merges |
| 1 | `crates/hin-chat-core` |
| 2 | `crates/hin-chat-wasm`, build scripts, vite wasm |
| 3 | `chatWasmBridge.ts`, parity tests |
| 4 | e2e + CI |
| 5 | App + ChatBox UI |
| 6 | API reply/delete + migration |

Do not force-push shared branches; merge in dependency order above.
