import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type {
  ChatIconPage,
  Notification,
  UserSettings,
} from '@hin/types';
import {
  DEFAULT_USER_SETTINGS,
  isNotificationEnabledForSettings,
  shouldShowNotificationToast,
} from '@hin/types';

type Db = DrizzleD1Database<typeof schema>;

type UserSettingsRow = typeof schema.userSettings.$inferSelect;

function parseChatIconPages(raw: string): ChatIconPage[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is ChatIconPage => p === 'feed' || p === 'profile' || p === 'post',
    );
  } catch {
    return [];
  }
}

export function toPublicSettings(row: UserSettingsRow, isPrivate: boolean): UserSettings {
  return {
    isPrivate,
    notifyLikes: row.notifyLikes === 1,
    notifyComments: row.notifyComments === 1,
    notifyMentions: row.notifyMentions === 1,
    notifyDms: row.notifyDms === 1,
    notifySystem: row.notifySystem === 1,
    muteAllToasts: row.muteAllToasts === 1,
    chatIconMode: row.chatIconMode === 'selected_pages' ? 'selected_pages' : 'global',
    chatIconPages: parseChatIconPages(row.chatIconPages),
    updatedAt: row.updatedAt,
  };
}

export async function ensureUserSettingsRow(db: Db, userId: number): Promise<UserSettingsRow> {
  const existing = await db.select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .get();

  if (existing) return existing;

  const [inserted] = await db.insert(schema.userSettings)
    .values({ userId })
    .returning();

  return inserted;
}

export async function getOrCreateUserSettings(db: Db, userId: number): Promise<UserSettings> {
  const [user, settingsRow] = await Promise.all([
    db.select({ isPrivate: schema.users.isPrivate })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get(),
    ensureUserSettingsRow(db, userId),
  ]);

  return toPublicSettings(settingsRow, (user?.isPrivate ?? 0) === 1);
}

export function isNotificationEnabled(settings: UserSettings, type: Notification['type']): boolean {
  return isNotificationEnabledForSettings(settings, type);
}

export function shouldShowToast(settings: UserSettings, type: Notification['type'] | 'system'): boolean {
  return shouldShowNotificationToast(settings, type);
}

export function settingsRowUpdatesFromPatch(
  patch: Partial<{
    notifyLikes: boolean;
    notifyComments: boolean;
    notifyMentions: boolean;
    notifyDms: boolean;
    notifySystem: boolean;
    muteAllToasts: boolean;
    chatIconMode: 'global' | 'selected_pages';
    chatIconPages: ChatIconPage[];
  }>,
): Partial<typeof schema.userSettings.$inferInsert> {
  const updates: Partial<typeof schema.userSettings.$inferInsert> = {};

  if (patch.notifyLikes !== undefined) updates.notifyLikes = patch.notifyLikes ? 1 : 0;
  if (patch.notifyComments !== undefined) updates.notifyComments = patch.notifyComments ? 1 : 0;
  if (patch.notifyMentions !== undefined) updates.notifyMentions = patch.notifyMentions ? 1 : 0;
  if (patch.notifyDms !== undefined) updates.notifyDms = patch.notifyDms ? 1 : 0;
  if (patch.notifySystem !== undefined) updates.notifySystem = patch.notifySystem ? 1 : 0;
  if (patch.muteAllToasts !== undefined) updates.muteAllToasts = patch.muteAllToasts ? 1 : 0;
  if (patch.chatIconMode !== undefined) updates.chatIconMode = patch.chatIconMode;
  if (patch.chatIconPages !== undefined) updates.chatIconPages = JSON.stringify(patch.chatIconPages);

  return updates;
}

export { DEFAULT_USER_SETTINGS };
