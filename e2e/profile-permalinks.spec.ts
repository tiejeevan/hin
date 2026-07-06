import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, loginUser, uniqueUsername } from './helpers/auth';
import {
  createPostViaApi,
  registerViaApi,
  setPrivateViaApi,
} from './helpers/follows';
import { getProfileByUsernameViaApi } from './helpers/reports';

test.describe('Profile permalinks API', () => {
  test('GET /api/users/username/:username returns public profile to guest', async () => {
    const authorName = uniqueUsername('prof_api_guest');
    await registerViaApi(authorName, DEFAULT_PASSWORD);
    const res = await getProfileByUsernameViaApi(null, authorName);
    expect(res.status).toBe(200);
    expect(res.data.username).toBe(authorName);
    expect(res.data.canViewPosts).toBe(true);
  });

  test('GET /api/users/username/:username returns private profile with canViewPosts false for guest', async () => {
    const authorName = uniqueUsername('prof_api_private');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await setPrivateViaApi(author.token);
    const res = await getProfileByUsernameViaApi(null, authorName);
    expect(res.status).toBe(200);
    expect(res.data.canViewPosts).toBe(false);
  });

  test('GET /api/users/username/:username returns 404 for unknown user', async () => {
    const res = await getProfileByUsernameViaApi(null, uniqueUsername('nobody'));
    expect(res.status).toBe(404);
  });
});

test.describe('Profile permalinks UI', () => {
  test('guest can open public profile at /profile/:username', async ({ page }) => {
    const authorName = uniqueUsername('prof_guest');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const content = `Profile permalink post ${Date.now()}`;
    await createPostViaApi(author.token, content, { visibility: 'public' });

    await page.goto(`/profile/${authorName}`);
    await expect(page.getByText(`@${authorName}`)).toBeVisible();
    await expect(page.getByText(content)).toBeVisible();
  });

  test('guest sees private account locked state', async ({ page }) => {
    const authorName = uniqueUsername('prof_private_guest');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await setPrivateViaApi(author.token);

    await page.goto(`/profile/${authorName}`);
    await expect(page.getByText('This account is private')).toBeVisible();
  });

  test('logged-in user URL updates when opening profile from post', async ({ page }) => {
    const authorName = uniqueUsername('prof_url_author');
    const viewerName = uniqueUsername('prof_url_viewer');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `URL nav ${Date.now()}`, { visibility: 'public' });

    await loginUser(page, viewerName);
    await page.goto(`/post/${post.id}`);
    await page.getByRole('button', { name: authorName, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/profile/${authorName}$`));
  });

  test('browser back from profile returns home', async ({ page }) => {
    const authorName = uniqueUsername('prof_back');
    await registerViaApi(authorName, DEFAULT_PASSWORD);
    await loginUser(page, uniqueUsername('prof_back_viewer'));

    await page.goto(`/profile/${authorName}`);
    await expect(page).toHaveURL(new RegExp(`/profile/${authorName}$`));
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test('guest sign-in from profile stays on permalink', async ({ page }) => {
    const authorName = uniqueUsername('prof_guest_login');
    const guestName = uniqueUsername('prof_guest_user');
    const author = await registerViaApi(authorName, DEFAULT_PASSWORD);
    await createPostViaApi(author.token, `Guest login profile ${Date.now()}`, { visibility: 'public' });

    await page.goto(`/profile/${authorName}`);
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    await page.getByRole('button', { name: "Don't have an account? Register" }).click();
    await page.getByPlaceholder('Enter username').fill(guestName);
    await page.getByPlaceholder('••••••••').fill(DEFAULT_PASSWORD);
    await page.getByRole('button', { name: 'Register Account' }).click();
    await expect(page).toHaveURL(new RegExp(`/profile/${authorName}$`));
  });
});
