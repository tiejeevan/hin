import { test, expect } from '@playwright/test';
import { registerUser, uniqueUsername } from './helpers/auth';
import { closeChatBox, openChatBox, sendMessage } from './helpers/messages';

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

  test.skip('swipe-to-reply + send shows quote chip', async () => {
    // Requires two-user WS fixture; enable when Agent 4 harness lands fully.
  });

  test.skip('double-tap delete removes message for both users', async () => {
    // Requires two-user WS fixture.
  });
});

test.describe('Chat composer smoke helpers', () => {
  test.skip('sendMessage helper placeholder', async ({ page }) => {
    const username = uniqueUsername('chat_send');
    await registerUser(page, username);
    await openChatBox(page);
    await sendMessage(page, 'ping');
  });
});
