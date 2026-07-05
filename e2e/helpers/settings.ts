import { expect, type Page } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export type SettingsSection = 'Privacy' | 'Notifications' | 'Chat' | 'Blocked & muted';

export interface UserSettingsApi {
  isPrivate: boolean;
  notifyLikes: boolean;
  notifyComments: boolean;
  notifyMentions: boolean;
  notifyDms: boolean;
  notifySystem: boolean;
  muteAllToasts: boolean;
  chatIconMode: 'global' | 'selected_pages';
  chatIconPages: ('feed' | 'profile' | 'post')[];
  updatedAt: string;
}

export const DEFAULT_SETTINGS: Omit<UserSettingsApi, 'updatedAt'> = {
  isPrivate: false,
  notifyLikes: true,
  notifyComments: true,
  notifyMentions: true,
  notifyDms: true,
  notifySystem: true,
  muteAllToasts: false,
  chatIconMode: 'global',
  chatIconPages: [],
};

const NOTIFICATION_SWITCHES = [
  'Likes',
  'Comments',
  'Mentions',
  'Direct messages',
  'System broadcasts',
  'Mute all toasts',
] as const;

export async function openOwnProfile(page: Page, username: string) {
  await page.locator('header').getByRole('button', { name: username, exact: true }).click();
}

export async function openProfileSettings(page: Page) {
  await page.getByRole('button', { name: 'Profile settings' }).click();
  await expect(page.getByRole('heading', { name: 'Profile settings' })).toBeVisible();
}

export function settingsPanel(page: Page) {
  return page.locator('div').filter({
    has: page.getByRole('heading', { name: 'Profile settings', level: 2 }),
  }).first();
}

export function sectionButton(page: Page, section: SettingsSection) {
  return settingsPanel(page).locator('button[aria-expanded]').filter({ hasText: section });
}

export async function closeProfileSettings(page: Page) {
  await settingsPanel(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profile settings' })).not.toBeVisible();
}

export async function expandSettingsSection(page: Page, section: SettingsSection) {
  const button = sectionButton(page, section);
  if ((await button.getAttribute('aria-expanded')) !== 'true') {
    await button.click();
  }
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

export async function collapseSettingsSection(page: Page, section: SettingsSection) {
  const button = sectionButton(page, section);
  if ((await button.getAttribute('aria-expanded')) === 'true') {
    await button.click();
  }
  await expect(button).toHaveAttribute('aria-expanded', 'false');
}

export async function expectSectionCollapsed(page: Page, section: SettingsSection) {
  await expect(sectionButton(page, section)).toHaveAttribute('aria-expanded', 'false');
}

export async function expectSwitchState(page: Page, label: string, on: boolean) {
  await expect(page.getByRole('switch', { name: label })).toHaveAttribute(
    'aria-checked',
    on ? 'true' : 'false',
  );
}

export async function setSwitchState(page: Page, label: string, on: boolean) {
  const sw = page.getByRole('switch', { name: label });
  const checked = (await sw.getAttribute('aria-checked')) === 'true';
  if (checked !== on) {
    const patch = page.waitForResponse(
      res =>
        res.url().includes('/api/users/me/settings') &&
        res.request().method() === 'PATCH' &&
        res.ok(),
    );
    await sw.click();
    await patch;
  }
  await expectSwitchState(page, label, on);
}

export async function getSettingsViaApi(token: string): Promise<UserSettingsApi> {
  const res = await fetch(`${API_URL}/api/users/me/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET settings failed: ${await res.text()}`);
  return res.json();
}

export async function patchSettingsViaApi(
  token: string,
  patch: Partial<UserSettingsApi>,
): Promise<UserSettingsApi> {
  const res = await fetch(`${API_URL}/api/users/me/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH settings failed: ${await res.text()}`);
  return res.json();
}

export function messagesFab(page: Page) {
  return page.getByRole('button', { name: /^Messages/ });
}

export async function expectMessagesFabVisible(page: Page, visible: boolean) {
  if (visible) {
    await expect(messagesFab(page)).toBeVisible();
  } else {
    await expect(messagesFab(page)).not.toBeVisible();
  }
}

export async function setChatIconMode(page: Page, mode: 'global' | 'selected_pages') {
  await expandSettingsSection(page, 'Chat');
  const label = mode === 'global' ? 'Everywhere' : 'Only on selected pages';
  const patch = page.waitForResponse(
    res =>
      res.url().includes('/api/users/me/settings') &&
      res.request().method() === 'PATCH' &&
      res.ok(),
  );
  await page.getByRole('radio', { name: label }).check();
  await patch;
}

export async function setChatPageChecked(
  page: Page,
  pageLabel: 'Feed' | 'Profile' | 'Post view',
  checked: boolean,
) {
  await expandSettingsSection(page, 'Chat');
  const checkbox = page.getByRole('checkbox', { name: pageLabel });
  const isChecked = await checkbox.isChecked();
  if (isChecked !== checked) {
    const patch = page.waitForResponse(
      res =>
        res.url().includes('/api/users/me/settings') &&
        res.request().method() === 'PATCH' &&
        res.ok(),
    );
    await checkbox.click();
    await patch;
  }
  if (checked) {
    await expect(checkbox).toBeChecked();
  } else {
    await expect(checkbox).not.toBeChecked();
  }
}

export async function openSettingsWithSection(page: Page, username: string, section: SettingsSection) {
  await openOwnProfile(page, username);
  await openProfileSettings(page);
  await expandSettingsSection(page, section);
}

export { NOTIFICATION_SWITCHES };
