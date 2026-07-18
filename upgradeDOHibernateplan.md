# Realtime Durable Object WebSocket Hibernation Upgrade Plan

## Purpose

Migrate `RealtimeDO` from the standard WebSocket API to Cloudflare's WebSocket Hibernation API while preserving every existing realtime feature.

The migration should:

- Preserve the existing `/ws` URL and frontend message protocol.
- Preserve direct messages, typing indicators, read receipts, presence, online counts, notifications, feed events, poll updates, Olabid comment events, admin broadcasts, settings changes, and gamification events.
- Allow the Durable Object to sleep while connected users are idle.
- Stop relying on the in-memory `sessions` map, which is lost when a Durable Object hibernates.
- Keep multiple tabs/devices per user working correctly.
- Require no D1 schema migration and no new Durable Object class migration.

## Why This Upgrade Is Needed

`apps/api/src/durable-objects/realtime.ts` currently accepts sockets with:

```ts
server.accept();
```

It also stores authenticated session information in:

```ts
sessions = new Map<WebSocket, Session>();
```

This design works, but an accepted standard WebSocket prevents the Durable Object from hibernating. As long as at least one user remains connected, the global `RealtimeDO` can continue accruing wall-clock duration.

With hibernation:

1. Cloudflare keeps client WebSocket connections open at the edge.
2. `RealtimeDO` can be evicted from memory while no event is being processed.
3. An HTTP broadcast or incoming WebSocket message wakes it.
4. The handler runs and the object becomes eligible to sleep again.

The frontend experience and event protocol do not need to change.

## Existing Architecture

- Worker entry point: `apps/api/src/index.ts`
- WebSocket endpoint: `GET /ws`
- Durable Object class: `apps/api/src/durable-objects/realtime.ts`
- Durable Object binding: `REALTIME_DO`
- Instance key: `idFromName('global')`
- Frontend WebSocket client: `apps/web/src/App.tsx`
- Client reconnect behavior: reconnects three seconds after an unexpected close
- Current Durable Object backend: SQLite-backed class declared in `apps/api/wrangler.toml`

Every connected user currently joins the same global Durable Object. API routes call HTTP endpoints on that object to fan out global or user-specific events.

## Realtime Behavior That Must Be Preserved

### Client-to-server events

- `join`
- `active_chat`
- `send_message`
- `typing`

### Server-to-client events

- `joined`
- `presence_snapshot`
- `user_online`
- `user_offline`
- `message`
- `messages_read`
- `typing`
- `notification`
- `follow_request_received`
- `follow_approved`
- `system_toast`
- `gamification_reward`
- `gamification_settings_changed`
- `system_settings_changed`
- `post_created`
- `post_deleted`
- `post_updated`
- `poll_vote_update`
- `poll_closed`
- `like_update`
- `comment_like_update`
- `comment_created`
- `comment_deleted`
- `comment_updated`
- `item_comment_like_update`
- `item_comment_created`
- `item_comment_deleted`
- `item_comment_updated`

### Existing internal HTTP broadcast endpoints

- `POST /broadcast-notification`
- `POST /broadcast-notifications-batch`
- `POST /broadcast-system-toast`
- `POST /broadcast-read-status`
- `POST /broadcast-event`
- `POST /broadcast-user-event`

These endpoint paths and request bodies should remain unchanged.

## Target Design

### Socket attachment

Each authenticated socket will carry its session state in a serialized attachment:

```ts
interface RealtimeSession {
  userId: number;
  username: string;
  activeChatId: number | null;
}
```

After a valid `join` message:

```ts
ws.serializeAttachment({
  userId,
  username,
  activeChatId: null,
});
```

When `active_chat` changes, write a new attachment containing the updated `activeChatId`. Do not mutate a deserialized object and assume Cloudflare persisted it.

### Socket discovery

Replace iteration over `this.sessions` with:

```ts
this.state.getWebSockets()
```

For each socket, read:

```ts
const session = ws.deserializeAttachment() as RealtimeSession | null;
```

Sockets without a valid attachment are connected but not authenticated and must not:

- Appear in presence snapshots or online counts.
- Receive authenticated broadcasts.
- Send messages, typing state, or active-chat updates.

Small helper methods should centralize this behavior:

- `getSession(ws)`
- `setSession(ws, session)`
- `getAuthenticatedSockets()`
- `getOnlineUserIds()`
- `isUserOnline(userId, excludingSocket?)`
- `sendSafely(ws, event)`
- `broadcastToAll(event, excludingSocket?)`
- `broadcastToUser(userId, event)`

### Hibernation event handlers

Replace per-socket event listeners with Durable Object class handlers:

```ts
async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
  // Parse, validate, and delegate to the existing message behavior.
}

webSocketClose(
  ws: WebSocket,
  code: number,
  reason: string,
  wasClean: boolean,
) {
  // Broadcast offline only if this was the user's final socket.
}

webSocketError(ws: WebSocket, error: unknown) {
  // Log safely; perform the same final-presence check if needed.
}
```

The upgrade request changes from:

```ts
server.accept();
```

to:

```ts
this.state.acceptWebSocket(server);
```

Do not register `message`, `close`, or `error` listeners with `addEventListener` after this change.

### Presence semantics

Presence counts unique authenticated users, not sockets.

Examples:

- One user with three open tabs counts as one online user.
- Closing one of those tabs must not emit `user_offline`.
- Closing the final tab emits `user_offline`.
- A newly joined user receives a deduplicated `presence_snapshot`.
- Existing users receive `user_online` only when the joining socket is the user's first authenticated socket.

The final-socket check should use `state.getWebSockets()` plus attachments rather than an in-memory map. The closing socket must be excluded explicitly if Cloudflare still includes it during the close callback.

## Implementation Phases

### Phase 0: Establish a baseline

Before editing the Durable Object:

1. Record the currently deployed Worker version.
2. Record current Durable Object request and duration metrics in Cloudflare.
3. Verify the current frontend reconnects after an unexpected close.
4. Run the API tests and web build.
5. Manually verify the critical realtime flows using two users in separate browser sessions.

Baseline flows:

- Both users appear online.
- A direct message is delivered once to both sender and receiver views.
- Typing starts and stops.
- Read receipts update.
- Likes/comments/poll votes update without refresh.
- Targeted notifications reach only the intended user.
- An admin system toast reaches both users.

### Phase 1: Introduce typed session helpers

Refactor `RealtimeDO` so all socket selection and session lookup goes through helper methods.

Tasks:

1. Add the `RealtimeSession` interface.
2. Add strict attachment validation instead of trusting arbitrary deserialized data.
3. Add safe send and broadcast helpers.
4. Replace repeated loops in HTTP broadcast endpoints with those helpers.
5. Preserve response codes and payload formats.

This phase may temporarily keep the current `sessions` map only if needed to make the refactor reviewable. It must be removed before enabling hibernation.

### Phase 2: Move session state to socket attachments

Tasks:

1. Serialize session state after JWT verification in `join`.
2. Deserialize session state for every authenticated client message.
3. Re-serialize after `activeChatId` changes.
4. Replace all `sessions` map reads with `state.getWebSockets()` and attachments.
5. Remove the `sessions` map.
6. Ensure unauthenticated sockets are excluded from all authenticated behavior.
7. Close a socket after failed authentication with an application close code, after sending an error when possible.

At the end of this phase, behavior should no longer depend on process memory surviving.

### Phase 3: Enable WebSocket hibernation

Tasks:

1. Replace `server.accept()` with `state.acceptWebSocket(server)`.
2. Remove socket event listeners from `fetch()`.
3. Add `webSocketMessage`, `webSocketClose`, and `webSocketError`.
4. Reject unsupported binary client messages cleanly.
5. Preserve current JSON parsing error handling.
6. Preserve the existing `101` response and client socket.
7. Confirm the installed Workers types support all hibernation APIs. Update `@cloudflare/workers-types` if required; do not upgrade unrelated dependencies as part of this migration.

No new Durable Object migration tag should be required because the existing class and binding are unchanged.

### Phase 4: Automated tests

Add focused tests around session and routing behavior.

Minimum automated coverage:

1. A valid join stores the correct attachment.
2. An invalid token does not create an authenticated session.
3. Presence snapshots deduplicate multiple sockets for one user.
4. First socket emits `user_online`.
5. A second socket for the same user does not emit another `user_online`.
6. Closing a non-final socket does not emit `user_offline`.
7. Closing the final socket emits `user_offline`.
8. `broadcast-notification` sends only to the requested user's sockets.
9. Batch notifications route each notification to the correct user.
10. `broadcast-user-event` targets only the intended user.
11. `broadcast-event` and system toasts reach all authenticated sockets.
12. Read status reaches only the sender's sockets.
13. Typing reaches only the receiver's sockets.
14. Direct messages reach the sender and all receiver sockets exactly once per socket.
15. `active_chat` persists its new attachment and read behavior still works.
16. Unauthenticated sockets receive no private or global authenticated broadcast.
17. Malformed JSON and binary input do not crash the Durable Object.

Where Cloudflare's local test runtime cannot force a real eviction, simulate re-instantiation and verify that all routing state is recovered exclusively from socket attachments.

### Phase 5: Local integration testing

Run the app with Wrangler/Miniflare and use:

- User A in a normal browser window.
- User B in a private window or separate browser profile.
- An additional tab for User A.

Test matrix:

#### Connection and authentication

- Login connects successfully and receives `joined`.
- Refresh reconnects and rejoins.
- Logout closes the socket.
- Expired/invalid JWT cannot authenticate.
- Network interruption triggers frontend reconnection.

#### Presence and online count

- A appears online to B.
- Header online count increases only for a new unique user.
- Opening a second A tab does not increase the count.
- Closing one A tab keeps A online.
- Closing A's final tab marks A offline and decrements the count.
- Reconnecting does not leave a ghost offline or duplicate online entry.

#### Messaging

- Plain text message.
- Image attachment message.
- Message containing a link preview.
- Empty and over-length message validation.
- Blocked-user message rejection.
- Typing indicator start/stop and timeout.
- Active-chat automatic read status.
- Manual mark-read endpoint update.
- Multi-tab delivery.

#### Social and application broadcasts

- Post create/update/delete.
- Post like and unlike.
- Comment create/update/delete and like.
- Poll vote and poll close.
- Follow request and approval.
- Mention/notification.
- Gamification reward/settings update.
- System settings update.
- Admin system toast.
- Olabid item comment create/update/delete and like.

### Phase 6: Staging deployment

Prefer a separate staging Worker before production.

1. Deploy a staging Worker with the same code and a staging Durable Object namespace.
2. Use a separate staging D1 database or otherwise ensure tests cannot mutate production data.
3. Connect multiple browser sessions and leave them idle long enough for hibernation eligibility.
4. Send a new WebSocket message after the idle period.
5. Trigger an HTTP broadcast after the idle period.
6. Confirm sockets remain connected and events arrive.
7. Inspect logs for constructor re-entry, message errors, attachment failures, and abnormal closes.
8. Compare idle Durable Object duration with the baseline.

Do not use production D1 for destructive staging tests.

### Phase 7: Production rollout

1. Choose a low-traffic deployment window.
2. Record the current production deployment version for rollback.
3. Deploy the migrated Worker.
4. Expect currently connected WebSockets to disconnect during deployment.
5. Confirm clients reconnect automatically within approximately three seconds.
6. Log in with two test accounts and run the critical smoke tests.
7. Monitor errors, WebSocket closes, Durable Object requests, and duration.
8. Keep the previous deployment available for immediate rollback.

Production smoke tests:

- Both accounts connect and online count is correct.
- Send and receive a direct message.
- Verify typing and read receipts.
- Like a post and add a comment.
- Trigger one targeted notification.
- Trigger an admin toast if safe.
- Leave both clients idle, then verify realtime delivery resumes.

### Phase 8: Post-deployment validation

Monitor for at least 24 hours, then compare against the baseline:

- Durable Object duration should fall substantially during idle periods.
- Durable Object request count should not unexpectedly spike.
- WebSocket error/close rates should not increase materially.
- No persistent ghost-online users.
- No missing or duplicate direct messages.
- No missing targeted notifications.
- D1 read/write behavior remains within the normal range.

After several days, verify free-tier usage and document actual savings.

## Detailed Test Checklist

### Build and static checks

- [ ] API TypeScript/type checks pass.
- [ ] API tests pass.
- [ ] Web build passes.
- [ ] Web tests pass.
- [ ] No new IDE lint errors.
- [ ] Wrangler validates the configuration.

### Hibernation-specific checks

- [ ] No use of `server.accept()` remains.
- [ ] No per-socket `addEventListener` remains in `RealtimeDO`.
- [ ] No `Map<WebSocket, Session>` remains.
- [ ] No timers or outbound long-lived connections prevent hibernation.
- [ ] Session state is serialized after join.
- [ ] `activeChatId` changes are re-serialized.
- [ ] All routing uses `state.getWebSockets()`.
- [ ] Constructor re-entry does not lose presence or targeting state.
- [ ] An HTTP request wakes the object and can broadcast to attached sockets.
- [ ] An incoming socket message wakes the object and is handled normally.

### Correctness checks

- [ ] Online count is based on unique users.
- [ ] Multi-tab presence behaves correctly.
- [ ] Unauthenticated sockets are excluded.
- [ ] Targeted events do not leak to other users.
- [ ] Global events reach all authenticated users.
- [ ] Sender acknowledgement behavior remains unchanged.
- [ ] Receiver active-chat state still controls initial message `read` status.
- [ ] Closing/error paths emit offline only once.
- [ ] Failed socket sends do not abort broadcasts to remaining users.

### Resilience checks

- [ ] Client reconnects after deployment.
- [ ] Client reconnects after temporary network loss.
- [ ] Repeated reconnects do not create duplicate state.
- [ ] Malformed messages do not crash the object.
- [ ] Invalid JWT sockets are closed.
- [ ] A failed send to one socket does not affect other sockets.
- [ ] Multiple simultaneous messages do not create duplicate D1 rows.

### Cost checks

- [ ] Record pre-upgrade DO requests/day.
- [ ] Record pre-upgrade DO duration/day.
- [ ] Record post-upgrade DO requests/day.
- [ ] Record post-upgrade DO duration/day.
- [ ] Confirm idle connections no longer produce continuous duration usage.

## Observability Recommendations

Add structured logs for exceptional conditions only:

- Authentication failure.
- Invalid attachment.
- Malformed client message.
- Unsupported binary message.
- WebSocket error and close code.
- Failed socket send.

Avoid logging JWTs, message contents, private notification payloads, or serialized attachments containing unnecessary personal information.

Optionally add an admin-protected realtime stats endpoint returning:

```json
{
  "authenticatedSockets": 0,
  "uniqueOnlineUsers": 0
}
```

This endpoint must not expose user IDs publicly. Each stats request wakes the object and is billable, so it should be used on demand rather than polled frequently.

## Risks and Mitigations

### Lost session state after wake

**Risk:** Code still depends on an in-memory map.

**Mitigation:** Remove the map entirely and derive state from socket attachments. Test simulated object re-instantiation.

### Incorrect multi-tab offline event

**Risk:** Closing one tab marks the user offline despite another tab being connected.

**Mitigation:** Check all remaining attached sockets for the same user and exclude the closing socket explicitly.

### Broadcast privacy leak

**Risk:** A targeted event is accidentally sent to all sockets during helper refactoring.

**Mitigation:** Add routing tests for every targeted HTTP endpoint and exclude sockets without valid attachments.

### Attachment update not persisted

**Risk:** Mutating `activeChatId` in a deserialized object does not update Cloudflare's stored attachment.

**Mitigation:** Always call `serializeAttachment()` with the complete updated session.

### Deployment disconnect

**Risk:** Existing sockets disconnect when the Worker is deployed.

**Mitigation:** The frontend already reconnects after an unexpected close. Verify this in staging and production smoke tests.

### Runtime/type incompatibility

**Risk:** The older Workers type package does not expose the required APIs correctly.

**Mitigation:** Update only the necessary Cloudflare development types and validate locally before deployment. The current compatibility date should be verified against Cloudflare's hibernation API requirements.

### Global Durable Object hotspot

**Risk:** Hibernation reduces idle cost but does not remove single-instance CPU and memory limits.

**Mitigation:** Monitor handler latency and connection volume. Shard by user, room, or feature only when measured load requires it; sharding is a separate project.

## Rollback Plan

Rollback must restore the prior Worker version, not attempt to convert individual live sockets.

1. Record the last known-good deployment version before rollout.
2. If critical realtime behavior fails, roll back the Worker immediately.
3. Existing sockets will reconnect after rollback.
4. Socket attachments are connection-local, so no D1 cleanup is required.
5. No Durable Object class migration or storage rollback should be necessary.
6. Re-run the production smoke tests after rollback.

Rollback triggers:

- Direct messages are lost or duplicated.
- Targeted events reach the wrong users.
- Presence becomes persistently incorrect.
- Reconnect loops affect a meaningful portion of clients.
- The Durable Object throws repeatedly on wake.
- Duration does not fall and investigation indicates hibernation is not occurring.

## Out of Scope

The following should not be combined with this migration:

- Sharding the global Durable Object.
- Changing WebSocket event names or payloads.
- Moving message persistence away from D1.
- Adding auction polling or new realtime product features.
- Changing authentication token format.
- Broad Wrangler or dependency upgrades unrelated to hibernation.
- Redesigning frontend reconnect UX.

Keeping these separate makes the hibernation migration easier to test and roll back.

## Definition of Done

The upgrade is complete when:

1. `RealtimeDO` uses `state.acceptWebSocket()`.
2. All session state required after wake is stored in socket attachments.
3. No realtime routing depends on an in-memory session map.
4. All existing realtime features pass automated and manual tests.
5. Multi-tab presence and online count are correct.
6. Targeted events remain private.
7. Clients reconnect successfully after deployment.
8. Production monitoring shows materially lower idle Durable Object duration.
9. No increase in lost messages, duplicate messages, ghost presence, or socket errors is observed during the monitoring period.

