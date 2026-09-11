import { expect, type Page } from '@playwright/test';

export const DEFAULT_PASSWORD = 'TestPass123!';

export function uniqueUsername(prefix = 'e2e') {
  const raw = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  return raw.slice(0, 30);
}

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
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

export async function completeEmailVerificationIfPresent(page: Page, code = '0000') {
  const gate = page.getByRole('heading', { name: 'Verify your email' });
  if (!(await gate.isVisible().catch(() => false))) return;

  await page.getByPlaceholder('0000').fill(code);
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(gate).not.toBeVisible({ timeout: 15_000 });
}

export async function registerUser(
  page: Page,
  username: string,
  password = DEFAULT_PASSWORD,
  email?: string,
  verificationCode?: string,
) {
  const userEmail = email ?? uniqueEmail('reg');
  let devCode = verificationCode;
  const registerResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/register') && resp.request().method() === 'POST',
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.getByPlaceholder('your_username').fill(username);
  await page.getByPlaceholder('you@example.com').fill(userEmail);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Register Account' }).click();

  if (!devCode) {
    const regResp = await registerResponse;
    if (regResp.ok()) {
      const regData = await regResp.json();
      devCode = regData.devVerificationCode as string | undefined;
    }
  }

  const verifyHeading = page.getByRole('heading', { name: 'Verify your email' });
  if (await verifyHeading.isVisible().catch(() => false)) {
    if (!devCode) {
      throw new Error('Registration requires email verification; pass verificationCode from devVerificationCode');
    }
    await completeEmailVerificationIfPresent(page, devCode);
  }

  await expectLoggedIn(page);
  await dismissWalkthroughIfPresent(page);
}

export async function loginUser(
  page: Page,
  identifier: string,
  password = DEFAULT_PASSWORD,
) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByPlaceholder('username or you@example.com').fill(identifier);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expectLoggedIn(page);
  await dismissWalkthroughIfPresent(page);
}

export async function logoutUser(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
}
