import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { SystemSettings } from '@hin/types';
import { DEFAULT_SYSTEM_SETTINGS } from '@hin/types';

type Db = ReturnType<typeof drizzle<typeof schema>>;

function parseIntSetting(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Registry of platform settings stored in system_settings (key-value). */
const SETTING_REGISTRY = {
  maxPinnedPostsPerUser: {
    key: 'max_pinned_posts_per_user',
    defaultValue: DEFAULT_SYSTEM_SETTINGS.maxPinnedPostsPerUser,
    parse: (raw: string | null) => parseIntSetting(raw, DEFAULT_SYSTEM_SETTINGS.maxPinnedPostsPerUser),
  },
  maxPostLength: {
    key: 'max_post_length',
    defaultValue: DEFAULT_SYSTEM_SETTINGS.maxPostLength,
    parse: (raw: string | null) => parseIntSetting(raw, DEFAULT_SYSTEM_SETTINGS.maxPostLength),
  },
  maxMediaPerPost: {
    key: 'max_media_per_post',
    defaultValue: DEFAULT_SYSTEM_SETTINGS.maxMediaPerPost,
    parse: (raw: string | null) => parseIntSetting(raw, DEFAULT_SYSTEM_SETTINGS.maxMediaPerPost),
  },
} as const satisfies Record<
  keyof SystemSettings,
  { key: string; defaultValue: number; parse: (raw: string | null) => number }
>;

export async function getSystemSetting(db: Db, key: string): Promise<string | null> {
  const row = await db
    .select({ value: schema.systemSettings.value })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, key))
    .get();
  return row?.value ?? null;
}

async function getSettingValue<K extends keyof SystemSettings>(db: Db, name: K): Promise<number> {
  const def = SETTING_REGISTRY[name];
  const raw = await getSystemSetting(db, def.key);
  return def.parse(raw);
}

async function upsertSetting(db: Db, key: string, value: number): Promise<void> {
  const existing = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, key))
    .get();

  if (existing) {
    await db
      .update(schema.systemSettings)
      .set({
        value: String(value),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.systemSettings.key, key))
      .run();
  } else {
    await db
      .insert(schema.systemSettings)
      .values({ key, value: String(value) })
      .run();
  }
}

export async function getMaxPinnedPosts(db: Db): Promise<number> {
  return getSettingValue(db, 'maxPinnedPostsPerUser');
}

export async function getMaxPostLength(db: Db): Promise<number> {
  return getSettingValue(db, 'maxPostLength');
}

export async function getMaxMediaPerPost(db: Db): Promise<number> {
  return getSettingValue(db, 'maxMediaPerPost');
}

export async function getSystemSettings(db: Db): Promise<SystemSettings> {
  const entries = await Promise.all(
    (Object.keys(SETTING_REGISTRY) as (keyof SystemSettings)[]).map(async (name) => {
      const value = await getSettingValue(db, name);
      return [name, value] as const;
    }),
  );
  return Object.fromEntries(entries) as SystemSettings;
}

export async function updateSystemSettings(
  db: Db,
  patch: Partial<SystemSettings>,
): Promise<SystemSettings> {
  for (const name of Object.keys(patch) as (keyof SystemSettings)[]) {
    const value = patch[name];
    if (value === undefined) continue;
    await upsertSetting(db, SETTING_REGISTRY[name].key, value);
  }

  return getSystemSettings(db);
}
