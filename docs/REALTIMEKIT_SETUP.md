# Cloudflare RealtimeKit setup (1:1 voice & video calls)

## 1. Create a RealtimeKit app

1. Open the [Cloudflare dashboard](https://dash.cloudflare.com/) → **Realtime** → **RealtimeKit**.
2. Create an app (e.g. `hin-production`).
3. Copy the **App ID**.

## 2. Configure DM presets

### Video preset (e.g. `group_call_participant` or `hin-dm-participant`)

- Meeting type: **Audio + Video**
- Audio: publish + subscribe
- Video: publish + subscribe
- Max video: **640×480** (bandwidth-conscious default)
- Simulcast: **off** for 1:1 calls

Set `REALTIMEKIT_DM_PRESET` in Worker vars if you use a custom name.

### Audio-only preset (e.g. `hin-dm-audio`)

- Meeting type: **Audio only**
- Audio: publish + subscribe
- Video: **disabled** (no publish/subscribe)

Set `REALTIMEKIT_AUDIO_PRESET` in Worker vars. If unset, voice calls fall back to `REALTIMEKIT_DM_PRESET`.

Both presets must exist in your RealtimeKit app before voice calls work in production.

## 3. API token

Create a token with **Realtime / Realtime Admin** permissions. Store as Worker secrets:

```bash
cd apps/api
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put REALTIMEKIT_APP_ID
```

For local dev, copy values into `apps/api/.dev.vars`.

## 4. Enable in Hin admin

1. **Admin → Video calls** → enable **Voice & video calls**.
2. Add usernames or emails to the allowlist in the same section.

Only allowlisted users see the voice/video icons and can **start** calls. Any user can **answer** an incoming call.

During voice calls, users can toggle **earpiece vs speaker** (browser-dependent; may not work on all devices).

## Architecture

- **Signaling** (ring / accept / decline): Hin `RealtimeDO` WebSocket (`callType` in `call_invite`)
- **Media**: RealtimeKit Core SDK → Cloudflare SFU + TURN (automatic)
- **Voice calls**: audio-only preset, no camera controls in UI
- **Video calls**: video preset, camera off by default, toggle on in-call

MoQ relay is not used for 1:1 WebRTC calls.

## Manual test checklist

1. Enable **Video calls** in Platform Settings and add your user to the allowlist.
2. Open a DM — confirm **phone** and **video** icons appear in the chat header.
3. **Voice call** — callee sees phone badge + "Incoming voice call"; accept → audio only, no camera button.
4. **Video call** — callee sees video badge; accept → audio works; camera off by default; enable video at 480p.
5. **Decline** — caller sees "Call declined"; meeting torn down.
6. **Cancel** while ringing — callee overlay dismisses.
7. **Timeout** (45s) — caller sees "No answer".
8. **Busy** — start a call while callee is already in ringing/accepted state.
9. **Block** — blocked users cannot call each other (403).
10. **Reconnect** — refresh page during accepted call; `/api/calls/active` restores session and call type.
