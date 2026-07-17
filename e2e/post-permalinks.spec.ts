import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, loginUser, uniqueUsername } from './helpers/auth';
import {
  createPostViaApi,
  registerViaApi,
  sendFollowRequestViaApi,
  setPrivateViaApi,
} from './helpers/follows';
import {
  approveFollowRequestViaApi,
  createCommentViaApi,
  deletePostViaApi,
  getPostViaApi,
  likeCommentViaApi,
  likePostViaApi,
} from './helpers/permalinks';

test.describe('Post permalinks API', () => {
  test('GET /api/posts/:id returns public post to guest', async () => {
    const author = await registerViaApi(uniqueUsername('pl_api_guest'), DEFAULT_PASSWORD);
    const content = `API public ${Date.now()}`;
    const post = await createPostViaApi(author.token, content, { visibility: 'public' });

    const res = await getPostViaApi(null, post.id);
    expect(res.status).toBe(200);
    expect(res.data.content).toBe(content);
  });

  test('GET /api/posts/:id returns 403 for followers-only post to guest', async () => {
    const author = await registerViaApi(uniqueUsername('pl_api_fol_guest'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Followers API ${Date.now()}`, {
      visibility: 'followers',
    });

    const res = await getPostViaApi(null, post.id);
    expect(res.status).toBe(403);
  });

  test('GET /api/posts/:id returns 403 for only_me post to non-author', async () => {
    const author = await registerViaApi(uniqueUsername('pl_api_only_author'), DEFAULT_PASSWORD);
    const viewer = await registerViaApi(uniqueUsername('pl_api_only_viewer'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Only me API ${Date.now()}`, {
      visibility: 'only_me',
    });

    const guestRes = await getPostViaApi(null, post.id);
    expect(guestRes.status).toBe(403);

    const viewerRes = await getPostViaApi(viewer.token, post.id);
    expect(viewerRes.status).toBe(403);
  });

  test('GET /api/posts/:id returns only_me post to author', async () => {
    const author = await registerViaApi(uniqueUsername('pl_api_only_author_ok'), DEFAULT_PASSWORD);
    const content = `Only me author ${Date.now()}`;
    const post = await createPostViaApi(author.token, content, { visibility: 'only_me' });

    const res = await getPostViaApi(author.token, post.id);
    expect(res.status).toBe(200);
    expect(res.data.content).toBe(content);
  });

  test('GET /api/posts/:id returns followers post to approved follower', async () => {
    const author = await registerViaApi(uniqueUsername('pl_api_fol_author'), DEFAULT_PASSWORD);
    const follower = await registerViaApi(uniqueUsername('pl_api_fol_follower'), DEFAULT_PASSWORD);
    const content = `Followers follower OK ${Date.now()}`;
    const post = await createPostViaApi(author.token, content, { visibility: 'followers' });

    await sendFollowRequestViaApi(follower.token, author.userId);

    const res = await getPostViaApi(follower.token, post.id);
    expect(res.status).toBe(200);
    expect(res.data.content).toBe(content);
  });

  test('GET /api/posts/:id returns followers post after private account follow approval', async () => {
    const author = await registerViaApi(uniqueUsername('pl_api_priv_author'), DEFAULT_PASSWORD);
    const follower = await registerViaApi(uniqueUsername('pl_api_priv_follower'), DEFAULT_PASSWORD);
    const content = `Private follow OK ${Date.now()}`;
    const post = await createPostViaApi(author.token, content, { visibility: 'followers' });

    await setPrivateViaApi(author.token);
    await sendFollowRequestViaApi(follower.token, author.userId);
    await approveFollowRequestViaApi(author.token, follower.userId);

    const res = await getPostViaApi(follower.token, post.id);
    expect(res.status).toBe(200);
    expect(res.data.content).toBe(content);
  });

  test('GET /api/posts/:id returns 403 for followers post to non-follower', async () => {
    const author = await registerViaApi(uniqueUsername('pl_api_fol_no'), DEFAULT_PASSWORD);
    const stranger = await registerViaApi(uniqueUsername('pl_api_fol_stranger'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Followers deny ${Date.now()}`, {
      visibility: 'followers',
    });

    const res = await getPostViaApi(stranger.token, post.id);
    expect(res.status).toBe(403);
  });

  test('GET /api/posts/:id returns 404 for deleted post', async () => {
    const author = await registerViaApi(uniqueUsername('pl_api_deleted'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Deleted ${Date.now()}`);
    await deletePostViaApi(author.token, post.id);

    const res = await getPostViaApi(author.token, post.id);
    expect(res.status).toBe(404);
  });

  test('GET /api/posts/:id returns 404 for non-existent post', async () => {
    const res = await getPostViaApi(null, 999999999);
    expect(res.status).toBe(404);
  });
});

test.describe('Post permalinks UI — visibility', () => {
  test('guest can open public post at /post/:id', async ({ page }) => {
    const authorName = uniqueUsername('permalink_guest');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Guest visible post ${Date.now()}`;
    const post = await createPostViaApi(author.token, content, { visibility: 'public' });

    await page.goto(`/post/${post.id}`);
    await expect(page.getByText(content)).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Sign in to comment')).toBeVisible();
  });

  test('guest sees sign-in prompt for followers-only post', async ({ page }) => {
    const author = await registerViaApi(uniqueUsername('permalink_private'), DEFAULT_PASSWORD);
    const content = `Followers only ${Date.now()}`;
    const post = await createPostViaApi(author.token, content, { visibility: 'followers' });

    await page.goto(`/post/${post.id}`);
    await expect(page.getByText('This post is not available')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in to view' })).toBeVisible();
  });

  test('guest sees sign-in prompt for only_me post', async ({ page }) => {
    const author = await registerViaApi(uniqueUsername('permalink_only_guest'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Only me guest ${Date.now()}`, {
      visibility: 'only_me',
    });

    await page.goto(`/post/${post.id}`);
    await expect(page.getByText('This post is not available')).toBeVisible();
  });

  test('logged-in non-follower sees forbidden for followers-only post', async ({ page }) => {
    const authorName = uniqueUsername('permalink_fol_author');
    const viewerName = uniqueUsername('permalink_fol_viewer');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Followers UI deny ${Date.now()}`, {
      visibility: 'followers',
    });

    await registerViaApi(viewerName, DEFAULT_PASSWORD);
    await loginUser(page, viewerName);
    await page.goto(`/post/${post.id}`);
    await expect(page.getByText('This post is not available')).toBeVisible();
  });

  test('approved follower can open followers-only permalink', async ({ page }) => {
    const authorName = uniqueUsername('permalink_fol_ok_author');
    const followerName = uniqueUsername('permalink_fol_ok_follower');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const follower = await registerViaApi(followerName, DEFAULT_PASSWORD);
    const content = `Followers UI OK ${Date.now()}`;
    const post = await createPostViaApi(author.token, content, { visibility: 'followers' });

    await sendFollowRequestViaApi(follower.token, author.userId);

    await loginUser(page, followerName);
    await page.goto(`/post/${post.id}`);
    await expect(page.getByText(content)).toBeVisible();
  });

  test('author can open only_me permalink', async ({ page }) => {
    const authorName = uniqueUsername('permalink_only_author');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Only me author UI ${Date.now()}`;
    const post = await createPostViaApi(author.token, content, { visibility: 'only_me' });

    await loginUser(page, authorName);
    await page.goto(`/post/${post.id}`);
    await expect(page.getByText(content)).toBeVisible();
  });

  test('logged-in non-author sees forbidden for only_me post', async ({ page }) => {
    const authorName = uniqueUsername('permalink_only_auth');
    const viewerName = uniqueUsername('permalink_only_view');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Only me deny ${Date.now()}`, {
      visibility: 'only_me',
    });

    await registerViaApi(viewerName, DEFAULT_PASSWORD);
    await loginUser(page, viewerName);
    await page.goto(`/post/${post.id}`);
    await expect(page.getByText('This post is not available')).toBeVisible();
  });

  test('deleted post shows not found in UI', async ({ page }) => {
    const authorName = uniqueUsername('permalink_deleted');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `To delete ${Date.now()}`);
    await deletePostViaApi(author.token, post.id);

    await page.goto(`/post/${post.id}`);
    await expect(page.getByText('Post not found').first()).toBeVisible();
  });

  test('non-existent post shows not found in UI', async ({ page }) => {
    await page.goto('/post/999999999');
    await expect(page.getByText('Post not found').first()).toBeVisible();
  });
});

test.describe('Post permalinks UI — navigation', () => {
  test('logged-in user opens permalink directly with comments expanded', async ({ page }) => {
    const authorName = uniqueUsername('permalink_user');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Direct permalink ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);
    const commentText = `Permalink comment ${Date.now()}`;
    await createCommentViaApi(author.token, post.id, commentText);

    await loginUser(page, authorName);
    await page.goto(`/post/${post.id}`);
    await expect(page.getByText(content)).toBeVisible();
    await expect(page.getByText(commentText)).toBeVisible();
  });

  test('back to home from post view returns to feed', async ({ page }) => {
    const authorName = uniqueUsername('permalink_back');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Back button post ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    await loginUser(page, authorName);
    await page.goto(`/post/${post.id}`);
    await expect(page.getByText(content)).toBeVisible();
    await page.getByRole('button', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByText(content)).toBeVisible();
  });

  test('browser back from post returns to previous page', async ({ page }) => {
    const authorName = uniqueUsername('permalink_history');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `History post ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    await loginUser(page, authorName);
    await page.goto('/');
    await expect(page.getByText(content)).toBeVisible();
    await page.goto(`/post/${post.id}`);
    await expect(page).toHaveURL(new RegExp(`/post/${post.id}$`));
    await page.goBack();
    await expect(page).toHaveURL('/');
  });

  test('comment anchor scrolls target into view', async ({ page }) => {
    const author = await registerViaApi(uniqueUsername('permalink_anchor'), DEFAULT_PASSWORD);
    const content = `Anchor post ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);
    const commentText = `Anchor comment ${Date.now()}`;
    const comment = await createCommentViaApi(author.token, post.id, commentText);

    await page.goto(`/post/${post.id}#comment-${comment.id}`);
    await expect(page.getByText(content)).toBeVisible();
    const commentEl = page.locator(`#comment-${comment.id}`);
    await expect(commentEl).toBeVisible();
    await expect(commentEl).toBeInViewport();
  });

  test('guest sign-in from post page stays on permalink', async ({ page }) => {
    const authorName = uniqueUsername('permalink_guest_login');
    const guestName = uniqueUsername('permalink_guest_user');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await registerViaApi(guestName, DEFAULT_PASSWORD);
    const content = `Guest login post ${Date.now()}`;
    const post = await createPostViaApi(author.token, content, { visibility: 'public' });

    await page.goto(`/post/${post.id}`);
    await expect(page.getByText(content)).toBeVisible();
    await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click();
    await page.getByPlaceholder('Enter username').fill(guestName);
    await page.getByPlaceholder('••••••••').fill(DEFAULT_PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/post/${post.id}$`));
    await expect(page.getByText(content)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
    await expect(page.getByPlaceholder('Write a comment...')).toBeVisible();
  });

  test('home feed still loads after permalink feature', async ({ page }) => {
    const userName = uniqueUsername('permalink_feed');
    const user = await registerViaApi(userName, DEFAULT_PASSWORD);
    const content = `Feed regression ${Date.now()}`;
    await createPostViaApi(user.token, content);

    await loginUser(page, userName);
    await page.goto('/');
    await expect(page.getByText(content)).toBeVisible();
  });
});

test.describe('Post permalinks UI — notifications & toasts', () => {
  test('like notification click navigates to post permalink', async ({ browser }) => {
    const authorName = uniqueUsername('permalink_notif_like');
    const likerName = uniqueUsername('permalink_notif_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Like notif post ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);

    await authorPage.getByRole('button', { name: 'Notifications' }).click();
    const notifItem = authorPage.locator('[data-notification-item]').filter({ hasText: likerName }).first();
    await expect(notifItem).toBeVisible();
    await notifItem.click();

    await expect(authorPage).toHaveURL(new RegExp(`/post/${post.id}$`));
    await expect(authorPage.getByText(content)).toBeVisible();

    await authorContext.close();
  });

  test('comment notification click navigates to post with comment anchor', async ({ browser }) => {
    const authorName = uniqueUsername('permalink_notif_comment');
    const commenterName = uniqueUsername('permalink_notif_commenter');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Comment notif post ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const commenter = await registerViaApi(commenterName, DEFAULT_PASSWORD);
    const comment = await createCommentViaApi(commenter.token, post.id, `Hello ${Date.now()}`);

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);

    await authorPage.getByRole('button', { name: 'Notifications' }).click();
    const notifItem = authorPage.locator('[data-notification-item]').filter({ hasText: commenterName }).first();
    await expect(notifItem).toBeVisible();
    await notifItem.click();

    await expect(authorPage).toHaveURL(new RegExp(`/post/${post.id}#comment-${comment.id}$`));
    await expect(authorPage.getByText(content)).toBeVisible();
    await expect(authorPage.locator(`#comment-${comment.id}`)).toBeVisible();

    await authorContext.close();
  });

  test('mention notification click navigates to post permalink', async ({ browser }) => {
    const authorName = uniqueUsername('permalink_notif_mention_author');
    const mentionerName = uniqueUsername('permalink_notif_mentioner');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const mentioner = await registerViaApi(mentionerName, DEFAULT_PASSWORD);
    const content = `Mention notif post ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    await createCommentViaApi(mentioner.token, post.id, `Hey @${authorName} check this ${Date.now()}`);

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);

    await authorPage.getByRole('button', { name: 'Notifications' }).click();
    const notifItem = authorPage.locator('[data-notification-item]').filter({ hasText: mentionerName }).first();
    await expect(notifItem).toBeVisible();
    await notifItem.click();

    await expect(authorPage).toHaveURL(new RegExp(`/post/${post.id}`));
    await expect(authorPage.getByText(content)).toBeVisible();

    await authorContext.close();
  });

  test('comment-like notification click navigates to post with comment anchor', async ({ browser }) => {
    const authorName = uniqueUsername('permalink_notif_cl_author');
    const likerName = uniqueUsername('permalink_notif_cl_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Comment like post ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);
    const comment = await createCommentViaApi(author.token, post.id, `Like this ${Date.now()}`);

    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likeCommentViaApi(liker.token, comment.id);

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);

    await authorPage.getByRole('button', { name: 'Notifications' }).click();
    const notifItem = authorPage.locator('[data-notification-item]').filter({ hasText: likerName }).first();
    await expect(notifItem).toBeVisible();
    await notifItem.click();

    await expect(authorPage).toHaveURL(new RegExp(`/post/${post.id}#comment-${comment.id}$`));
    await expect(authorPage.locator(`#comment-${comment.id}`)).toBeVisible();

    await authorContext.close();
  });

  test('toast click navigates to post permalink', async ({ browser }) => {
    const authorName = uniqueUsername('permalink_toast_author');
    const likerName = uniqueUsername('permalink_toast_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Toast target ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);
    await expect(authorPage.getByText(content)).toBeVisible();

    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    const toast = authorPage.getByRole('button').filter({ hasText: likerName });
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await toast.click();

    await expect(authorPage).toHaveURL(new RegExp(`/post/${post.id}$`));
    await expect(authorPage.getByText(content)).toBeVisible();

    await authorContext.close();
  });
});
