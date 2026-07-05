import { test, expect } from '@playwright/test';
import {
  DEFAULT_PASSWORD,
  loginUser,
  uniqueUsername,
} from './helpers/auth';
import {
  switchFeedMode,
  createPostViaApi,
  registerViaApi,
  setPrivateViaApi,
  sendFollowRequestViaApi,
  followViaApi,
  openProfileForUsername,
  approveFollowRequest,
} from './helpers/follows';

test.describe('Post visibility', () => {
  test('private account public post visible in Everyone feed and profile', async ({ browser }) => {
    const privateName = uniqueUsername('vis_private');
    const viewerName = uniqueUsername('vis_viewer');

    const privateUser = await registerViaApi(privateName, DEFAULT_PASSWORD);
    await setPrivateViaApi(privateUser.token);
    const publicPost = `Public from private ${Date.now()}`;
    await createPostViaApi(privateUser.token, publicPost, { visibility: 'public' });

    const viewer = await registerViaApi(viewerName, DEFAULT_PASSWORD);

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await loginUser(viewerPage, viewerName);

    await switchFeedMode(viewerPage, 'Everyone');
    await expect(viewerPage.getByText(publicPost)).toBeVisible();

    await openProfileForUsername(viewerPage, privateName);
    await expect(viewerPage.getByText(publicPost)).toBeVisible();

    await viewerContext.close();
  });

  test('followers post hidden until follow is approved', async ({ browser }) => {
    const privateName = uniqueUsername('vis_followers');
    const viewerName = uniqueUsername('vis_followers_viewer');

    const privateUser = await registerViaApi(privateName, DEFAULT_PASSWORD);
    await setPrivateViaApi(privateUser.token);
    const followersPost = `Followers only ${Date.now()}`;
    await createPostViaApi(privateUser.token, followersPost, { visibility: 'followers' });

    const viewer = await registerViaApi(viewerName, DEFAULT_PASSWORD);
    await sendFollowRequestViaApi(viewer.token, privateUser.userId);

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await loginUser(ownerPage, privateName);
    await ownerPage.locator('header').getByRole('button', { name: privateName }).click();
    await approveFollowRequest(ownerPage, viewerName);
    await ownerContext.close();

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await loginUser(viewerPage, viewerName);

    await switchFeedMode(viewerPage, 'Everyone');
    await expect(viewerPage.getByText(followersPost)).not.toBeVisible();

    await switchFeedMode(viewerPage, 'Following');
    await expect(viewerPage.getByText(followersPost)).toBeVisible();

    await viewerContext.close();
  });

  test('only_me post visible only to author', async ({ browser }) => {
    const authorName = uniqueUsername('vis_onlyme');
    const viewerName = uniqueUsername('vis_onlyme_viewer');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const onlyMePost = `Only me ${Date.now()}`;
    await createPostViaApi(author.token, onlyMePost, { visibility: 'only_me' });

    const viewer = await registerViaApi(viewerName, DEFAULT_PASSWORD);
    await followViaApi(viewer.token, author.userId);

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await loginUser(viewerPage, viewerName);

    await switchFeedMode(viewerPage, 'Following');
    await expect(viewerPage.getByText(onlyMePost)).not.toBeVisible();

    await viewerContext.close();

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);
    await authorPage.locator('header').getByRole('button', { name: authorName }).click();
    await expect(authorPage.getByText(onlyMePost)).toBeVisible();
    await authorContext.close();
  });

  test('defaults to public when visibility omitted', async () => {
    const authorName = uniqueUsername('vis_default');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Default public ${Date.now()}`);
    expect(post.visibility).toBe('public');
  });
});
