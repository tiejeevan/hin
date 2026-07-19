# Account Recovery + PWA / Web Push Plan

## Purpose

Ship two product gaps that leave users stranded today:

1. **Account recovery** — password accounts can permanently lock out with no reset path; email verify exists but does not unlock recovery.
2. **PWA + Web Push** — the notification inbox and WebSocket path only work while a tab is open; users miss events when the browser is closed.

This document lists **prerequisites first**, then a phased implementation plan. Do not start feature work until prerequisites for that feature are met.

---

## Current State (baseline)

### Auth today

| Piece | Status |
| --- | --- |
| Username + password register/login | Done (`apps/api/src/routes/auth.ts`) |
| Google OAuth (`google_id`) | Done |
| JWT sessions (24h, localStorage) | Done |
| Profile email + OTP verify (Resend) | Done / WIP in tree (`apps/api/src/routes/email.ts`) |
| Forgot / reset password | **Missing** |
| Change password (logged in) | **Missing** |
| Email as login identifier | **Missing** |
| Account linking (password ↔ Google) | **Missing** |
| Passkeys / backup codes / magic links | **Missing** |

Reusable building blocks already in place for recovery:

- `otp_challenges` with documented purpose `'password_reset'` (unused)
- Rate limits, disposable-email blocklist, Resend sender
- `users.email` + `users.email_verified_at`
- Audit type slot `'password_change'` (never emitted)

### Notifications today

| Piece | Status |
| --- | --- |
| D1 inbox + REST | Done (`/api/notifications`) |
| WebSocket fanout via `RealtimeDO` | Done |
| Per-type prefs in `user_settings` | Done (likes/comments/mentions/DMs/system) |
| PWA manifest / service worker | **Missing** |
| Web Push / VAPID / subscription storage | **Missing** |
| Browser Notification API | **Missing** |

Offline users only see rows later via REST. DMs use WS `{ type: 'message' }` only — `notifyDms` is stored but not enforced for inbox rows.

---

# Feature A — Account Recovery

## Problem

Password accounts are fragile:

1. Forgot password → permanent lockout (no reset).
2. Email is optional and post-login — many password users may have no verified recovery destination.
3. Login is username-only — losing the username is also lockout if there is no email lookup.
4. No authenticated change-password — users cannot rotate a weak/compromised password in-product.
5. No way to attach Google as a backup to a password account (or vice versa).

Email verify alone does **not** fix lockout; it only creates a recovery destination for users who still have a session.

## Prerequisites (must complete before implementation)

### A0. Operational / secrets

- [ ] `RESEND_API_KEY` and `RESEND_FROM_EMAIL` configured in local `.dev.vars` and production Worker secrets.
- [ ] Resend domain / From address verified for production sends.
- [ ] `OTP_PEPPER` set as a Worker secret in production (do not rely on the dev fallback string).
- [ ] Confirm migration `0042_otp_challenges_rate_limits.sql` is applied to local and remote D1.
- [ ] Decide whether `JWT_SECRET` moves from the hardcoded value in `apps/api/src/lib/auth.ts` to an env secret in this project or a follow-up; document the choice. Prefer env before shipping recovery (token theft risk grows with password-reset flows).

### A1. Email verify as recovery foundation

Email verify WIP must be **landed and working** before password reset:

- [ ] Profile email request/verify flow works end-to-end (UI + API + Resend).
- [ ] Verified email uniqueness and disposable-domain rules behave as intended.
- [ ] 15-day email-change cooldown is intentional product policy (keep or adjust before recovery ships).
- [ ] Product decision: **password accounts must have a verified email before they can use recovery** — and preferably are nudged/required while still logged in.

**Product decisions to lock before coding reset:**

| Decision | Options | Recommendation |
| --- | --- | --- |
| Reset identifier | Username only / email only / either | **Either username or verified email** (lookup only users with `email_verified_at` set) |
| Reset channel | 4-digit OTP email (reuse Resend) / magic link | **OTP email** — matches existing `otp_challenges`; magic links later |
| OTP length for reset | 4 (current verify) / 6 | **6 digits for reset** (higher stakes); keep 4 for profile verify or unify to 6 |
| Session after reset | Keep existing JWTs / force re-login | **Force re-login** (issue no new JWT until login; optionally document that old JWTs still work until expiry unless you add revoke) |
| Google-only users | Allow set-password / ignore | Out of scope for v1 unless needed for delete-account UX |
| Enumeration safety | Reveal whether account exists | **Always return generic success** on reset request |

### A2. Security / abuse prerequisites

- [ ] Reuse existing rate-limit buckets for reset send/verify (stricter than email verify if needed).
- [ ] Turnstile on unauthenticated reset-request (same pattern as login/register) — decide yes/no; recommend **yes**.
- [ ] Confirm OTP max attempts (5) and TTL (10m) are acceptable for reset, or override per purpose.
- [ ] Audit: emit `password_change` (and a distinct `password_reset` if you want to split) on successful reset and change-password.

### A3. UX / copy prerequisites

- [ ] Auth form gets a “Forgot password?” entry point (`AuthForm.tsx`).
- [ ] Logged-in settings gets “Change password” (and nudge to verify email if missing).
- [ ] Empty states for: no verified email, Google-only account, rate-limited, expired OTP.

---

## Plan A — Account Recovery (phased)

### Phase A1 — Authenticated password change (low risk, unblocks hygiene)

**Why first:** Users who still have a session can harden accounts before unauthenticated reset exists.

1. API: `POST /api/users/me/password` (or `/api/auth/change-password`)
   - Body: `{ currentPassword, newPassword }`
   - Reject Google-only accounts with empty `passwordHash` (or allow set-password without current — product call; recommend **reject** in v1 with clear error).
   - bcrypt hash + update; emit audit `password_change`.
2. Shared Zod schemas in `@hin/types`.
3. UI in profile settings next to email section.
4. Tests: unit + route tests for wrong current password, weak password, Google-only.

**Exit criteria:** Logged-in password users can rotate passwords; audit row appears.

### Phase A2 — Require / nudge verified email for password accounts

1. Soft nudge (banner / profile gate) when `passwordHash` is set and `emailVerifiedAt` is null.
2. Optional hard gate later: block sensitive actions until verified (defer unless product insists).
3. Do **not** collect email on register in this phase unless product prioritizes it — profile verify already exists.

**Exit criteria:** Password users who can still log in are steered to attach a verified email.

### Phase A3 — Unauthenticated password reset via OTP

Reuse `otp_challenges` with `purpose = 'password_reset'`.

**API**

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `POST` | `/api/auth/password-reset/request` | No | Accept `{ username }` or `{ email }`; if a matching non-deleted user has verified email, create OTP challenge + send Resend email; always return generic `{ ok: true }` |
| `POST` | `/api/auth/password-reset/verify` | No | Accept `{ username\|email, code, newPassword }`; verify OTP; update `passwordHash`; consume challenge; invalidate sibling unused challenges; emit audit |

**Implementation notes**

- Lookup must require `email_verified_at IS NOT NULL` and a non-empty email.
- Do not reveal whether the username/email exists.
- Apply Turnstile if enabled (mirror login).
- Reuse `apps/api/src/lib/otp.ts`, rate-limit helpers, Resend templates (new email copy for reset).
- After success: do not auto-login (or do — stick to product decision above). Prefer **require login** with new password.

**UI**

- Forgot-password screen/flow from `AuthForm`.
- Steps: identify account → enter OTP → set new password → redirect to login.

**Tests**

- Happy path with verified email.
- Unverified email / missing email → generic success, no email sent.
- Wrong code / expired / too many attempts.
- Rate limits.
- Soft-deleted users ignored.

**Exit criteria:** Lost-password users with a previously verified email can regain access.

### Phase A4 — Hardening (optional follow-ups, not blocking v1)

- Email or username login (in addition to username).
- Link / unlink Google on an existing password account.
- Magic-link reset as alternative to OTP.
- Session revocation list or shorter JWT TTL after reset.
- Passkeys as long-term password replacement.

---

## Out of scope for Account Recovery v1

- SMS / phone recovery (`users.phone` unused)
- MFA / TOTP
- Backup codes
- Admin-initiated “force reset” tooling (admin reinstate already exists for soft-delete)
- Changing username via recovery

---

# Feature B — PWA + Web Push

## Problem

Notifications are written to D1 and pushed over WebSocket only. When the tab is closed:

- Inbox rows still accumulate (good).
- Users get no OS-level alert until they reopen the app (bad).

There is no installable PWA, service worker, VAPID setup, or push subscription storage.

## Prerequisites (must complete before implementation)

### B0. Product / platform decisions

Lock these before coding:

| Decision | Recommendation |
| --- | --- |
| Push scope | **Alert when subscribed + prefs allow**; keep D1 inbox as source of truth |
| Skip push if user online (WS connected)? | Optional optimization — **send push anyway on mobile**, or skip only when DO reports recipient online on desktop; simplest v1: **always send push if subscribed** (user can mute OS) |
| Which events push | Comments, mentions, follows/requests, system, DMs (once wired), gamification milestones; **likes off by default or respect `notifyLikes`** |
| Full offline shell vs push-only SW | **Push-first SW** (minimal); offline caching is a later milestone |
| iOS support | Document that iOS requires Add to Home Screen; ship manifest + icons accordingly |
| Admin broadcast fanout | Batch push; respect Worker CPU limits (queue or chunk) |

### B1. Hosting / origin prerequisites

- [ ] Web app served over **HTTPS** in production (required for SW + Push).
- [ ] Confirm web origin vs API origin (likely split). Service worker must live on the **web** origin; API only stores subscriptions and sends pushes.
- [ ] Decide how the web app learns the VAPID public key: `VITE_VAPID_PUBLIC_KEY` at build time **or** `GET /api/push/vapid-public-key`.
- [ ] Icons: provide at least 192×192 and 512×512 PNGs for the manifest (replace emoji-only favicon story for installability).
- [ ] Local dev strategy: HTTPS localhost or documented limitation that push may only work in deployed preview.

### B2. Crypto / Worker prerequisites

- [ ] Generate a VAPID key pair once; store private key as Worker secret (`VAPID_PRIVATE_KEY`), public as var/secret (`VAPID_PUBLIC_KEY`), subject (`VAPID_SUBJECT` = `mailto:…` or site URL).
- [ ] Confirm Web Push send approach on Cloudflare Workers (Web Crypto + VAPID JWT; **not** Node `web-push` as a drop-in). Spike a single test send before wiring all writers.
- [ ] Add types to `apps/api/src/types.ts` Env for VAPID secrets.

### B3. Schema / prefs prerequisites

- [ ] Design `push_subscriptions` table (see Phase B2) and next migration number after `0042`.
- [ ] Decide settings model:
  - New `notifyPushEnabled` (master) **plus** reuse existing per-type prefs, **or**
  - Master only and always respect existing `notifyLikes` / etc.
  - Recommend: **`notifyPushEnabled` master + existing per-type gates**.
- [ ] Plan to **wire `notifyDms`** when adding DM push (today it is a no-op for inbox).

### B4. Dependency on notification writers

- [ ] Inventory all call sites that insert into `notifications` and broadcast via DO — push must hook the same path (central helper preferred over N copies).
- [ ] Confirm block/mute (`shouldDeliverNotification`) and `isNotificationEnabled` remain the gates for push too.

---

## Plan B — PWA + Web Push (phased)

### Phase B1 — Installable PWA shell (no push yet)

1. Add `manifest.webmanifest` (name, short_name, start_url, display `standalone`, theme/background colors, icons).
2. Link manifest + `theme-color` from `apps/web/index.html`.
3. Add app icons under `apps/web/public/`.
4. Optional: `vite-plugin-pwa` **or** a hand-rolled minimal service worker registered from the app entry — for this phase the SW can be a no-op/`skipWaiting` stub to prove installability.
5. Document “Add to Home Screen” for iOS/Android in an internal note (short section in this file or README is enough).

**Exit criteria:** Production (or preview) site is installable as a PWA; no push required yet.

### Phase B2 — Subscription storage + API

**Schema (`push_subscriptions`)**

| Column | Notes |
| --- | --- |
| `id` | PK |
| `user_id` | FK → users |
| `endpoint` | Unique; push service URL |
| `p256dh` | Client public key |
| `auth` | Auth secret |
| `user_agent` | Optional diagnostics |
| `created_at` / `updated_at` | ISO timestamps |

**API**

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/api/push/vapid-public-key` | Optional/public | Return public key |
| `POST` | `/api/push/subscribe` | Yes | Upsert subscription for current user |
| `DELETE` | `/api/push/subscribe` | Yes | Remove by endpoint (body or query) |
| `GET` | `/api/users/me/settings` | Yes | Include `notifyPushEnabled` once added |

**Exit criteria:** Client can register a subscription row in D1; unsubscribe cleans it up.

### Phase B3 — Service worker + permission UX

1. SW `push` handler: parse JSON payload → `showNotification` with title/body/icon/data URL.
2. SW `notificationclick`: focus existing client or open deep link (`/posts/:id`, profile, etc. — mirror `NotificationItem` navigation).
3. Frontend: permission prompt from profile settings (not on first paint); register SW; subscribe with VAPID public key; POST to API.
4. Respect master toggle + browser permission state in UI (granted / denied / default).
5. On logout: optionally unsubscribe locally (keep or delete server row — recommend **delete current endpoint** on logout to avoid ghost alerts on shared devices).

**Exit criteria:** Manual test: subscribe → server sends one test push → OS notification opens the right route.

### Phase B4 — Send path wired to existing notification creators

1. Centralize in `apps/api/src/lib/notifications.ts` (or new `lib/push.ts`):
   - After successful D1 insert + existing DO broadcast,
   - Load subscriptions for `recipientId`,
   - If `notifyPushEnabled` and `isNotificationEnabled` and block/mute pass → send Web Push.
2. Payload: `{ title, body, url, notificationId, type }` — keep small.
3. Handle `410 Gone` / `404` from push services by deleting the subscription row.
4. Admin broadcast: chunked sends; do not block the HTTP request on thousands of fetches — use `waitUntil` / batched async work within Worker limits.
5. DM path (if in scope): either create inbox rows for messages or send push-only for DMs while enforcing `notifyDms`.

**Default push candidates**

| Type | Push? |
| --- | --- |
| `comment`, `mention` | Yes |
| `follow`, `follow_request`, `follow_accepted` | Yes |
| `system` | Yes (when delivery includes notification) |
| `badge_award`, `level_up`, `event_win` | Yes (milestones only — already the inbox model) |
| `like` | Respect `notifyLikes` (often noisy) |
| `message` / DM | Yes once wired to `notifyDms` |

**Exit criteria:** Closing the tab still yields OS notifications for subscribed users; inbox remains consistent when they return.

### Phase B5 — Polish (follow-up)

- Quiet hours / per-device management UI.
- Collapse / debounce bursty likes.
- Full offline asset caching (app shell).
- Badging API (`navigator.setAppBadge`) synced with unread count.
- E2E coverage where Playwright + permissions allow; otherwise API unit tests for gate + 410 cleanup.

---

## Out of scope for PWA / Push v1

- Native iOS/Android apps
- Email digests as a substitute for push
- Replacing WebSocket realtime while the tab is open
- Full offline-first sync of feed/chat

---

# Shared Delivery Order

Recommended sequencing across both features:

```
1. Land / verify email OTP + Resend secrets          (prereq A1)
2. Phase A1 — change password                        (recovery)
3. Phase A2 — email verify nudge                     (recovery)
4. Phase B1 — PWA manifest + icons                   (push)
5. Phase A3 — password reset OTP                     (recovery)
6. Phase B2–B3 — subscriptions + SW + permission UX  (push)
7. Phase B4 — wire send into notification writers    (push)
8. Optional A4 / B5 hardening
```

Rationale: recovery Phase A1–A2 unblocks locked-out risk for users who can still log in; PWA shell is independent and can proceed in parallel with A3; do not send Web Push until subscription + SW paths are proven with a test notification.

---

# Testing Checklist

### Account recovery

- [ ] Change password: success, wrong current, Google-only rejection
- [ ] Reset request: verified email receives OTP; unverified/missing gets silent no-op
- [ ] Reset verify: success, expired, bad code, rate limit, soft-deleted user
- [ ] Turnstile when enabled
- [ ] Audit events recorded
- [ ] Enumeration: responses identical for unknown vs known username

### PWA + Web Push

- [ ] Manifest installs on desktop Chrome/Edge
- [ ] iOS Add to Home Screen shows icon + standalone (manual)
- [ ] Subscribe / unsubscribe persists in D1
- [ ] Test push received with tab closed
- [ ] Notification click deep-links correctly
- [ ] Prefs + mute + block respected
- [ ] Gone endpoints removed
- [ ] Admin broadcast does not blow Worker limits (chunked)

---

# Key Files (implementation map)

### Account recovery

| Area | Path |
| --- | --- |
| Auth routes | `apps/api/src/routes/auth.ts` |
| Email / OTP | `apps/api/src/routes/email.ts`, `apps/api/src/lib/otp.ts`, `apps/api/src/lib/email/resend.ts` |
| Password verify helpers | `apps/api/src/lib/user-lifecycle.ts` |
| Schema | `packages/db/src/schema.ts` (`otp_challenges`, `users`) |
| Types | `packages/types/src/index.ts` |
| Auth UI | `apps/web/src/components/auth/AuthForm.tsx` |
| Profile UI | `apps/web/src/components/profile/EmailVerificationSection.tsx`, settings panels |

### PWA + Web Push

| Area | Path |
| --- | --- |
| Notification writers | `apps/api/src/lib/notifications.ts` + route call sites |
| Prefs | `apps/api/src/lib/user-settings.ts`, `ProfileSettingsPanel.tsx` |
| Realtime (keep) | `apps/api/src/durable-objects/realtime.ts` |
| Web entry / HTML | `apps/web/index.html`, `apps/web/src/main.tsx` (or `App.tsx`) |
| Inbox UI (deep links to mirror) | `apps/web/src/components/notifications/*` |
| Env | `apps/api/wrangler.toml`, `apps/api/.dev.vars.example`, `apps/api/src/types.ts` |

---

# Success Criteria

**Account recovery:** A password user who previously verified email while logged in can regain access after forgetting their password, without admin intervention. Logged-in users can change their password.

**PWA + Web Push:** A subscribed user receives an OS notification for a high-signal event while no Hin tab is open, and tapping it opens the relevant in-app surface. The existing inbox + WebSocket path continues to work unchanged when the app is open.
