import { expect, type Page } from '@playwright/test';

export const DEFAULT_PASSWORD = 'TestPass123!';

export function uniqueUsername(prefix = 'e2e') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Wait until the signed-in chrome is visible (Logout moved into Account menu). */
async function expectLoggedIn(page: Page) {
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

export async function dismissWalkthroughIfPresent(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(page.getByLabel('App walkthrough')).toHaveCount(0);
  }
}

export async function registerUser(
  page: Page,
  username: string,
  password = DEFAULT_PASSWORD,
) {
  await page.goto('/');
  await page.getByRole('button', { name: "Don't have an account? Register" }).click();
  await page.getByPlaceholder('Enter username').fill(username);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Register Account' }).click();
  await expectLoggedIn(page);
  await dismissWalkthroughIfPresent(page);
}

export async function loginUser(
  page: Page,
  username: string,
  password = DEFAULT_PASSWORD,
) {
  await page.goto('/');
  await page.getByPlaceholder('Enter username').fill(username);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expectLoggedIn(page);
  await dismissWalkthroughIfPresent(page);
}

export async function logoutUser(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
}
