import { expect, type Page } from '@playwright/test';

export const DEFAULT_PASSWORD = 'TestPass123!';

export function uniqueUsername(prefix = 'e2e') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
}

export async function logoutUser(page: Page) {
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
}
