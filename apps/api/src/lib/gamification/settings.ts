import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { GamificationSettings } from '@hin/types';
import { getSystemSetting } from '../system-settings';

export const GAMIFICATION_ENABLED_KEY = 'gamification_enabled';
export const GAMIFICATION_SHOW_LEVEL_KEY = 'gamification_show_level';
export const GAMIFICATION_SHOW_POINTS_KEY = 'gamification_show_points';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface GamificationVisibility {
  showLevel: boolean;
  showPoints: boolean;
}

let cachedSettings: { value: GamificationSettings; fetchedAt: number } | null = null;
const FLAG_CACHE_TTL_MS = 60_000;

export function invalidateGamificationFlagCache(): void {
  cachedSettings = null;
}

async function loadSettings(db: Db): Promise<GamificationSettings> {
  const now = Date.now();
  if (cachedSettings && now - cachedSettings.fetchedAt < FLAG_CACHE_TTL_MS) {
    return cachedSettings.value;
  }

  const [enabledRaw, showLevelRaw, showPointsRaw] = await Promise.all([
    getSystemSetting(db, GAMIFICATION_ENABLED_KEY),
    getSystemSetting(db, GAMIFICATION_SHOW_LEVEL_KEY),
    getSystemSetting(db, GAMIFICATION_SHOW_POINTS_KEY),
  ]);

  const value: GamificationSettings = {
    // Default false — no row means gamification is OFF.
    gamificationEnabled: enabledRaw === 'true',
    // Default true — level/points are visible unless explicitly hidden.
    showLevel: showLevelRaw !== 'false',
    showPoints: showPointsRaw !== 'false',
  };
  cachedSettings = { value, fetchedAt: now };
  return value;
}

export async function isGamificationEnabled(db: Db): Promise<boolean> {
  return (await loadSettings(db)).gamificationEnabled;
}

export async function getGamificationVisibility(db: Db): Promise<GamificationVisibility> {
  const settings = await loadSettings(db);
  return { showLevel: settings.showLevel, showPoints: settings.showPoints };
}

export async function getGamificationSettings(db: Db): Promise<GamificationSettings> {
  return loadSettings(db);
}

async function upsertSetting(db: Db, key: string, value: string): Promise<void> {
  const existing = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, key))
    .get();

  if (existing) {
    await db
      .update(schema.systemSettings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(schema.systemSettings.key, key))
      .run();
  } else {
    await db.insert(schema.systemSettings).values({ key, value }).run();
  }
}

export async function updateGamificationSettings(
  db: Db,
  patch: Partial<GamificationSettings>,
): Promise<GamificationSettings> {
  if (patch.gamificationEnabled !== undefined) {
    await upsertSetting(db, GAMIFICATION_ENABLED_KEY, patch.gamificationEnabled ? 'true' : 'false');
  }
  if (patch.showLevel !== undefined) {
    await upsertSetting(db, GAMIFICATION_SHOW_LEVEL_KEY, patch.showLevel ? 'true' : 'false');
  }
  if (patch.showPoints !== undefined) {
    await upsertSetting(db, GAMIFICATION_SHOW_POINTS_KEY, patch.showPoints ? 'true' : 'false');
  }

  invalidateGamificationFlagCache();
  return loadSettings(db);
}
