import { test, expect, type Browser, type Page } from '@playwright/test';
import { DEFAULT_PASSWORD, loginUser, uniqueUsername } from './helpers/auth';
import {
  createPostViaApi,
  followViaApi,
  registerViaApi,
  sendFollowRequestViaApi,
  setPrivateViaApi,
} from './helpers/follows';
import {
  approveFollowRequestViaApi,
  createCommentViaApi,
  likeCommentViaApi,
  likePostViaApi,
} from './helpers/permalinks';
import { muteViaApi } from './helpers/block-mute';
import { patchSettingsViaApi } from './helpers/settings';
import {
  createBadgeViaApi,
  loginAdminViaApi,
  setGamificationEnabledViaApi,
} from './helpers/gamification';
import {
  broadcastSystemViaApi,
  closeNotificationsPanelViaDismiss,
  expectBellUnread,
  expectNotificationAbsent,
  expectNotificationVisible,
  fetchNotificationsViaApi,
  fetchUnreadCountViaApi,
  insertNotificationViaD1,
  markAllNotificationsReadViaApi,
  markNotificationReadViaApi,
  notificationItems,
  notificationPanel,
  notificationsBell,
  openNotificationsPanel,
  waitForNotificationViaApi,
} from './helpers/notifications';

async function loginInNewContext(
  browser: Browser,
  username: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginUser(page, username);
  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}

test.describe('Notifications panel UI', () => {
  test('empty state, open/close via dismiss, Escape, and backdrop', async ({ page }) => {
    const username = uniqueUsername('notif_panel');
    await registerViaApi(username, DEFAULT_PASSWORD);
    await loginUser(page, username);

    await openNotificationsPanel(page);
    await expect(notificationPanel(page).getByText('No notifications yet.')).toBeVisible();
    await closeNotificationsPanelViaDismiss(page);

    await openNotificationsPanel(page);
    await page.keyboard.press('Escape');
    await expect(notificationPanel(page)).not.toBeVisible();

    await openNotificationsPanel(page);
    await page.locator('.fixed.inset-0.z-40').click({ position: { x: 8, y: 8 } });
    await expect(notificationPanel(page)).not.toBeVisible();
  });

  test('unread badge appears on bell and clears after Read all', async ({ browser }) => {
    const authorName = uniqueUsername('notif_badge_author');
    const likerName = uniqueUsername('notif_badge_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Badge count ${Date.now()}`);
    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    await waitForNotificationViaApi(
      author.token,
      n => n.type === 'like' && n.senderId === liker.userId,
    );

    const { page, close } = await loginInNewContext(browser, authorName);
    await expect
      .poll(async () => {
        const label = await notificationsBell(page).getAttribute('aria-label');
        const match = label?.match(/Notifications, (\d+) unread/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .toBeGreaterThanOrEqual(1);

    await openNotificationsPanel(page);
    await expect(notificationPanel(page).getByText(/\d+ new/)).toBeVisible();
    await notificationPanel(page).getByRole('button', { name: 'Mark all notifications as read' }).click();

    // With gamification enabled, Read all is tab-scoped — clear System too.
    const systemTab = notificationPanel(page).getByRole('button', { name: /System/ });
    if (await systemTab.isVisible().catch(() => false)) {
      await systemTab.click();
      const readAll = notificationPanel(page).getByRole('button', {
        name: 'Mark all notifications as read',
      });
      if (await readAll.isVisible().catch(() => false)) {
        await readAll.click();
      }
    }

    await expect
      .poll(async () => {
        const label = await notificationsBell(page).getAttribute('aria-label');
        return label === 'Notifications' ? 0 : 1;
      })
      .toBe(0);

    await close();
  });

  test('bell shows 9+ when unread count exceeds 9', async ({ browser }) => {
    const authorName = uniqueUsername('notif_nineplus');
    const commenterName = uniqueUsername('notif_nineplus_c');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Nine plus ${Date.now()}`);
    const commenter = await registerViaApi(commenterName, DEFAULT_PASSWORD);

    for (let i = 0; i < 10; i++) {
      await createCommentViaApi(commenter.token, post.id, `Comment ${i} ${Date.now()}`);
    }

    await expect
      .poll(async () => fetchUnreadCountViaApi(author.token), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(10);

    const { page, close } = await loginInNewContext(browser, authorName);
    await expectBellUnread(page, '9+');
    await close();
  });
});

test.describe('Notifications — social creation & realtime', () => {
  test('like creates inbox item and toast for online recipient', async ({ browser }) => {
    const authorName = uniqueUsername('notif_like_author');
    const likerName = uniqueUsername('notif_like_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Like live ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const { page, close } = await loginInNewContext(browser, authorName);
    await expect(page.getByText(content)).toBeVisible();

    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    const toast = page.getByRole('button').filter({ hasText: likerName });
    await expect(toast).toBeVisible({ timeout: 10_000 });

    await openNotificationsPanel(page);
    await expectNotificationVisible(page, likerName);
    await close();
  });

  test('comment creates notification', async ({ browser }) => {
    const authorName = uniqueUsername('notif_comment_author');
    const commenterName = uniqueUsername('notif_commenter');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Comment target ${Date.now()}`);
    const commenter = await registerViaApi(commenterName, DEFAULT_PASSWORD);
    await createCommentViaApi(commenter.token, post.id, `Hello ${Date.now()}`);

    await waitForNotificationViaApi(
      author.token,
      n => n.type === 'comment' && n.senderId === commenter.userId,
    );

    const { page, close } = await loginInNewContext(browser, authorName);
    await openNotificationsPanel(page);
    await expectNotificationVisible(page, new RegExp(`${commenterName} commented`));
    await close();
  });

  test('mention in post creates notification', async ({ browser }) => {
    // Mention parser only accepts @usernames up to 30 chars.
    const mentionedName = `mn_${Date.now().toString(36)}`.slice(0, 30);
    const mentionerName = `mr_${Date.now().toString(36)}`.slice(0, 30);

    const mentioned = await registerViaApi(mentionedName, DEFAULT_PASSWORD);
    const mentioner = await registerViaApi(mentionerName, DEFAULT_PASSWORD);
    await createPostViaApi(mentioner.token, `Hey @${mentionedName} see this ${Date.now()}`);

    await waitForNotificationViaApi(
      mentioned.token,
      n => n.type === 'mention' && n.senderId === mentioner.userId,
    );

    const { page, close } = await loginInNewContext(browser, mentionedName);
    await openNotificationsPanel(page);
    await expectNotificationVisible(page, new RegExp(`${mentionerName} mentioned`));
    await close();
  });

  test('comment like creates notification', async ({ browser }) => {
    const authorName = uniqueUsername('notif_cl_author');
    const likerName = uniqueUsername('notif_cl_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `CL target ${Date.now()}`);
    const comment = await createCommentViaApi(author.token, post.id, `Like me ${Date.now()}`);
    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likeCommentViaApi(liker.token, comment.id);

    await waitForNotificationViaApi(
      author.token,
      n => n.type === 'like' && n.senderId === liker.userId && n.commentId === comment.id,
    );

    const { page, close } = await loginInNewContext(browser, authorName);
    await openNotificationsPanel(page);
    await expectNotificationVisible(page, new RegExp(`${likerName} liked your comment`));
    await close();
  });

  test('follow creates notification for public account', async ({ browser }) => {
    const targetName = uniqueUsername('notif_follow_target');
    const followerName = uniqueUsername('notif_follower');

    const target = await registerViaApi(targetName, DEFAULT_PASSWORD);
    const follower = await registerViaApi(followerName, DEFAULT_PASSWORD);
    await followViaApi(follower.token, target.userId);

    await waitForNotificationViaApi(
      target.token,
      n => n.type === 'follow' && n.senderId === follower.userId,
    );

    const { page, close } = await loginInNewContext(browser, targetName);
    await openNotificationsPanel(page);
    await expectNotificationVisible(page, new RegExp(`@${followerName} started following`));
    await close();
  });

  test('follow request creates notification for private account', async ({ browser }) => {
    const privateName = uniqueUsername('notif_fr_private');
    const requesterName = uniqueUsername('notif_fr_req');

    const privateUser = await registerViaApi(privateName, DEFAULT_PASSWORD);
    await setPrivateViaApi(privateUser.token);
    const requester = await registerViaApi(requesterName, DEFAULT_PASSWORD);
    await sendFollowRequestViaApi(requester.token, privateUser.userId);

    await waitForNotificationViaApi(
      privateUser.token,
      n => n.type === 'follow_request' && n.senderId === requester.userId,
    );

    const { page, close } = await loginInNewContext(browser, privateName);
    await openNotificationsPanel(page);
    await expectNotificationVisible(page, new RegExp(`@${requesterName} requested to follow`));
    await close();
  });

  test('follow accepted creates notification for requester', async ({ browser }) => {
    const privateName = uniqueUsername('notif_fa_private');
    const requesterName = uniqueUsername('notif_fa_req');

    const privateUser = await registerViaApi(privateName, DEFAULT_PASSWORD);
    await setPrivateViaApi(privateUser.token);
    const requester = await registerViaApi(requesterName, DEFAULT_PASSWORD);
    await sendFollowRequestViaApi(requester.token, privateUser.userId);
    await approveFollowRequestViaApi(privateUser.token, requester.userId);

    await waitForNotificationViaApi(
      requester.token,
      n => n.type === 'follow_accepted' && n.senderId === privateUser.userId,
    );

    const { page, close } = await loginInNewContext(browser, requesterName);
    await openNotificationsPanel(page);
    await expectNotificationVisible(page, new RegExp(`@${privateName} accepted your follow`));
    await close();
  });

  test('liking own post does not create a notification', async () => {
    const username = uniqueUsername('notif_self_like');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    const post = await createPostViaApi(user.token, `Self like ${Date.now()}`);
    await likePostViaApi(user.token, post.id);

    await new Promise(r => setTimeout(r, 1_000));
    const notifs = await fetchNotificationsViaApi(user.token);
    expect(notifs.filter(n => n.type === 'like' && n.entityId === post.id)).toHaveLength(0);
  });
});

test.describe('Notifications — click navigation', () => {
  test('like notification navigates to post permalink and marks read', async ({ browser }) => {
    const authorName = uniqueUsername('notif_nav_like');
    const likerName = uniqueUsername('notif_nav_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Nav like ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);
    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    const notif = await waitForNotificationViaApi(
      author.token,
      n => n.type === 'like' && n.senderId === liker.userId,
    );
    expect(notif.read).toBe(false);

    const { page, close } = await loginInNewContext(browser, authorName);
    await openNotificationsPanel(page);
    const item = await expectNotificationVisible(page, likerName);
    await item.click();

    await expect(page).toHaveURL(new RegExp(`/post/${post.id}$`));
    await expect(page.getByText(content)).toBeVisible();
    await expect(notificationPanel(page)).not.toBeVisible();

    await expect
      .poll(async () => {
        const updated = await fetchNotificationsViaApi(author.token);
        return updated.find(n => n.id === notif.id)?.read;
      })
      .toBe(true);

    await close();
  });

  test('comment notification navigates to post with comment anchor', async ({ browser }) => {
    const authorName = uniqueUsername('notif_nav_comment');
    const commenterName = uniqueUsername('notif_nav_commenter');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Nav comment ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);
    const commenter = await registerViaApi(commenterName, DEFAULT_PASSWORD);
    const comment = await createCommentViaApi(commenter.token, post.id, `Hi ${Date.now()}`);

    const { page, close } = await loginInNewContext(browser, authorName);
    await openNotificationsPanel(page);
    const item = await expectNotificationVisible(page, commenterName);
    await item.click();

    await expect(page).toHaveURL(new RegExp(`/post/${post.id}#comment-${comment.id}$`));
    await expect(page.locator(`#comment-${comment.id}`)).toBeVisible();
    await close();
  });

  test('mention notification navigates to post', async ({ browser }) => {
    const mentionedName = `mn_${Date.now().toString(36)}_n`.slice(0, 30);
    const mentionerName = `mr_${Date.now().toString(36)}_n`.slice(0, 30);

    await registerViaApi(mentionedName, DEFAULT_PASSWORD);
    const mentioner = await registerViaApi(mentionerName, DEFAULT_PASSWORD);
    const content = `Hey @${mentionedName} nav ${Date.now()}`;
    const post = await createPostViaApi(mentioner.token, content);

    const { page, close } = await loginInNewContext(browser, mentionedName);
    await openNotificationsPanel(page);
    const item = await expectNotificationVisible(page, mentionerName);
    await item.click();

    await expect(page).toHaveURL(new RegExp(`/post/${post.id}`));
    await expect(page.getByText(content)).toBeVisible();
    await close();
  });

  test('follow notification navigates to follower profile', async ({ browser }) => {
    const targetName = uniqueUsername('notif_nav_follow_t');
    const followerName = uniqueUsername('notif_nav_follow_f');

    const target = await registerViaApi(targetName, DEFAULT_PASSWORD);
    const follower = await registerViaApi(followerName, DEFAULT_PASSWORD);
    await followViaApi(follower.token, target.userId);

    const { page, close } = await loginInNewContext(browser, targetName);
    await openNotificationsPanel(page);
    const item = await expectNotificationVisible(page, followerName);
    await item.click();

    await expect(page).toHaveURL(new RegExp(`/profile/${followerName}$`));
    await close();
  });

  test('follow_request notification opens own profile settings', async ({ browser }) => {
    const privateName = uniqueUsername('notif_nav_fr_p');
    const requesterName = uniqueUsername('notif_nav_fr_r');

    const privateUser = await registerViaApi(privateName, DEFAULT_PASSWORD);
    await setPrivateViaApi(privateUser.token);
    const requester = await registerViaApi(requesterName, DEFAULT_PASSWORD);
    await sendFollowRequestViaApi(requester.token, privateUser.userId);

    const { page, close } = await loginInNewContext(browser, privateName);
    await openNotificationsPanel(page);
    const item = await expectNotificationVisible(page, requesterName);
    await item.click();

    await expect(page).toHaveURL(new RegExp(`/profile/${privateName}$`));
    await expect(page.getByRole('heading', { name: 'Profile settings' })).toBeVisible();
    await close();
  });

  test('follow_accepted notification navigates to accepter profile', async ({ browser }) => {
    const privateName = uniqueUsername('notif_nav_fa_p');
    const requesterName = uniqueUsername('notif_nav_fa_r');

    const privateUser = await registerViaApi(privateName, DEFAULT_PASSWORD);
    await setPrivateViaApi(privateUser.token);
    const requester = await registerViaApi(requesterName, DEFAULT_PASSWORD);
    await sendFollowRequestViaApi(requester.token, privateUser.userId);
    await approveFollowRequestViaApi(privateUser.token, requester.userId);

    const { page, close } = await loginInNewContext(browser, requesterName);
    await openNotificationsPanel(page);
    const item = await expectNotificationVisible(page, privateName);
    await item.click();

    await expect(page).toHaveURL(new RegExp(`/profile/${privateName}$`));
    await close();
  });

  test('toast click navigates to post permalink', async ({ browser }) => {
    const authorName = uniqueUsername('notif_toast_nav');
    const likerName = uniqueUsername('notif_toast_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Toast nav ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const { page, close } = await loginInNewContext(browser, authorName);
    await expect(page.getByText(content)).toBeVisible();

    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    const toast = page.getByRole('button').filter({ hasText: likerName });
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await toast.click({ force: true });

    await expect(page).toHaveURL(new RegExp(`/post/${post.id}$`));
    await close();
  });
});

test.describe('Notifications — mark read', () => {
  test('API mark one and mark all update unread count', async () => {
    const authorName = uniqueUsername('notif_api_read');
    const a = uniqueUsername('notif_api_a');
    const b = uniqueUsername('notif_api_b');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `API read ${Date.now()}`);
    const likerA = await registerViaApi(a, DEFAULT_PASSWORD);
    const likerB = await registerViaApi(b, DEFAULT_PASSWORD);
    await likePostViaApi(likerA.token, post.id);

    const secondPost = await createPostViaApi(author.token, `API read 2 ${Date.now()}`);
    await likePostViaApi(likerB.token, secondPost.id);

    await waitForNotificationViaApi(author.token, n => n.senderId === likerB.userId);
    expect(await fetchUnreadCountViaApi(author.token)).toBeGreaterThanOrEqual(2);

    const list = await fetchNotificationsViaApi(author.token);
    const firstUnread = list.find(n => !n.read)!;
    await markNotificationReadViaApi(author.token, firstUnread.id);

    const afterOne = await fetchNotificationsViaApi(author.token);
    expect(afterOne.find(n => n.id === firstUnread.id)?.read).toBe(true);

    await markAllNotificationsReadViaApi(author.token);
    expect(await fetchUnreadCountViaApi(author.token)).toBe(0);
  });

  test('Read all only clears current tab when gamification is enabled', async ({ browser }) => {
    const adminToken = await loginAdminViaApi();
    await setGamificationEnabledViaApi(adminToken, true);

    const username = uniqueUsername('notif_tab_read');
    const likerName = uniqueUsername('notif_tab_liker');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);

    const post = await createPostViaApi(user.token, `Social unread ${Date.now()}`);
    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);
    await waitForNotificationViaApi(user.token, n => n.type === 'like' && n.senderId === liker.userId);

    const badgeContent = `You earned the "Tab Seed ${Date.now()}" badge!`;
    await insertNotificationViaD1({
      userId: user.userId,
      senderId: user.userId,
      type: 'badge_award',
      content: badgeContent,
      entityType: 'badge',
      entityId: 1,
      category: 'gamification',
    });

    const { page, close } = await loginInNewContext(browser, username);
    await openNotificationsPanel(page);

    await expect(notificationPanel(page).getByRole('button', { name: /Activity/ })).toBeVisible();
    await expect(notificationPanel(page).getByRole('button', { name: /System/ })).toBeVisible();

    await expectNotificationVisible(page, likerName);
    await notificationPanel(page)
      .getByRole('button', { name: 'Mark all notifications as read' })
      .click();

    await expect
      .poll(async () => {
        const list = await fetchNotificationsViaApi(user.token);
        return list.filter(n => (!n.category || n.category === 'social') && !n.read).length;
      })
      .toBe(0);

    await expect
      .poll(async () => {
        const list = await fetchNotificationsViaApi(user.token);
        return list.filter(n => n.category === 'gamification' && !n.read).length;
      })
      .toBeGreaterThanOrEqual(1);

    await notificationPanel(page).getByRole('button', { name: /System/ }).click();
    await expectNotificationVisible(page, badgeContent);
    await notificationPanel(page)
      .getByRole('button', { name: 'Mark all notifications as read' })
      .click();

    await expect
      .poll(async () => (await fetchNotificationsViaApi(user.token)).filter(n => !n.read).length)
      .toBe(0);

    await close();
  });
});

test.describe('Notifications — preferences & delivery gates', () => {
  test('disabled likes: no toast and no inbox entry', async ({ browser }) => {
    const authorName = uniqueUsername('notif_pref_like');
    const likerName = uniqueUsername('notif_pref_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await patchSettingsViaApi(author.token, { notifyLikes: false });
    const content = `No like pref ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const { page, close } = await loginInNewContext(browser, authorName);
    await expect(page.getByText(content)).toBeVisible();

    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    await expect(page.getByRole('button').filter({ hasText: likerName })).not.toBeVisible({
      timeout: 3_000,
    });
    await openNotificationsPanel(page);
    await expectNotificationAbsent(page, likerName);
    await close();
  });

  test('disabled comments: no inbox entry', async ({ browser }) => {
    const authorName = uniqueUsername('notif_pref_comment');
    const commenterName = uniqueUsername('notif_pref_commenter');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await patchSettingsViaApi(author.token, { notifyComments: false });
    const post = await createPostViaApi(author.token, `No comment pref ${Date.now()}`);

    const commenter = await registerViaApi(commenterName, DEFAULT_PASSWORD);
    await createCommentViaApi(commenter.token, post.id, `Hi ${Date.now()}`);

    await new Promise(r => setTimeout(r, 1_500));
    expect(
      (await fetchNotificationsViaApi(author.token)).filter(
        n => n.type === 'comment' && n.senderId === commenter.userId,
      ),
    ).toHaveLength(0);

    const { page, close } = await loginInNewContext(browser, authorName);
    await openNotificationsPanel(page);
    await expectNotificationAbsent(page, commenterName);
    await close();
  });

  test('disabled mentions: no inbox entry', async ({ browser }) => {
    const mentionedName = `mn_${Date.now().toString(36)}_p`.slice(0, 30);
    const mentionerName = `mr_${Date.now().toString(36)}_p`.slice(0, 30);

    const mentioned = await registerViaApi(mentionedName, DEFAULT_PASSWORD);
    await patchSettingsViaApi(mentioned.token, { notifyMentions: false });
    const mentioner = await registerViaApi(mentionerName, DEFAULT_PASSWORD);
    await createPostViaApi(mentioner.token, `Hey @${mentionedName} silent ${Date.now()}`);

    await new Promise(r => setTimeout(r, 1_500));
    expect(
      (await fetchNotificationsViaApi(mentioned.token)).filter(n => n.type === 'mention'),
    ).toHaveLength(0);

    const { page, close } = await loginInNewContext(browser, mentionedName);
    await openNotificationsPanel(page);
    await expectNotificationAbsent(page, mentionerName);
    await close();
  });

  test('mute all toasts: inbox without toast popup', async ({ browser }) => {
    const authorName = uniqueUsername('notif_mute_toast');
    const likerName = uniqueUsername('notif_mute_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await patchSettingsViaApi(author.token, { notifyLikes: true, muteAllToasts: true });
    const content = `Mute toasts ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const { page, close } = await loginInNewContext(browser, authorName);
    await expect(page.getByText(content)).toBeVisible();

    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    await expect(page.getByRole('button').filter({ hasText: likerName })).not.toBeVisible({
      timeout: 3_000,
    });
    await openNotificationsPanel(page);
    await expectNotificationVisible(page, likerName);
    await close();
  });

  test('muted user likes do not create notifications', async () => {
    const authorName = uniqueUsername('notif_mute_author');
    const mutedName = uniqueUsername('notif_muted_user');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const muted = await registerViaApi(mutedName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Mute gate ${Date.now()}`);
    await muteViaApi(author.token, muted.userId);
    await likePostViaApi(muted.token, post.id);

    await new Promise(r => setTimeout(r, 1_500));
    expect(
      (await fetchNotificationsViaApi(author.token)).filter(
        n => n.type === 'like' && n.senderId === muted.userId,
      ),
    ).toHaveLength(0);
  });

  test('disabled system: toast broadcast is suppressed', async ({ browser }) => {
    const username = uniqueUsername('notif_no_sys');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    await patchSettingsViaApi(user.token, { notifySystem: false });

    const { page, close } = await loginInNewContext(browser, username);
    await expect(notificationsBell(page)).toBeVisible();
    await page.waitForTimeout(1_000);

    const adminToken = await loginAdminViaApi();
    const message = `Silent system toast ${Date.now()}`;
    await broadcastSystemViaApi(adminToken, message, 'toast');

    await expect(page.getByText(message)).not.toBeVisible({ timeout: 3_000 });
    await close();
  });
});

test.describe('Notifications — system & gamification', () => {
  test('system notification appears in Activity inbox; click dismisses without navigation', async ({
    browser,
  }) => {
    const username = uniqueUsername('notif_sys_user');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    const message = `Hello everyone ${Date.now()}`;
    await insertNotificationViaD1({
      userId: user.userId,
      senderId: user.userId,
      type: 'system',
      content: message,
      entityType: 'system',
      entityId: 1,
    });

    const { page, close } = await loginInNewContext(browser, username);
    await openNotificationsPanel(page);
    const item = await expectNotificationVisible(page, message);
    await item.click();

    await expect(notificationPanel(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await close();
  });

  test('system toast delivery shows toast without requiring inbox open', async ({ browser }) => {
    const username = uniqueUsername('notif_sys_toast');
    const likerName = uniqueUsername('notif_sys_toast_l');
    const author = await registerViaApi(username, DEFAULT_PASSWORD);
    const content = `WS ready ${Date.now()}`;
    const post = await createPostViaApi(author.token, content);

    const { page, close } = await loginInNewContext(browser, username);
    await expect(page.getByText(content)).toBeVisible();

    // Confirm realtime is live with a social toast first.
    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);
    await expect(page.getByRole('button').filter({ hasText: likerName })).toBeVisible({
      timeout: 10_000,
    });

    const adminToken = await loginAdminViaApi();
    const message = `Toast only ${Date.now()}`;
    await broadcastSystemViaApi(adminToken, message, 'toast');

    // System toasts are not role=button (no post deep-link target).
    await expect(page.getByText(message)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('System', { exact: true })).toBeVisible();
    await close();
  });

  test('badge award appears under System tab and click opens own profile', async ({ browser }) => {
    const adminToken = await loginAdminViaApi();
    await setGamificationEnabledViaApi(adminToken, true);

    const username = uniqueUsername('notif_badge_ui');
    const user = await registerViaApi(username, DEFAULT_PASSWORD);
    const badgeName = `Notif Badge ${Date.now()}`;
    await createBadgeViaApi(adminToken, {
      name: badgeName,
      description: 'Publish one post',
      metricKey: 'total_posts',
      threshold: 1,
    });
    await createPostViaApi(user.token, `Badge post ${Date.now()}`);

    await waitForNotificationViaApi(
      user.token,
      n => n.type === 'badge_award' && n.content.includes(badgeName),
    );

    const { page, close } = await loginInNewContext(browser, username);
    await openNotificationsPanel(page);
    await notificationPanel(page).getByRole('button', { name: /System/ }).click();
    const item = await expectNotificationVisible(page, badgeName);
    await item.click();

    await expect(page).toHaveURL(new RegExp(`/profile/${username}$`));
    await close();
  });
});

test.describe('Notifications — inbox refresh on open', () => {
  test('opening the panel fetches notifications created while offline', async ({ browser }) => {
    const authorName = uniqueUsername('notif_offline');
    const likerName = uniqueUsername('notif_offline_liker');

    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Offline notif ${Date.now()}`);
    const liker = await registerViaApi(likerName, DEFAULT_PASSWORD);
    await likePostViaApi(liker.token, post.id);

    await waitForNotificationViaApi(
      author.token,
      n => n.type === 'like' && n.senderId === liker.userId,
    );

    const { page, close } = await loginInNewContext(browser, authorName);
    await openNotificationsPanel(page);
    await expect(notificationItems(page).filter({ hasText: likerName }).first()).toBeVisible();
    await close();
  });
});
