import { Page, expect } from '@playwright/test';

export async function openChatBox(page: Page) {
  await page.locator('#messages-fab-trigger').click();
  await expect(page.getByRole('dialog').or(page.locator('[class*="animate-panel-pop"]')).first()).toBeVisible({
    timeout: 10_000,
  });
}

export async function closeChatBox(page: Page) {
  await page.keyboard.press('Escape');
}

/** Open another user's profile (from feed username) and start a DM via Message. */
export async function startChatWithUser(page: Page, username: string) {
  await page.getByRole('button', { name: username, exact: true }).first().click();
  await page.getByRole('button', { name: 'Message' }).click();
  await expect(page.getByRole('dialog', { name: /messages/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Send message/i })).toBeVisible();
}

export async function sendMessage(page: Page, text: string) {
  const dialog = page.getByRole('dialog', { name: /messages/i });
  const composer = dialog.getByRole('textbox').or(dialog.locator('textarea')).last();
  await composer.fill(text);
  await dialog.getByRole('button', { name: /Send message/i }).click();
}
