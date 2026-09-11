import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { Env } from '../types';
import {
  refreshPostSharePreview,
  refreshPostSharePreviewsForUser,
  refreshProfileSharePreviewByUserId,
} from './sharePreview';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Best-effort cache refresh; never throws to callers. */
export async function refreshPostSharePreviewSafe(
  db: Db,
  postId: number,
  env: Pick<Env, 'SITE_URL' | 'API_PUBLIC_URL'>,
  requestOrigin?: string,
): Promise<void> {
  try {
    await refreshPostSharePreview(db, postId, env, requestOrigin);
  } catch {
    /* share preview cache is non-critical */
  }
}

export async function refreshProfileSharePreviewSafe(
  db: Db,
  userId: number,
  env: Pick<Env, 'SITE_URL' | 'API_PUBLIC_URL'>,
  requestOrigin?: string,
): Promise<void> {
  try {
    await refreshProfileSharePreviewByUserId(db, userId, env, requestOrigin);
  } catch {
    /* share preview cache is non-critical */
  }
}

export async function refreshPostSharePreviewsForUserSafe(
  db: Db,
  userId: number,
  env: Pick<Env, 'SITE_URL' | 'API_PUBLIC_URL'>,
  requestOrigin?: string,
): Promise<void> {
  try {
    await refreshPostSharePreviewsForUser(db, userId, env, requestOrigin);
  } catch {
    /* share preview cache is non-critical */
  }
}
