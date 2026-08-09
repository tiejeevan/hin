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

export async function sendMessage(page: Page, text: string) {
  const composer = page.locator('textarea').last();
  await composer.fill(text);
  await page.getByRole('button', { name: /send/i }).or(page.locator('button[type="submit"]').last()).click();
}
