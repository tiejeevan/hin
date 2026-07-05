import { test, expect } from '@playwright/test';
import {
  DEFAULT_PASSWORD,
  registerUser,
  loginUser,
  uniqueUsername,
} from './helpers/auth';
import {
  approveFollowRequest,
  openProfileSettings,
  switchFeedMode,
  createPostViaApi,
  registerViaApi,
  setPrivateViaApi,
  sendFollowRequestViaApi,
  followViaApi,
} from './helpers/follows';

test.describe('Public follow', () => {
  test('following feed shows posts from followed users', async ({ page }) => {
    const authorName = uniqueUsername('follow_author');
    const followerName = uniqueUsername('follow_fan');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const postContent = `Public follow post ${Date.now()}`;
    await createPostViaApi(author.token, postContent);

    const follower = await registerViaApi(followerName, DEFAULT_PASSWORD);
    await followViaApi(follower.token, author.userId);

    await loginUser(page, followerName);

    const followingFeed = page.waitForResponse(
      res => res.url().includes('/api/posts') && res.url().includes('following=true') && res.ok(),
    );
    await switchFeedMode(page, 'Following');
    await followingFeed;
    await expect(page.getByText(postContent)).toBeVisible();
  });
});

test.describe('Private account follow requests', () => {
  test('private posts hidden until follow is approved', async ({ browser }) => {
    const privateName = uniqueUsername('private_user');
    const viewerName = uniqueUsername('private_viewer');

    const privateUser = await registerViaApi(privateName, DEFAULT_PASSWORD);
    await setPrivateViaApi(privateUser.token);
    const secretPost = `Private only ${Date.now()}`;
    await createPostViaApi(privateUser.token, secretPost, { visibility: 'followers' });

    const viewer = await registerViaApi(viewerName, DEFAULT_PASSWORD);
    await sendFollowRequestViaApi(viewer.token, privateUser.userId);

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await loginUser(ownerPage, privateName);
    await ownerPage.locator('header').getByRole('button', { name: privateName }).click();
    await openProfileSettings(ownerPage);
    await expect(ownerPage.locator('#follow-requests-panel')).toBeVisible();
    await approveFollowRequest(ownerPage, viewerName);
    await ownerContext.close();

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await loginUser(viewerPage, viewerName);

    await switchFeedMode(viewerPage, 'Everyone');
    await expect(viewerPage.getByText(secretPost)).not.toBeVisible();

    await switchFeedMode(viewerPage, 'Following');
    await expect(viewerPage.getByText(secretPost)).toBeVisible();

    await viewerContext.close();
  });
});

test.describe('Private account UI', () => {
  test('user can toggle private account in profile settings', async ({ page }) => {
    const username = uniqueUsername('privacy_toggle');
    await registerUser(page, username);

    await page.locator('header').getByRole('button', { name: username }).click();
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await page.getByRole('switch', { name: 'Private account' }).click();
    await page.getByRole('button', { name: 'Save Profile' }).click();
    await expect(page.getByText('Private', { exact: true })).toBeVisible();
  });

});
