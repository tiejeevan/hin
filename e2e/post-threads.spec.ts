import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, uniqueUsername } from './helpers/auth';
import { createPostViaApi, registerViaApi } from './helpers/follows';
import {
  createThreadReplyViaApi,
  getFeedPostsViaApi,
  getThreadViaApi,
} from './helpers/threads';

test.describe('Post threads API', () => {
  test('author can thread; non-author blocked; feed shows only root', async () => {
    const author = await registerViaApi(uniqueUsername('thread_author'), DEFAULT_PASSWORD);
    const other = await registerViaApi(uniqueUsername('thread_other'), DEFAULT_PASSWORD);
    const root = await createPostViaApi(author.token, `Thread root ${Date.now()}`);

    const reply = await createThreadReplyViaApi(author.token, root.id, 'Part 2 of thread');
    expect(reply.status).toBe(200);
    expect(reply.data.parentPostId).toBe(root.id);
    expect(reply.data.threadRootId).toBe(root.id);

    const blocked = await createThreadReplyViaApi(other.token, root.id, 'Not allowed');
    expect(blocked.status).toBe(403);

    const thread = await getThreadViaApi(null, root.id);
    expect(thread.status).toBe(200);
    expect(thread.data.root.id).toBe(root.id);
    expect(thread.data.replies).toHaveLength(1);

    const feed = await getFeedPostsViaApi(other.token);
    const ids = feed.posts.map((p: { id: number }) => p.id);
    expect(ids).toContain(root.id);
    expect(ids).not.toContain(reply.data.id);
  });

  test('poll thread reply is rejected', async () => {
    const author = await registerViaApi(uniqueUsername('thread_poll'), DEFAULT_PASSWORD);
    const pollRes = await fetch(`${process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787'}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${author.token}`,
      },
      body: JSON.stringify({
        type: 'poll',
        question: 'Q?',
        options: [{ label: 'A' }, { label: 'B' }],
      }),
    });
    const pollPost = await pollRes.json();
    const blocked = await createThreadReplyViaApi(author.token, pollPost.id, 'reply');
    expect(blocked.status).toBe(400);
  });
});
