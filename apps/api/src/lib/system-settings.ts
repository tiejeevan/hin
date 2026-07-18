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

function parseBooleanSetting(raw: string | null, fallback: boolean): boolean {
  if (raw === null) return fallback;
  return raw === 'true' || raw === '1';
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
  turnstileEnabled: {
    key: 'turnstile_enabled',
    defaultValue: DEFAULT_SYSTEM_SETTINGS.turnstileEnabled,
    parse: (raw: string | null) => parseBooleanSetting(raw, DEFAULT_SYSTEM_SETTINGS.turnstileEnabled),
  },
  olabidEnabled: {
    key: 'olabid_enabled',
    defaultValue: DEFAULT_SYSTEM_SETTINGS.olabidEnabled,
    parse: (raw: string | null) => parseBooleanSetting(raw, DEFAULT_SYSTEM_SETTINGS.olabidEnabled),
  },
} as const satisfies Record<
  keyof SystemSettings,
  { key: string; defaultValue: number | boolean; parse: (raw: string | null) => number | boolean }
>;

let cachedSystemSettings: { value: SystemSettings; epoch: string; fetchedAt: number } | null = null;
const SYSTEM_SETTINGS_EPOCH_KEY = 'system_settings_epoch';
const FLAG_CACHE_TTL_MS = 5_000;

export function invalidateSystemSettingsCache(): void {
  cachedSystemSettings = null;
}

export async function getSystemSetting(db: Db, key: string): Promise<string | null> {
  const row = await db
    .select({ value: schema.systemSettings.value })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, key))
    .get();
  return row?.value ?? null;
}

async function getSettingValue<K extends keyof SystemSettings>(db: Db, name: K): Promise<SystemSettings[K]> {
  const def = SETTING_REGISTRY[name];
  const raw = await getSystemSetting(db, def.key);
  return def.parse(raw) as SystemSettings[K];
}

async function upsertSetting(db: Db, key: string, value: number | boolean | string): Promise<void> {
  const valueStr = String(value);
  const existing = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, key))
    .get();

  if (existing) {
    await db
      .update(schema.systemSettings)
      .set({
        value: valueStr,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.systemSettings.key, key))
      .run();
  } else {
    await db
      .insert(schema.systemSettings)
      .values({ key, value: valueStr })
      .run();
  }
}

export async function getMaxPinnedPosts(db: Db): Promise<number> {
  return (await getSystemSettings(db)).maxPinnedPostsPerUser;
}

export async function getMaxPostLength(db: Db): Promise<number> {
  return (await getSystemSettings(db)).maxPostLength;
}

export async function getMaxMediaPerPost(db: Db): Promise<number> {
  return (await getSystemSettings(db)).maxMediaPerPost;
}

export async function isOlabidEnabled(db: Db): Promise<boolean> {
  return (await getSystemSettings(db)).olabidEnabled;
}

export async function getSystemSettings(db: Db): Promise<SystemSettings> {
  const now = Date.now();

  if (
    cachedSystemSettings
    && now - cachedSystemSettings.fetchedAt < FLAG_CACHE_TTL_MS
  ) {
    return cachedSystemSettings.value;
  }

  const epoch = (await getSystemSetting(db, SYSTEM_SETTINGS_EPOCH_KEY)) ?? '0';

  if (cachedSystemSettings && cachedSystemSettings.epoch === epoch) {
    cachedSystemSettings.fetchedAt = now;
    return cachedSystemSettings.value;
  }

  const entries = await Promise.all(
    (Object.keys(SETTING_REGISTRY) as (keyof SystemSettings)[]).map(async (name) => {
      const value = await getSettingValue(db, name);
      return [name, value] as const;
    }),
  );
  const value = Object.fromEntries(entries) as SystemSettings;
  cachedSystemSettings = { value, epoch, fetchedAt: now };
  return value;
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

  // Bump epoch so every worker isolate invalidates its cache on next read.
  await upsertSetting(db, SYSTEM_SETTINGS_EPOCH_KEY, String(Date.now()));

  invalidateSystemSettingsCache();
  return getSystemSettings(db);
}

