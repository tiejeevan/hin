import { test, expect } from '@playwright/test';
import { registerUser, uniqueUsername } from './helpers/auth';
import { openChatBox } from './helpers/messages';

test.describe.configure({ mode: 'serial' });

test('chat smoke: login → open ChatBox', async ({ page }) => {
  const username = uniqueUsername('chat_smoke');
  await registerUser(page, username);
  await openChatBox(page);
  await expect(page.locator('#messages-fab-trigger')).toBeVisible();
});
