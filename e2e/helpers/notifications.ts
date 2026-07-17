import { expect, type Page } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export type NotificationApi = {
  id: number;
  userId: number;
  senderId: number;
  senderUsername: string;
  type: string;
  entityType?: string | null;
  entityId: number;
  commentId?: number | null;
  content: string;
  category?: 'social' | 'gamification';
  read: boolean;
  createdAt: string;
};

export async function fetchNotificationsViaApi(token: string): Promise<NotificationApi[]> {
  const res = await fetch(`${API_URL}/api/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Fetch notifications failed: ${await res.text()}`);
  return res.json();
}

export async function fetchUnreadCountViaApi(token: string): Promise<number> {
  const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Fetch unread count failed: ${await res.text()}`);
  const data = await res.json();
  return data.count as number;
}

export async function markNotificationReadViaApi(token: string, id: number) {
  const res = await fetch(`${API_URL}/api/notifications/${id}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Mark read failed: ${await res.text()}`);
  return res.json();
}

export async function markAllNotificationsReadViaApi(
  token: string,
  category?: 'social' | 'gamification',
) {
  const query = category ? `?category=${category}` : '';
  const res = await fetch(`${API_URL}/api/notifications/read-all${query}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Mark all read failed: ${await res.text()}`);
  return res.json();
}

export async function broadcastSystemViaApi(
  adminToken: string,
  message: string,
  delivery: 'notification' | 'toast' | 'both' = 'notification',
) {
  const res = await fetch(`${API_URL}/api/admin/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ message, delivery }),
  });
  if (!res.ok) throw new Error(`Broadcast failed: ${await res.text()}`);
  return res.json() as Promise<{
    success: boolean;
    notificationsCreated: number;
    message: string;
  }>;
}

/**
 * Seed a notification for one user via local D1.
 * Prefer this over admin broadcast for inbox UI tests — broadcast inserts
 * one row per user and can hit D1 "too many SQL variables" on large local DBs.
 */
export async function insertNotificationViaD1(opts: {
  userId: number;
  senderId: number;
  type: string;
  content: string;
  entityType?: string;
  entityId?: number;
  commentId?: number | null;
  category?: 'social' | 'gamification';
  read?: boolean;
}): Promise<number> {
  const { execSync } = await import('node:child_process');
  const { writeFileSync, unlinkSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const repoRoot = process.cwd().includes('e2e') ? `${process.cwd()}/..` : process.cwd();
  const entityType = opts.entityType ?? (opts.type === 'system' ? 'system' : 'post');
  const entityId = opts.entityId ?? 0;
  const category = opts.category ?? (['badge_award', 'level_up', 'event_win'].includes(opts.type)
    ? 'gamification'
    : 'social');
  const read = opts.read ? 1 : 0;
  const commentIdSql = opts.commentId == null ? 'NULL' : String(opts.commentId);
  const content = opts.content.replace(/'/g, "''");
  const sql = `INSERT INTO notifications (user_id, sender_id, type, entity_type, entity_id, comment_id, content, category, read) VALUES (${opts.userId}, ${opts.senderId}, '${opts.type}', '${entityType}', ${entityId}, ${commentIdSql}, '${content}', '${category}', ${read}); SELECT last_insert_rowid() AS id;`;
  const sqlPath = join(tmpdir(), `hin-notif-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(sqlPath, sql, 'utf8');
  try {
    const out = execSync(
      `cd "${repoRoot}/apps/api" && npx wrangler d1 execute hin-d1 --local -c wrangler.toml --file "${sqlPath}"`,
      { encoding: 'utf8' },
    );
    const match = out.match(/"id":\s*(\d+)/);
    if (!match) throw new Error(`Failed to insert notification via D1: ${out}`);
    return parseInt(match[1], 10);
  } finally {
    try {
      unlinkSync(sqlPath);
    } catch {
      /* ignore */
    }
  }
}

export function notificationsBell(page: Page) {
  return page.getByRole('button', { name: /Notifications/ });
}

export function notificationPanel(page: Page) {
  return page.locator('#notification-panel-dropdown');
}

export function notificationItems(page: Page) {
  return page.locator('[data-notification-item]');
}

export async function openNotificationsPanel(page: Page) {
  await notificationsBell(page).click();
  await expect(notificationPanel(page)).toBeVisible();
}

export async function closeNotificationsPanelViaDismiss(page: Page) {
  await notificationPanel(page).getByRole('button', { name: 'Dismiss notifications' }).click();
  await expect(notificationPanel(page)).not.toBeVisible();
}

export async function expectNotificationVisible(page: Page, text: string | RegExp) {
  const item = notificationItems(page).filter({ hasText: text }).first();
  await expect(item).toBeVisible({ timeout: 15_000 });
  return item;
}

export async function expectNotificationAbsent(page: Page, text: string | RegExp) {
  await expect(notificationItems(page).filter({ hasText: text })).toHaveCount(0, {
    timeout: 5_000,
  });
}

export async function waitForNotificationViaApi(
  token: string,
  predicate: (n: NotificationApi) => boolean,
  opts?: { timeoutMs?: number; intervalMs?: number },
) {
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const intervalMs = opts?.intervalMs ?? 400;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const list = await fetchNotificationsViaApi(token);
    const match = list.find(predicate);
    if (match) return match;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for notification via API');
}

export async function expectBellUnread(page: Page, count: number | '9+') {
  const bell = notificationsBell(page);
  if (count === 0) {
    await expect(bell).toHaveAttribute('aria-label', 'Notifications');
    return;
  }
  if (count === '9+') {
    await expect(bell).toHaveAttribute('aria-label', /Notifications, \d+ unread/);
    await expect(bell.locator('span').filter({ hasText: '9+' })).toBeVisible();
    return;
  }
  await expect(bell).toHaveAttribute('aria-label', `Notifications, ${count} unread`);
  await expect(bell.locator('span').filter({ hasText: String(count) })).toBeVisible();
}
