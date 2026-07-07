import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { GamificationSettings } from '@hin/types';
import { getSystemSetting } from '../system-settings';

export const GAMIFICATION_ENABLED_KEY = 'gamification_enabled';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cachedFlag: { value: boolean; fetchedAt: number } | null = null;
const FLAG_CACHE_TTL_MS = 60_000;

export function invalidateGamificationFlagCache(): void {
  cachedFlag = null;
}

/** Default false — no row in system_settings means gamification is OFF. */
export async function isGamificationEnabled(db: Db): Promise<boolean> {
  const now = Date.now();
  if (cachedFlag && now - cachedFlag.fetchedAt < FLAG_CACHE_TTL_MS) {
    return cachedFlag.value;
  }

  const raw = await getSystemSetting(db, GAMIFICATION_ENABLED_KEY);
  const value = raw === 'true';
  cachedFlag = { value, fetchedAt: now };
  return value;
}

export async function getGamificationSettings(db: Db): Promise<GamificationSettings> {
  const gamificationEnabled = await isGamificationEnabled(db);
  return { gamificationEnabled };
}

export async function setGamificationEnabled(db: Db, enabled: boolean): Promise<GamificationSettings> {
  const key = GAMIFICATION_ENABLED_KEY;
  const value = enabled ? 'true' : 'false';
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
    await db
      .insert(schema.systemSettings)
      .values({ key, value })
      .run();
  }

  invalidateGamificationFlagCache();
  return { gamificationEnabled: enabled };
}
