# Chat WASM API Contract

Version: `1.0.0`

React renders the DOM and owns WebSocket I/O, localStorage, and browser APIs.
Rust WASM owns pure math and chat engine state transitions.

Feature flags:
- `VITE_CHAT_WASM` — default on in production builds; set `0` to force TS fallback.
- `VITEST_CHAT_WASM` — set `1` to run Vitest against real WASM.

On WASM init failure: log once, set `wasmAvailable = false`, continue on TS path.

## Exports (`hin-chat-wasm`)

| Export | Args | Returns |
|--------|------|---------|
| `init` | — | void (panic hook via `#[wasm_bindgen(start)]`) |
| `merge_and_sort_messages` | `existing_json`, `incoming_json` | `Message[]` JSON |
| `apply_delivered` | `messages_json`, `ids_json`, `delivered_at` | `Message[]` JSON |
| `apply_messages_read` | `messages_json`, `sender_id`, `receiver_id`, `read_at` | `Message[]` JSON |
| `rubber_band` | `offset`, `limit` | `number` |
| `release_snap` | `offset_y`, `velocity_y`, `expanded`, `threshold?`, `flick_up?`, `flick_down?` | `"expand" \| "compact" \| "close" \| "none"` |
| `invert_flip_uniform` | `from_json`, `to_json` | `{ dx, dy, scale }` JSON |
| `sort_threads` | `threads_json` | `ChatThread[]` JSON |
| `engine_create` | — | engine id / handle |
| `engine_dispatch` | `engine`, `event_json` | `EnginePatch` JSON |
| `engine_snapshot` | `engine` | snapshot JSON |

## Message JSON (includes reply)

```json
{
  "id": 1,
  "senderId": 1,
  "senderUsername": "a",
  "receiverId": 2,
  "receiverUsername": "b",
  "content": "hi",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "read": false,
  "status": "sent",
  "deliveredAt": null,
  "readAt": null,
  "clientMessageId": null,
  "deletedAt": null,
  "linkPreview": null,
  "mediaUrl": null,
  "mediaType": null,
  "replyToMessageId": 9,
  "replyTo": {
    "id": 9,
    "senderId": 2,
    "senderUsername": "b",
    "content": "previous",
    "mediaUrl": null,
    "deleted": false
  }
}
```

## Engine events

`OpenPanel`, `ClosePanel`, `ToggleExpand`, `SelectRecipient`, `IncomingWsMessage`,
`IncomingDelivered`, `IncomingRead`, `OptimisticSend` (optional `replyTo`),
`SendFailed`, `MarkSendingFailed`, `FetchHistoryMerge`, `TypingEvent`, `ClearTyping`,
`SetReplyTo`, `ClearReplyTo`, `MessageDeleted`, `OptimisticDelete`.

Each dispatch returns `EnginePatch` with optional `messages`, `threads`, `unread`, `replyingTo`, etc.

## Gesture ownership

- Shell morph math (`rubber_band`, `release_snap`, FLIP invert): WASM.
- List/thread overscroll bounce, swipe-to-reply, double-tap menu: React/DOM only.
- `prefers-reduced-motion`: TS short-circuits motion; WASM math unused for animation frames.

## Protocol (WS — API stays TypeScript)

- `send_message.payload.replyToMessageId?: number`
- `delete_message` client → `{ messageId }`
- `message_deleted` server → `{ messageId, conversationPeerId }`

DOM-coupled code never enters Rust — only numbers and JSON.
