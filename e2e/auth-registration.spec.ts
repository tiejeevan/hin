import { test, expect } from '@playwright/test';
import {
  DEFAULT_PASSWORD,
  loginUser,
  registerUser,
  uniqueEmail,
  uniqueUsername,
} from './helpers/auth';
import { registerViaApi, verifyRegistrationViaApi } from './helpers/follows';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

test.describe('Auth registration upgrade', () => {
  test('username availability rejects reserved names', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/auth/username-available?username=support`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.available).toBe(false);
    expect(data.reason).toMatch(/reserved/i);
  });

  test('username availability accepts valid unused names', async ({ request }) => {
    const username = uniqueUsername('avail');
    const res = await request.get(`${API_URL}/api/auth/username-available?username=${username}`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.available).toBe(true);
  });

  test('register via API requires email verification then allows login', async ({ request }) => {
    const username = uniqueUsername('api_reg');
    const email = uniqueEmail('api_reg');
    const reg = await request.post(`${API_URL}/api/auth/register`, {
      data: { username, email, password: DEFAULT_PASSWORD },
    });
    expect(reg.ok()).toBeTruthy();
    const regData = await reg.json();
    expect(regData.registrationComplete).toBe(false);
    expect(regData.user.needsEmailVerification).toBe(true);

    const code = regData.devVerificationCode as string | undefined;
    expect(code).toBeTruthy();
    await verifyRegistrationViaApi(regData.token, code!);

    const loginByEmail = await request.post(`${API_URL}/api/auth/login`, {
      data: { username: email, password: DEFAULT_PASSWORD },
    });
    expect(loginByEmail.ok()).toBeTruthy();

    const loginByUsername = await request.post(`${API_URL}/api/auth/login`, {
      data: { username, password: DEFAULT_PASSWORD },
    });
    expect(loginByUsername.ok()).toBeTruthy();
  });

  test('UI registration shows email verification gate then completes', async ({ page, request }) => {
    const username = uniqueUsername('ui_reg');
    const email = uniqueEmail('ui_reg');

    const reg = await request.post(`${API_URL}/api/auth/register`, {
      data: { username, email, password: DEFAULT_PASSWORD },
    });
    expect(reg.ok()).toBeTruthy();
    const regData = await reg.json();
    const code = regData.devVerificationCode as string;
    expect(code).toBeTruthy();

    await page.goto('/');
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('hin_token', token);
      localStorage.setItem('hin_user', JSON.stringify(user));
    }, { token: regData.token, user: regData.user });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    await page.getByPlaceholder('0000').fill(code);
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  });

  test('login with email works in UI', async ({ page }) => {
    const username = uniqueUsername('login_email');
    const email = uniqueEmail('login_email');
    await registerViaApi(username, DEFAULT_PASSWORD, email);
    await loginUser(page, email, DEFAULT_PASSWORD);
  });

  test('login with username still works in UI', async ({ page }) => {
    const username = uniqueUsername('login_user');
    await registerViaApi(username, DEFAULT_PASSWORD);
    await loginUser(page, username, DEFAULT_PASSWORD);
  });

  test('register rejects duplicate email', async ({ request }) => {
    const usernameA = uniqueUsername('dup_a');
    const usernameB = uniqueUsername('dup_b');
    const email = uniqueEmail('dup');
    const first = await request.post(`${API_URL}/api/auth/register`, {
      data: { username: usernameA, email, password: DEFAULT_PASSWORD },
    });
    expect(first.ok()).toBeTruthy();

    const second = await request.post(`${API_URL}/api/auth/register`, {
      data: { username: usernameB, email, password: DEFAULT_PASSWORD },
    });
    expect(second.status()).toBe(400);
    const body = await second.json();
    expect(body.error).toMatch(/email/i);
  });
});
