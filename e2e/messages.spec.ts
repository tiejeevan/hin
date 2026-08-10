import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, registerUser, uniqueUsername } from './helpers/auth';
import { createPostViaApi, registerViaApi } from './helpers/follows';
import { closeChatBox, openChatBox, sendMessage, startChatWithUser } from './helpers/messages';

test.describe('Messages / ChatBox', () => {
  test('open and close chat panel from FAB', async ({ page }) => {
    const username = uniqueUsername('chat_open');
    await registerUser(page, username);
    await openChatBox(page);
    await expect(page.getByText(/messages|no conversations|start/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await closeChatBox(page);
  });

  test('CM-021: send message smoke via profile Message', async ({ page }) => {
    const peerName = uniqueUsername('chat_peer');
    const meName = uniqueUsername('chat_me');

    const peer = await registerViaApi(peerName, DEFAULT_PASSWORD);
    await createPostViaApi(peer.token, `Chat seed ${Date.now()}`);

    await registerUser(page, meName);
    await expect(page.getByRole('button', { name: peerName, exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await startChatWithUser(page, peerName);
    await expect(page.getByRole('dialog', { name: /messages/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Send message/i })).toBeVisible();

    const ping = `ping ${Date.now()}`;
    await sendMessage(page, ping);
    await expect(page.getByRole('dialog', { name: /messages/i }).getByText(ping)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('delete own message via action menu after send', async ({ page }) => {
    const peerName = uniqueUsername('chat_del_peer');
    const meName = uniqueUsername('chat_del_me');

    const peer = await registerViaApi(peerName, DEFAULT_PASSWORD);
    await createPostViaApi(peer.token, `Delete seed ${Date.now()}`);

    await registerUser(page, meName);
    await expect(page.getByRole('button', { name: peerName, exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await startChatWithUser(page, peerName);
    const body = `delete-me ${Date.now()}`;
    await sendMessage(page, body);

    const dialog = page.getByRole('dialog', { name: /messages/i });
    const bubble = dialog.getByRole('article').filter({ hasText: body });
    await expect(bubble).toBeVisible({ timeout: 10_000 });

    await bubble.dblclick();
    const menu = page.getByTestId('message-action-menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: /^Delete$/i }).click();
    await menu.getByRole('menuitem', { name: /Confirm delete/i }).click();

    await expect(dialog.getByText(body)).toHaveCount(0);
  });

  test.skip('swipe-to-reply + send shows quote chip', async () => {
    // Requires reliable two-user gesture harness; enable when swipe E2E is stable.
  });

  test.skip('double-tap delete removes message for both users', async () => {
    // Requires two-user WS fixture for cross-client assertion.
  });
});
