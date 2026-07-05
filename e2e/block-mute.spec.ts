import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, loginUser, registerUser, uniqueUsername } from './helpers/auth';
import {
  createPostViaApi,
  registerViaApi,
  followViaApi,
  switchFeedMode,
} from './helpers/follows';
import {
  muteFromProfile,
  blockFromProfile,
  blockViaApi,
  muteViaApi,
  likePostViaApi,
  openProfileForUsername,
  expandBlockedMutedSection,
  expectUserNotFoundOnProfile,
  fetchNotificationsViaApi,
  settingsPanel,
} from './helpers/block-mute';

test.describe('Mute', () => {
  test('muting hides author posts from Everyone feed', async ({ page }) => {
    const authorName = uniqueUsername('mute_author');
    const viewerName = uniqueUsername('mute_viewer');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const postContent = `Mute test post ${Date.now()}`;
    await createPostViaApi(author.token, postContent);

    await registerUser(page, viewerName);
    await expect(page.getByText(postContent)).toBeVisible();

    await openProfileForUsername(page, authorName);
    await muteFromProfile();

    await page.getByRole('button', { name: 'Back to Home' }).click();
    await expect(page.getByText(postContent)).not.toBeVisible();
  });

  test('muting suppresses like notifications from muted user', async ({ page }) => {
    const authorName = uniqueUsername('mute_notif_author');
    const viewerName = uniqueUsername('mute_notif_viewer');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const viewer = await registerViaApi(viewerName, DEFAULT_PASSWORD);

    const postContent = `Muted like target ${Date.now()}`;
    const post = await createPostViaApi(viewer.token, postContent);

    await muteViaApi(viewer.token, author.userId);
    await likePostViaApi(author.token, post.id);

    await loginUser(page, viewerName);
    const notifications = await fetchNotificationsViaApi(viewer.token);
    const likeNotifs = notifications.filter(
      (n: { type: string; senderId: number }) => n.type === 'like' && n.senderId === author.userId,
    );
    expect(likeNotifs).toHaveLength(0);
  });
});

test.describe('Block', () => {
  test('blocking hides profile from blocked party', async ({ browser }) => {
    const blockerName = uniqueUsername('blocker');
    const blockedName = uniqueUsername('blocked_user');

    const blocker = await registerViaApi(blockerName, DEFAULT_PASSWORD);
    const blocked = await registerViaApi(blockedName, DEFAULT_PASSWORD);

    await blockViaApi(blocker.token, blocked.userId);

    const blockedContext = await browser.newContext();
    const blockedPage = await blockedContext.newPage();
    await loginUser(blockedPage, blockedName);

    await blockedPage.getByRole('button', { name: blockerName, exact: true }).first().click();
    await expectUserNotFoundOnProfile(blockedPage);

    await blockedContext.close();
  });

  test('blocking auto-unfollows and clears following feed', async ({ page }) => {
    const userAName = uniqueUsername('block_a');
    const userBName = uniqueUsername('block_b');

    const userA = await registerViaApi(userAName, DEFAULT_PASSWORD);
    const userB = await registerViaApi(userBName, DEFAULT_PASSWORD);

    const postContent = `Block unfollow post ${Date.now()}`;
    await createPostViaApi(userA.token, postContent);
    await followViaApi(userB.token, userA.userId);
    await followViaApi(userA.token, userB.userId);

    await blockViaApi(userB.token, userA.userId);

    await loginUser(page, userBName);
    await switchFeedMode(page, 'Following');
    await expect(page.getByText(postContent)).not.toBeVisible();
  });

  test('blocked user can be unblocked from settings', async ({ page }) => {
    const blockerName = uniqueUsername('settings_blocker');
    const targetName = uniqueUsername('settings_target');

    const blocker = await registerViaApi(blockerName, DEFAULT_PASSWORD);
    const target = await registerViaApi(targetName, DEFAULT_PASSWORD);

    await blockViaApi(blocker.token, target.userId);

    await loginUser(page, blockerName);
    await page.locator('header').getByRole('button', { name: blockerName, exact: true }).click();
    await expandBlockedMutedSection(page);

    const panel = settingsPanel(page);
    const row = panel.locator('li').filter({ hasText: targetName });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Unblock', exact: true }).click();
    await expect(row).toHaveCount(0);
  });

  test('block from profile shows unblock button', async ({ page }) => {
    const blockerName = uniqueUsername('ui_blocker');
    const targetName = uniqueUsername('ui_target');

    await registerViaApi(blockerName, DEFAULT_PASSWORD);
    await registerViaApi(targetName, DEFAULT_PASSWORD);

    await loginUser(page, blockerName);
    await openProfileForUsername(page, targetName);
    await blockFromProfile();
    await expect(page.getByRole('button', { name: 'Unblock' })).toBeVisible();
    await expect(page.getByText('You blocked this user')).toBeVisible();
  });
});
