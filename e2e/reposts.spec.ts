import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, uniqueUsername } from './helpers/auth';
import { createPostViaApi, registerViaApi } from './helpers/follows';
import { fetchNotificationsViaApi, waitForNotificationViaApi } from './helpers/notifications';
import { patchSettingsViaApi } from './helpers/settings';
import {
  createThreadReplyStillRejected,
  getFeedViaApi,
  getPostViaApi,
  quoteViaApi,
  repostViaApi,
  unrepostViaApi,
} from './helpers/reposts';

test.describe('Repost & quote API', () => {
  test('silent repost appears in feed, notifies author, undo removes it', async () => {
    const authorName = uniqueUsername('repost_author');
    const fanName = uniqueUsername('repost_fan');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const fan = await registerViaApi(fanName, DEFAULT_PASSWORD);
    const original = await createPostViaApi(author.token, `Repost me ${Date.now()}`);

    const repost = await repostViaApi(fan.token, original.id);
    expect(repost.repostOfPostId).toBe(original.id);
    expect(repost.isQuote).toBe(false);
    expect(repost.repostedPost?.id).toBe(original.id);

    const feed = await getFeedViaApi(fan.token);
    expect(feed.posts.some(p => p.id === repost.id)).toBe(true);

    await waitForNotificationViaApi(
      author.token,
      n => n.type === 'repost' && n.senderId === fan.userId,
    );

    const undid = await unrepostViaApi(fan.token, original.id);
    expect(undid.reposted).toBe(false);

    const feedAfter = await getFeedViaApi(fan.token);
    expect(feedAfter.posts.some(p => p.id === repost.id)).toBe(false);

    const originalAfter = await getPostViaApi(author.token, original.id);
    expect(originalAfter.repostsCount).toBe(0);
    expect(originalAfter.hasReposted).toBe(false);
  });

  test('double silent repost is idempotent (one active row)', async () => {
    const author = await registerViaApi(uniqueUsername('repost_idem_a'), DEFAULT_PASSWORD);
    const fan = await registerViaApi(uniqueUsername('repost_idem_f'), DEFAULT_PASSWORD);
    const original = await createPostViaApi(author.token, `Idempotent ${Date.now()}`);

    const first = await repostViaApi(fan.token, original.id);
    const second = await repostViaApi(fan.token, original.id);
    expect(second.id).toBe(first.id);

    const checked = await getPostViaApi(fan.token, original.id);
    expect(checked.repostsCount).toBe(1);
    expect(checked.hasReposted).toBe(true);
  });

  test('quote requires commentary and notifies; empty quote rejected', async () => {
    const author = await registerViaApi(uniqueUsername('quote_author'), DEFAULT_PASSWORD);
    const fan = await registerViaApi(uniqueUsername('quote_fan'), DEFAULT_PASSWORD);
    const original = await createPostViaApi(author.token, `Quote me ${Date.now()}`);

    const emptyRes = await fetch(
      `${process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787'}/api/posts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${fan.token}`,
        },
        body: JSON.stringify({ content: '   ', quotePostId: original.id }),
      },
    );
    expect(emptyRes.ok).toBe(false);

    const commentary = `Great take ${Date.now()}`;
    const quote = await quoteViaApi(fan.token, original.id, commentary);
    expect(quote.isQuote).toBe(true);
    expect(quote.repostOfPostId).toBe(original.id);
    expect(quote.content).toBe(commentary);
    expect(quote.repostedPost?.id).toBe(original.id);

    await waitForNotificationViaApi(
      author.token,
      n => n.type === 'quote' && n.senderId === fan.userId,
    );
  });

  test('reposting a silent repost resolves to the original root', async () => {
    const author = await registerViaApi(uniqueUsername('root_author'), DEFAULT_PASSWORD);
    const mid = await registerViaApi(uniqueUsername('root_mid'), DEFAULT_PASSWORD);
    const fan = await registerViaApi(uniqueUsername('root_fan'), DEFAULT_PASSWORD);
    const original = await createPostViaApi(author.token, `Root ${Date.now()}`);
    const midRepost = await repostViaApi(mid.token, original.id);

    const fanRepost = await repostViaApi(fan.token, midRepost.id);
    expect(fanRepost.repostOfPostId).toBe(original.id);

    const checked = await getPostViaApi(fan.token, original.id);
    expect(checked.repostsCount).toBe(2);
  });

  test('notifyReposts pref off skips repost notification', async () => {
    const author = await registerViaApi(uniqueUsername('pref_author'), DEFAULT_PASSWORD);
    const fan = await registerViaApi(uniqueUsername('pref_fan'), DEFAULT_PASSWORD);
    await patchSettingsViaApi(author.token, { notifyReposts: false });
    const original = await createPostViaApi(author.token, `No notify ${Date.now()}`);

    await repostViaApi(fan.token, original.id);
    await new Promise(r => setTimeout(r, 800));

    const notifs = await fetchNotificationsViaApi(author.token);
    expect(notifs.some(n => n.type === 'repost' && n.senderId === fan.userId)).toBe(false);
  });

  test('legacy replyToPostId is ignored / does not create a thread child', async () => {
    const author = await registerViaApi(uniqueUsername('thread_gone'), DEFAULT_PASSWORD);
    const original = await createPostViaApi(author.token, `No threads ${Date.now()}`);

    const res = await createThreadReplyStillRejected(author.token, original.id);
    // Zod strips unknown keys — either 200 as a normal root post or 400.
    // Ensure feed only has root-level posts with no parentPostId from this call.
    if (res.ok) {
      const created = await res.json();
      expect(created.parentPostId == null).toBe(true);
    }

    const threadRes = await fetch(
      `${process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787'}/api/posts/${original.id}/thread`,
      { headers: { Authorization: `Bearer ${author.token}` } },
    );
    expect(threadRes.status).toBe(404);
  });

  test('silent repost inherits followers visibility', async () => {
    const author = await registerViaApi(uniqueUsername('vis_author'), DEFAULT_PASSWORD);
    const fan = await registerViaApi(uniqueUsername('vis_fan'), DEFAULT_PASSWORD);
    const original = await createPostViaApi(author.token, `Followers only ${Date.now()}`, {
      visibility: 'followers',
    });

    // Fan cannot view followers-only → cannot repost
    const res = await fetch(
      `${process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787'}/api/posts/${original.id}/repost`,
      { method: 'POST', headers: { Authorization: `Bearer ${fan.token}` } },
    );
    expect(res.status).toBe(403);
  });
});
