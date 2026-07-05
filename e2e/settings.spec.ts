import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, loginUser, registerUser, uniqueUsername } from './helpers/auth';
import {
  approveFollowRequest,
  createPostViaApi,
  registerViaApi,
  sendFollowRequestViaApi,
  setPrivateViaApi,
} from './helpers/follows';
import { createCommentViaApi, likePostViaApi } from './helpers/permalinks';
import {
  closeProfileSettings,
  collapseSettingsSection,
  DEFAULT_SETTINGS,
  expandSettingsSection,
  expectMessagesFabVisible,
  expectSectionCollapsed,
  expectSwitchState,
  getSettingsViaApi,
  NOTIFICATION_SWITCHES,
  openOwnProfile,
  openProfileSettings,
  openSettingsWithSection,
  patchSettingsViaApi,
  sectionButton,
  setChatIconMode,
  setChatPageChecked,
  setSwitchState,
  type UserSettingsApi,
} from './helpers/settings';

test.describe('Settings panel shell', () => {
  test('opens from profile gear and shows three collapsed sections', async ({ page }) => {
    const username = uniqueUsername('settings_shell');
    await registerUser(page, username);
    await openOwnProfile(page, username);
    await openProfileSettings(page);

    await expect(page.getByRole('heading', { name: 'Profile settings' })).toBeVisible();
    await expectSectionCollapsed(page, 'Privacy');
    await expectSectionCollapsed(page, 'Notifications');
    await expectSectionCollapsed(page, 'Chat');

    await expect(page.getByRole('switch', { name: 'Private account' })).not.toBeVisible();
    await expect(page.getByRole('switch', { name: 'Likes' })).not.toBeVisible();
    await expect(page.getByRole('radio', { name: 'Everywhere' })).not.toBeVisible();
  });

  test('close button hides the settings panel', async ({ page }) => {
    const username = uniqueUsername('settings_close');
    await registerUser(page, username);
    await openOwnProfile(page, username);
    await openProfileSettings(page);
    await closeProfileSettings(page);
    await expect(page.getByText('Profile settings')).not.toBeVisible();
  });

  test('only one section expands at a time (accordion)', async ({ page }) => {
    const username = uniqueUsername('settings_accordion');
    await registerUser(page, username);
    await openOwnProfile(page, username);
    await openProfileSettings(page);

    await expandSettingsSection(page, 'Privacy');
    await expect(page.getByRole('switch', { name: 'Private account' })).toBeVisible();
    await expectSectionCollapsed(page, 'Notifications');
    await expectSectionCollapsed(page, 'Chat');

    await expandSettingsSection(page, 'Notifications');
    await expectSectionCollapsed(page, 'Privacy');
    await expect(page.getByRole('switch', { name: 'Likes' })).toBeVisible();

    await expandSettingsSection(page, 'Chat');
    await expectSectionCollapsed(page, 'Notifications');
    await expect(page.getByRole('radio', { name: 'Everywhere' })).toBeVisible();
  });

  test('clicking an open section header collapses it', async ({ page }) => {
    const username = uniqueUsername('settings_collapse');
    await registerUser(page, username);
    await openOwnProfile(page, username);
    await openProfileSettings(page);

    await expandSettingsSection(page, 'Privacy');
    await collapseSettingsSection(page, 'Privacy');
    await expect(page.getByRole('switch', { name: 'Private account' })).not.toBeVisible();
  });
});

test.describe('Settings API defaults', () => {
  test('new user receives default settings from GET /api/users/me/settings', async () => {
    const user = await registerViaApi(uniqueUsername('settings_defaults'), DEFAULT_PASSWORD);
    const settings = await getSettingsViaApi(user.token);

    expect(settings.isPrivate).toBe(DEFAULT_SETTINGS.isPrivate);
    expect(settings.notifyLikes).toBe(DEFAULT_SETTINGS.notifyLikes);
    expect(settings.notifyComments).toBe(DEFAULT_SETTINGS.notifyComments);
    expect(settings.notifyMentions).toBe(DEFAULT_SETTINGS.notifyMentions);
    expect(settings.notifyDms).toBe(DEFAULT_SETTINGS.notifyDms);
    expect(settings.notifySystem).toBe(DEFAULT_SETTINGS.notifySystem);
    expect(settings.muteAllToasts).toBe(DEFAULT_SETTINGS.muteAllToasts);
    expect(settings.chatIconMode).toBe(DEFAULT_SETTINGS.chatIconMode);
    expect(settings.chatIconPages).toEqual(DEFAULT_SETTINGS.chatIconPages);
  });
});

test.describe('Privacy settings', () => {
  test('private account toggle shows badge and persists after reload', async ({ page }) => {
    const username = uniqueUsername('settings_private');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    await loginUser(page, username);

    await openSettingsWithSection(page, username, 'Privacy');
    await setSwitchState(page, 'Private account', true);
    await expect(page.getByText('Private', { exact: true })).toBeVisible();

    const apiSettings = await getSettingsViaApi(user.token);
    expect(apiSettings.isPrivate).toBe(true);

    await page.reload();
    await openOwnProfile(page, username);
    await expect(page.getByText('Private', { exact: true })).toBeVisible();

    await openProfileSettings(page);
    await expandSettingsSection(page, 'Privacy');
    await expectSwitchState(page, 'Private account', true);
  });

  test('private account can be turned off again', async ({ page }) => {
    const username = uniqueUsername('settings_public');
    await registerViaApi(username, DEFAULT_PASSWORD);
    await loginUser(page, username);

    await openSettingsWithSection(page, username, 'Privacy');
    await setSwitchState(page, 'Private account', true);
    await setSwitchState(page, 'Private account', false);
    await expect(page.getByText('Private', { exact: true })).not.toBeVisible();
  });

  test('shows empty follow requests state when none pending', async ({ page }) => {
    const username = uniqueUsername('settings_no_requests');
    await registerUser(page, username);
    await openSettingsWithSection(page, username, 'Privacy');
    await expect(page.getByText('No pending follow requests.')).toBeVisible();
  });

  test('shows pending count badge on collapsed Privacy section', async ({ browser }) => {
    const ownerName = uniqueUsername('settings_badge_owner');
    const requesterName = uniqueUsername('settings_badge_req');

    const owner = await registerViaApi(ownerName, DEFAULT_PASSWORD);
    await setPrivateViaApi(owner.token);
    const requester = await registerViaApi(requesterName, DEFAULT_PASSWORD);
    await sendFollowRequestViaApi(requester.token, owner.userId);

    const page = await browser.newPage();
    await loginUser(page, ownerName);
    await openOwnProfile(page, ownerName);
    await openProfileSettings(page);

    const privacyButton = sectionButton(page, 'Privacy');
    await expect(privacyButton).toContainText('1');
    await expectSectionCollapsed(page, 'Privacy');

    await page.close();
  });

  test('approve follow request from Privacy section', async ({ browser }) => {
    const ownerName = uniqueUsername('settings_approve_owner');
    const requesterName = uniqueUsername('settings_approve_req');

    const owner = await registerViaApi(ownerName, DEFAULT_PASSWORD);
    await setPrivateViaApi(owner.token);
    const requester = await registerViaApi(requesterName, DEFAULT_PASSWORD);
    await sendFollowRequestViaApi(requester.token, owner.userId);

    const page = await browser.newPage();
    await loginUser(page, ownerName);
    await openOwnProfile(page, ownerName);
    await approveFollowRequest(page, requesterName);
    await expect(page.getByText('No pending follow requests.')).toBeVisible();
    await page.close();
  });

  test('reject follow request from Privacy section', async ({ browser }) => {
    const ownerName = uniqueUsername('settings_reject_owner');
    const requesterName = uniqueUsername('settings_reject_req');

    const owner = await registerViaApi(ownerName, DEFAULT_PASSWORD);
    await setPrivateViaApi(owner.token);
    const requester = await registerViaApi(requesterName, DEFAULT_PASSWORD);
    await sendFollowRequestViaApi(requester.token, owner.userId);

    const page = await browser.newPage();
    await loginUser(page, ownerName);
    await openSettingsWithSection(page, ownerName, 'Privacy');

    const row = page.locator('li').filter({ hasText: requesterName });
    await row.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page.getByText('No pending follow requests.')).toBeVisible();
    await page.close();
  });
});

test.describe('Notification settings — toggles', () => {
  for (const label of NOTIFICATION_SWITCHES) {
    test(`${label} toggle persists after reload`, async ({ page }) => {
      const username = uniqueUsername(`settings_notif_${label.replace(/\s+/g, '_').toLowerCase()}`);
      const user = await registerViaApi(username, DEFAULT_PASSWORD);
      await loginUser(page, username);

      await openSettingsWithSection(page, username, 'Notifications');
      await setSwitchState(page, label, false);

      const api = await getSettingsViaApi(user.token);
      const apiKey = labelToApiKey(label);
      expect(api[apiKey]).toBe(false);

      await page.reload();
      await openOwnProfile(page, username);
      await openProfileSettings(page);
      await expandSettingsSection(page, 'Notifications');
      await expectSwitchState(page, label, false);

      await setSwitchState(page, label, true);
    });
  }
});

test.describe('Notification settings — behavior', () => {
  test('disabled likes: no toast and no inbox notification when post is liked', async ({ browser }) => {
    const authorName = uniqueUsername('settings_no_like_author');
    const likerName = uniqueUsername('settings_no_like_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await patchSettingsViaApi(author.token, { notifyLikes: false });
    const content = `No like notif ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);
    await expect(authorPage.getByText(content)).toBeVisible();

    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    const toast = authorPage.getByRole('button').filter({ hasText: likerName });
    await expect(toast).not.toBeVisible({ timeout: 3_000 });

    await authorPage.getByRole('button', { name: 'Notifications' }).click();
    await expect(
      authorPage.locator('[data-notification-item]').filter({ hasText: likerName }),
    ).toHaveCount(0);

    await authorContext.close();
  });

  test('enabled likes: toast appears when post is liked', async ({ browser }) => {
    const authorName = uniqueUsername('settings_like_toast_author');
    const likerName = uniqueUsername('settings_like_toast_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Like toast ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);
    await expect(authorPage.getByText(content)).toBeVisible();

    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    const toast = authorPage.getByRole('button').filter({ hasText: likerName });
    await expect(toast).toBeVisible({ timeout: 10_000 });

    await authorContext.close();
  });

  test('mute all toasts: inbox notification without toast popup', async ({ browser }) => {
    const authorName = uniqueUsername('settings_mute_author');
    const likerName = uniqueUsername('settings_mute_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await patchSettingsViaApi(author.token, { notifyLikes: true, muteAllToasts: true });
    const content = `Mute toast ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);
    await expect(authorPage.getByText(content)).toBeVisible();

    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    const toast = authorPage.getByRole('button').filter({ hasText: likerName });
    await expect(toast).not.toBeVisible({ timeout: 3_000 });

    await authorPage.getByRole('button', { name: 'Notifications' }).click();
    await expect(
      authorPage.locator('[data-notification-item]').filter({ hasText: likerName }).first(),
    ).toBeVisible({ timeout: 10_000 });

    await authorContext.close();
  });

  test('disabled comments: no notification when someone comments', async ({ browser }) => {
    const authorName = uniqueUsername('settings_no_comment_author');
    const commenterName = uniqueUsername('settings_no_commenter');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await patchSettingsViaApi(author.token, { notifyComments: false });
    const content = `No comment notif ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);

    const commenter = await registerViaApi(commenterName, DEFAULT_PASSWORD);
    await createCommentViaApi(commenter.token, post.id, `Hi ${Date.now()}`);

    await authorPage.getByRole('button', { name: 'Notifications' }).click();
    await expect(
      authorPage.locator('[data-notification-item]').filter({ hasText: commenterName }),
    ).toHaveCount(0, { timeout: 5_000 });

    await authorContext.close();
  });

  test('disabled mentions: no notification when @mentioned', async ({ browser }) => {
    const authorName = uniqueUsername('settings_no_mention_author');
    const mentionerName = uniqueUsername('settings_no_mentioner');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await patchSettingsViaApi(author.token, { notifyMentions: false });

    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await loginUser(authorPage, authorName);

    const mentioner = await registerViaApi(mentionerName, DEFAULT_PASSWORD);
    await createPostViaApi(mentioner.token, `Hey @${authorName} check this ${Date.now()}`);

    await authorPage.getByRole('button', { name: 'Notifications' }).click();
    await expect(
      authorPage.locator('[data-notification-item]').filter({ hasText: mentionerName }),
    ).toHaveCount(0, { timeout: 5_000 });

    await authorContext.close();
  });
});

test.describe('Chat settings — messages icon visibility', () => {
  test('global mode shows messages FAB on feed, profile, and post view', async ({ page }) => {
    const username = uniqueUsername('settings_chat_global');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    const content = `Chat global post ${Date.now()}`;
    const post = await createPostViaApi(user.token, content);

    await loginUser(page, username);
    await expectMessagesFabVisible(page, true);

    await openOwnProfile(page, username);
    await expectMessagesFabVisible(page, true);

    await page.goto(`/post/${post.id}`);
    await expect(page.getByText(content)).toBeVisible();
    await expectMessagesFabVisible(page, true);
  });

  test('selected pages: only Feed shows messages FAB', async ({ page }) => {
    const username = uniqueUsername('settings_chat_feed_only');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    const content = `Chat feed only ${Date.now()}`;
    const post = await createPostViaApi(user.token, content);

    await loginUser(page, username);
    await openSettingsWithSection(page, username, 'Chat');
    await setChatIconMode(page, 'selected_pages');
    await setChatPageChecked(page, 'Feed', true);
    await setChatPageChecked(page, 'Profile', false);
    await setChatPageChecked(page, 'Post view', false);
    await closeProfileSettings(page);

    await page.getByRole('button', { name: 'Back to Home' }).click();
    await expectMessagesFabVisible(page, true);

    await openOwnProfile(page, username);
    await expectMessagesFabVisible(page, false);

    await page.goto(`/post/${post.id}`);
    await expectMessagesFabVisible(page, false);
  });

  test('selected pages: only Profile shows messages FAB', async ({ page }) => {
    const username = uniqueUsername('settings_chat_profile_only');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    const content = `Chat profile only ${Date.now()}`;
    const post = await createPostViaApi(user.token, content);

    await loginUser(page, username);
    await openSettingsWithSection(page, username, 'Chat');
    await setChatIconMode(page, 'selected_pages');
    await setChatPageChecked(page, 'Feed', false);
    await setChatPageChecked(page, 'Profile', true);
    await setChatPageChecked(page, 'Post view', false);
    await closeProfileSettings(page);

    await page.goto('/');
    await expectMessagesFabVisible(page, false);

    await openOwnProfile(page, username);
    await expectMessagesFabVisible(page, true);

    await page.goto(`/post/${post.id}`);
    await expectMessagesFabVisible(page, false);
  });

  test('selected pages: only Post view shows messages FAB', async ({ page }) => {
    const username = uniqueUsername('settings_chat_post_only');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    const content = `Chat post only ${Date.now()}`;
    const post = await createPostViaApi(user.token, content);

    await loginUser(page, username);
    await openSettingsWithSection(page, username, 'Chat');
    await setChatIconMode(page, 'selected_pages');
    await setChatPageChecked(page, 'Feed', false);
    await setChatPageChecked(page, 'Profile', false);
    await setChatPageChecked(page, 'Post view', true);
    await closeProfileSettings(page);

    await page.goto('/');
    await expectMessagesFabVisible(page, false);

    await openOwnProfile(page, username);
    await expectMessagesFabVisible(page, false);

    await page.goto(`/post/${post.id}`);
    await expect(page.getByText(content)).toBeVisible();
    await expectMessagesFabVisible(page, true);
  });

  test('page checkboxes only appear in selected pages mode', async ({ page }) => {
    const username = uniqueUsername('settings_chat_checkboxes');
    await registerUser(page, username);
    await openSettingsWithSection(page, username, 'Chat');

    await expect(page.getByRole('checkbox', { name: 'Feed' })).not.toBeVisible();
    await setChatIconMode(page, 'selected_pages');
    await expect(page.getByRole('checkbox', { name: 'Feed' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Post view' })).toBeVisible();

    await setChatIconMode(page, 'global');
    await expect(page.getByRole('checkbox', { name: 'Feed' })).not.toBeVisible();
  });

  test('switching back to global restores FAB on all pages', async ({ page }) => {
    const username = uniqueUsername('settings_chat_restore');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    const content = `Chat restore ${Date.now()}`;
    const post = await createPostViaApi(user.token, content);

    await loginUser(page, username);
    await openSettingsWithSection(page, username, 'Chat');
    await setChatIconMode(page, 'selected_pages');
    await setChatPageChecked(page, 'Feed', true);
    await closeProfileSettings(page);

    await openOwnProfile(page, username);
    await expectMessagesFabVisible(page, false);

    await openProfileSettings(page);
    await expandSettingsSection(page, 'Chat');
    await setChatIconMode(page, 'global');
    await closeProfileSettings(page);

    await openOwnProfile(page, username);
    await expectMessagesFabVisible(page, true);

    await page.goto(`/post/${post.id}`);
    await expectMessagesFabVisible(page, true);
  });

  test('no pages selected hides messages FAB everywhere', async ({ page }) => {
    const username = uniqueUsername('settings_chat_none');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    const content = `Chat none ${Date.now()}`;
    const post = await createPostViaApi(user.token, content);

    await loginUser(page, username);
    await openSettingsWithSection(page, username, 'Chat');
    await setChatIconMode(page, 'selected_pages');
    await setChatPageChecked(page, 'Feed', false);
    await setChatPageChecked(page, 'Profile', false);
    await setChatPageChecked(page, 'Post view', false);
    await closeProfileSettings(page);

    await page.goto('/');
    await expectMessagesFabVisible(page, false);
    await openOwnProfile(page, username);
    await expectMessagesFabVisible(page, false);
    await page.goto(`/post/${post.id}`);
    await expectMessagesFabVisible(page, false);
  });
});

test.describe('Chat settings — persistence', () => {
  test('chat icon mode and pages persist via API after UI changes', async ({ page }) => {
    const username = uniqueUsername('settings_chat_persist');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    await loginUser(page, username);

    await openSettingsWithSection(page, username, 'Chat');
    await setChatIconMode(page, 'selected_pages');
    await setChatPageChecked(page, 'Feed', true);
    await setChatPageChecked(page, 'Profile', true);

    const api = await getSettingsViaApi(user.token);
    expect(api.chatIconMode).toBe('selected_pages');
    expect(api.chatIconPages).toEqual(expect.arrayContaining(['feed', 'profile']));
    expect(api.chatIconPages).not.toContain('post');
  });
});

function labelToApiKey(
  label: (typeof NOTIFICATION_SWITCHES)[number],
): keyof Pick<
  UserSettingsApi,
  | 'notifyLikes'
  | 'notifyComments'
  | 'notifyMentions'
  | 'notifyDms'
  | 'notifySystem'
  | 'muteAllToasts'
> {
  switch (label) {
    case 'Likes':
      return 'notifyLikes';
    case 'Comments':
      return 'notifyComments';
    case 'Mentions':
      return 'notifyMentions';
    case 'Direct messages':
      return 'notifyDms';
    case 'System broadcasts':
      return 'notifySystem';
    case 'Mute all toasts':
      return 'muteAllToasts';
  }
}
