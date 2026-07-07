import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, uniqueUsername } from './helpers/auth';
import { registerViaApi, createPostViaApi } from './helpers/follows';
import { createCommentViaApi } from './helpers/permalinks';
import {
  loginAdminViaApi,
  setGamificationEnabledViaApi,
  getGamificationSettingsViaApi,
  createBadgeViaApi,
  sessionTickViaApi,
  getAdminUserGamificationViaApi,
  bootstrapViaApi,
  getMeGamificationViaApi,
  createEventViaApi,
  joinEventViaApi,
  updateEventViaApi,
  getAdminEventViaApi,
  getActiveEventsViaApi,
  countEventWinsViaD1,
} from './helpers/gamification';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

test.describe('Platform Reviver v4 smoke', () => {
  test('admin toggle on/off', async () => {
    const adminToken = await loginAdminViaApi();
    const wasOn = (await getGamificationSettingsViaApi(adminToken)).gamificationEnabled;

    expect(await setGamificationEnabledViaApi(adminToken, true)).toBe(true);
    expect((await getGamificationSettingsViaApi(adminToken)).gamificationEnabled).toBe(true);

    expect(await setGamificationEnabledViaApi(adminToken, false)).toBe(true);
    expect((await getGamificationSettingsViaApi(adminToken)).gamificationEnabled).toBe(false);

    await setGamificationEnabledViaApi(adminToken, wasOn);
  });

  test('badge CRUD + earn flow via posts', async () => {
    const adminToken = await loginAdminViaApi();
    await setGamificationEnabledViaApi(adminToken, true);

    const user = await registerViaApi(uniqueUsername('gami_badge'), DEFAULT_PASSWORD);
    const badgeName = `E2E Badge ${Date.now()}`;
    const badge = await createBadgeViaApi(adminToken, {
      name: badgeName,
      description: 'Publish one post',
      metricKey: 'total_posts',
      threshold: 1,
    });

    await createPostViaApi(user.token, `Earn badge ${Date.now()}`);

    const gam = await getMeGamificationViaApi(user.token);
    const earned = (gam.badges as Array<{ id: number; name: string }>).some(
      b => b.id === badge.id || b.name === badgeName,
    );
    expect(earned).toBe(true);

    const adminView = await getAdminUserGamificationViaApi(adminToken, user.userId);
    expect(adminView.status).toBe(200);
    expect(adminView.data.badges?.some((b: { name: string }) => b.name === badgeName)).toBe(true);
  });

  test('login streak via bootstrap', async () => {
    const adminToken = await loginAdminViaApi();
    await setGamificationEnabledViaApi(adminToken, true);

    const user = await registerViaApi(uniqueUsername('gami_streak'), DEFAULT_PASSWORD);
    await bootstrapViaApi(user.token);
    const again = await bootstrapViaApi(user.token);

    expect(again.gamificationEnabled).toBe(true);
    expect(again.g).toBeTruthy();

    const adminView = await getAdminUserGamificationViaApi(adminToken, user.userId);
    const streakCounter = adminView.data.counters?.find(
      (c: { label: string }) => c.label === 'Daily visit',
    );
    expect(streakCounter?.value).toBeGreaterThanOrEqual(1);
  });

  test('session tick increments total_session_minutes', async () => {
    const adminToken = await loginAdminViaApi();
    await setGamificationEnabledViaApi(adminToken, true);

    const user = await registerViaApi(uniqueUsername('gami_tick'), DEFAULT_PASSWORD);
    const tick = await sessionTickViaApi(user.token, 5);
    expect(tick.status).toBe(200);
    expect(tick.data.ok).toBe(true);

    const adminView = await getAdminUserGamificationViaApi(adminToken, user.userId);
    const minutes = adminView.data.counters?.find(
      (c: { label: string }) => c.label === 'Time on Hin',
    );
    expect(minutes?.value).toBeGreaterThanOrEqual(5);
  });

  test('event join + progress smoke', async () => {
    const adminToken = await loginAdminViaApi();
    await setGamificationEnabledViaApi(adminToken, true);

    const user = await registerViaApi(uniqueUsername('gami_event'), DEFAULT_PASSWORD);
    const now = new Date();
    const startsAt = new Date(now.getTime() - 60_000).toISOString();
    const endsAt = new Date(now.getTime() + 3_600_000).toISOString();

    const event = await createEventViaApi(adminToken, {
      name: `E2E Event ${Date.now()}`,
      startsAt,
      endsAt,
      status: 'active',
      requiresOptIn: true,
      rules: [{
        metricKey: 'total_comments',
        winType: 'threshold',
        config: { threshold: 1, prizeType: 'points', prizeRef: '10' },
      }],
    });

    expect(await joinEventViaApi(user.token, event.id)).toBe(true);

    const post = await createPostViaApi(user.token, 'Event post');
    await createCommentViaApi(user.token, post.id, 'Event comment');

    const leaderboardRes = await fetch(`${API_URL}/api/events/${event.id}/leaderboard`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(leaderboardRes.ok).toBe(true);
    const leaderboard = await leaderboardRes.json();
    expect(leaderboard.myScore).toBeGreaterThanOrEqual(1);
  });

  test('raffle event draws winner when event ends', async () => {
    const adminToken = await loginAdminViaApi();
    await setGamificationEnabledViaApi(adminToken, true);

    const userA = await registerViaApi(uniqueUsername('gami_raffle_a'), DEFAULT_PASSWORD);
    const userB = await registerViaApi(uniqueUsername('gami_raffle_b'), DEFAULT_PASSWORD);

    const now = new Date();
    const startsAt = new Date(now.getTime() - 60_000).toISOString();
    const endsAt = new Date(now.getTime() + 3_600_000).toISOString();

    const event = await createEventViaApi(adminToken, {
      name: `E2E Raffle ${Date.now()}`,
      startsAt,
      endsAt,
      status: 'active',
      requiresOptIn: true,
      rules: [{
        metricKey: 'total_comments',
        winType: 'raffle',
        config: { count: 1, prizeType: 'points', prizeRef: '25' },
      }],
    });

    expect(await joinEventViaApi(userA.token, event.id)).toBe(true);
    expect(await joinEventViaApi(userB.token, event.id)).toBe(true);

    const postA = await createPostViaApi(userA.token, 'Raffle post A');
    const postB = await createPostViaApi(userB.token, 'Raffle post B');
    await createCommentViaApi(userA.token, postA.id, 'Raffle comment A');
    await createCommentViaApi(userB.token, postB.id, 'Raffle comment B');

    const pointsBeforeA = (await getAdminUserGamificationViaApi(adminToken, userA.userId)).data.totalPoints ?? 0;
    const pointsBeforeB = (await getAdminUserGamificationViaApi(adminToken, userB.userId)).data.totalPoints ?? 0;

    const endedAt = new Date(Date.now() - 1_000).toISOString();
    await updateEventViaApi(adminToken, event.id, { endsAt: endedAt });

    await getActiveEventsViaApi(userA.token);

    const wins = await countEventWinsViaD1(event.id);
    expect(wins).toBe(1);

    const ended = await getAdminEventViaApi(adminToken, event.id);
    expect(ended?.status).toBe('ended');

    const afterA = (await getAdminUserGamificationViaApi(adminToken, userA.userId)).data;
    const afterB = (await getAdminUserGamificationViaApi(adminToken, userB.userId)).data;

    const winnerGotPoints =
      (afterA.totalPoints ?? 0) === pointsBeforeA + 25
      || (afterB.totalPoints ?? 0) === pointsBeforeB + 25;
    expect(winnerGotPoints).toBe(true);

    const winnerLedger = [...(afterA.recentLedger ?? []), ...(afterB.recentLedger ?? [])]
      .some((row: { actionType: string; delta: number }) => row.actionType === 'event_win' && row.delta === 25);
    expect(winnerLedger).toBe(true);
  });
});
