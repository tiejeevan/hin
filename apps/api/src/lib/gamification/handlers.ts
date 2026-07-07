import { eq, and, count, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import { registerActionHandler } from './registry';
import { getCounterValue, setCounterValue } from './counters';
import { calendarDayUTC, computeLoginStreakUpdate } from './streaks';
import {
  checkSessionTickAllowance,
  recordSessionTick,
  SESSION_TICK_MINUTES,
} from './abuse';

function num(metadata: Record<string, unknown>, key: string): number | null {
  const v = metadata[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

async function recalcMaxLikesForUser(
  tx: Parameters<typeof getCounterValue>[0],
  userId: number,
): Promise<void> {
  const posts = await tx
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(and(eq(schema.posts.userId, userId), isNull(schema.posts.deletedAt)))
    .all();

  let maxLikes = 0;
  for (const post of posts) {
    const res = await tx
      .select({ value: count() })
      .from(schema.likes)
      .where(and(eq(schema.likes.postId, post.id), isNull(schema.likes.deletedAt)))
      .get();
    maxLikes = Math.max(maxLikes, res?.value ?? 0);
  }

  await setCounterValue(tx, userId, 'max_likes_single_post', maxLikes);
}

function registerV2Handlers(): void {
  registerActionHandler('post_created', async ({ tx, userId, metadata }) => {
    const deltas = [{ userId, metricKey: 'total_posts', delta: 1 }];
    const mediaCount = num(metadata, 'mediaCount') ?? 0;
    if (mediaCount >= 3) {
      deltas.push({ userId, metricKey: 'posts_with_3_images', delta: 1 });
    }
    return deltas;
  });

  registerActionHandler('post_deleted', async ({ tx, userId, metadata }) => {
    const deltas = [{ userId, metricKey: 'total_posts', delta: -1 }];
    const mediaCount = num(metadata, 'mediaCount') ?? 0;
    if (mediaCount >= 3) {
      deltas.push({ userId, metricKey: 'posts_with_3_images', delta: -1 });
    }
    await recalcMaxLikesForUser(tx, userId);
    return deltas;
  });

  registerActionHandler('post_shared', async ({ tx, userId, metadata }) => {
    const postId = num(metadata, 'postId');
    if (postId === null) return [];

    const res = await tx
      .select({ value: count() })
      .from(schema.postShares)
      .where(and(eq(schema.postShares.userId, userId), eq(schema.postShares.postId, postId)))
      .get();

    if ((res?.value ?? 0) === 1) {
      return [{ userId, metricKey: 'unique_posts_shared', delta: 1 }];
    }
    return [];
  });

  registerActionHandler('post_unshared', async ({ tx, userId, metadata }) => {
    const postId = num(metadata, 'postId');
    if (postId === null) return [];

    const res = await tx
      .select({ value: count() })
      .from(schema.postShares)
      .where(and(eq(schema.postShares.userId, userId), eq(schema.postShares.postId, postId)))
      .get();

    if ((res?.value ?? 0) === 0) {
      return [{ userId, metricKey: 'unique_posts_shared', delta: -1 }];
    }
    return [];
  });

  registerActionHandler('user_followed', async ({ userId }) => {
    return [{ userId, metricKey: 'follower_count', delta: 1 }];
  });

  registerActionHandler('user_unfollowed', async ({ userId }) => {
    return [{ userId, metricKey: 'follower_count', delta: -1 }];
  });

  registerActionHandler('post_liked', async ({ tx, userId, metadata }) => {
    const likeCount = num(metadata, 'likeCount');
    if (likeCount === null) return [];

    const current = await getCounterValue(tx, userId, 'max_likes_single_post');
    if (likeCount > current) {
      await setCounterValue(tx, userId, 'max_likes_single_post', likeCount);
    }
    return [];
  });

  registerActionHandler('post_unliked', async ({ tx, userId }) => {
    await recalcMaxLikesForUser(tx, userId);
    return [];
  });
}

function registerV3Handlers(): void {
  registerActionHandler('session_active', async ({ tx, userId }) => {
    const today = calendarDayUTC();

    const row = await tx
      .select()
      .from(schema.userStreaks)
      .where(
        and(
          eq(schema.userStreaks.userId, userId),
          eq(schema.userStreaks.streakType, 'login'),
        ),
      )
      .get();

    const current = row?.current ?? 0;
    const longest = row?.longest ?? 0;
    const lastDate = row?.lastActivityDate ?? null;

    const update = computeLoginStreakUpdate(lastDate, current, longest, today);
    if (!update.updated) return [];

    if (row) {
      await tx
        .update(schema.userStreaks)
        .set({
          current: update.newCurrent,
          longest: update.newLongest,
          lastActivityDate: today,
        })
        .where(
          and(
            eq(schema.userStreaks.userId, userId),
            eq(schema.userStreaks.streakType, 'login'),
          ),
        )
        .run();
    } else {
      await tx.insert(schema.userStreaks).values({
        userId,
        streakType: 'login',
        current: update.newCurrent,
        longest: update.newLongest,
        lastActivityDate: today,
      }).run();
    }

    await setCounterValue(tx, userId, 'login_streak', update.newCurrent);
    return [];
  });

  registerActionHandler('comment_created', async ({ tx, userId, metadata }) => {
    const postId = num(metadata, 'postId');
    if (postId === null) return [];

    const deltas = [{ userId, metricKey: 'total_comments', delta: 1 }];

    const res = await tx
      .select({ value: count() })
      .from(schema.comments)
      .where(
        and(
          eq(schema.comments.userId, userId),
          eq(schema.comments.postId, postId),
          isNull(schema.comments.deletedAt),
        ),
      )
      .get();

    if ((res?.value ?? 0) === 1) {
      deltas.push({ userId, metricKey: 'unique_posts_commented', delta: 1 });
    }
    return deltas;
  });

  registerActionHandler('comment_deleted', async ({ tx, userId, metadata }) => {
    const postId = num(metadata, 'postId');
    if (postId === null) return [];

    const deltas = [{ userId, metricKey: 'total_comments', delta: -1 }];

    const res = await tx
      .select({ value: count() })
      .from(schema.comments)
      .where(
        and(
          eq(schema.comments.userId, userId),
          eq(schema.comments.postId, postId),
          isNull(schema.comments.deletedAt),
        ),
      )
      .get();

    if ((res?.value ?? 0) === 0) {
      deltas.push({ userId, metricKey: 'unique_posts_commented', delta: -1 });
    }
    return deltas;
  });
}

function registerV4Handlers(): void {
  registerActionHandler('session_tick', async ({ tx, userId, metadata }) => {
    const rawMinutes = num(metadata, 'minutes') ?? SESSION_TICK_MINUTES;
    const allowance = await checkSessionTickAllowance(tx, userId, rawMinutes);
    if (!allowance.allowed || allowance.minutes <= 0) return [];

    await recordSessionTick(tx, userId, allowance.minutes);
    return [{ userId, metricKey: 'total_session_minutes', delta: allowance.minutes }];
  });

  registerActionHandler('like_given', async ({ userId }) => {
    return [{ userId, metricKey: 'likes_given', delta: 1 }];
  });

  registerActionHandler('like_removed', async ({ userId }) => {
    return [{ userId, metricKey: 'likes_given', delta: -1 }];
  });
}

registerV2Handlers();
registerV3Handlers();
registerV4Handlers();
