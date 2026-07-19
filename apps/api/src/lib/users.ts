import { eq, and, count, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import { FollowStatus, User, BlockStatus, MuteStatus, type EquippedBadgePublic } from '@hin/types';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/d1';
import {
  canViewUserPosts,
  getFollowStatus,
  getFollowerCount,
  getFollowingCount,
} from './follows';
import { getBlockStatus } from './blocks';
import { getMuteStatus } from './mutes';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export function toPublicUser(
  user: {
    id: number;
    username: string;
    role: string;
    bio?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    isPrivate?: number | boolean | null;
    createdAt: string;
    deletedAt?: string | null;
    country?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth?: string | null;
    profileCompletedAt?: string | null;
  },
  extras?: {
    postCount?: number | null;
    followerCount?: number;
    followingCount?: number;
    followStatus?: FollowStatus;
    canViewPosts?: boolean;
    blockStatus?: BlockStatus;
    muteStatus?: MuteStatus;
    equippedBadges?: EquippedBadgePublic[];
  },
): User {
  return {
    id: user.id,
    username: user.username,
    role: user.role as User['role'],
    bio: user.bio ?? null,
    avatarUrl: user.avatarUrl ?? null,
    coverUrl: user.coverUrl ?? null,
    isPrivate: !!(user.isPrivate && user.isPrivate !== 0),
    createdAt: user.createdAt,
    deletedAt: user.deletedAt ?? null,
    country: user.country ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    profileCompletedAt: user.profileCompletedAt ?? null,
    ...(extras?.postCount !== undefined ? { postCount: extras.postCount } : {}),
    ...(extras?.followerCount !== undefined ? { followerCount: extras.followerCount } : {}),
    ...(extras?.followingCount !== undefined ? { followingCount: extras.followingCount } : {}),
    ...(extras?.followStatus !== undefined ? { followStatus: extras.followStatus } : {}),
    ...(extras?.canViewPosts !== undefined ? { canViewPosts: extras.canViewPosts } : {}),
    ...(extras?.blockStatus !== undefined ? { blockStatus: extras.blockStatus } : {}),
    ...(extras?.muteStatus !== undefined ? { muteStatus: extras.muteStatus } : {}),
    ...(extras?.equippedBadges !== undefined ? { equippedBadges: extras.equippedBadges } : {}),
  };
}

/** Authenticated self view — includes private email fields. Never use for public profiles. */
export function toSelfUser(
  user: {
    id: number;
    username: string;
    role: string;
    bio?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    isPrivate?: number | boolean | null;
    createdAt: string;
    deletedAt?: string | null;
    country?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth?: string | null;
    profileCompletedAt?: string | null;
    email?: string | null;
    emailVerifiedAt?: string | null;
    passwordHash?: string | null;
  },
  extras?: Parameters<typeof toPublicUser>[1],
): User {
  return {
    ...toPublicUser(user, extras),
    email: user.email ?? null,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    hasPassword: !!(user.passwordHash && user.passwordHash.length > 0),
  };
}

export const USER_PUBLIC_FIELDS = {
  id: schema.users.id,
  username: schema.users.username,
  role: schema.users.role,
  bio: schema.users.bio,
  avatarUrl: schema.users.avatarUrl,
  coverUrl: schema.users.coverUrl,
  isPrivate: schema.users.isPrivate,
  createdAt: schema.users.createdAt,
  country: schema.users.country,
  firstName: schema.users.firstName,
  lastName: schema.users.lastName,
  dateOfBirth: schema.users.dateOfBirth,
  profileCompletedAt: schema.users.profileCompletedAt,
};

/** Public fields plus private email — only select when viewer is self. */
export const USER_SELF_FIELDS = {
  ...USER_PUBLIC_FIELDS,
  email: schema.users.email,
  emailVerifiedAt: schema.users.emailVerifiedAt,
};

type UserRow = {
  id: number;
  username: string;
  role: string;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  isPrivate?: number | boolean | null;
  createdAt: string;
  country?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  profileCompletedAt?: string | null;
  email?: string | null;
  emailVerifiedAt?: string | null;
};

export async function buildProfileResponse(
  db: Db,
  viewerId: number | null,
  user: UserRow,
): Promise<User | null> {
  const userId = user.id;
  const isSelf = viewerId !== null && viewerId === userId;

  if (viewerId) {
    const blockStatus = await getBlockStatus(db, viewerId, userId);
    if (blockStatus === 'blocked_you') return null;

    const [followerCount, followingCount, followStatus, canView, muteStatus] = await Promise.all([
      getFollowerCount(db, userId),
      getFollowingCount(db, userId),
      getFollowStatus(db, viewerId, userId),
      canViewUserPosts(db, viewerId, { id: user.id, isPrivate: user.isPrivate }),
      getMuteStatus(db, viewerId, userId),
    ]);

    const canViewPosts = blockStatus === 'you_blocked' ? false : canView;

    const postCountConditions = [
      eq(schema.posts.userId, userId),
      sql`${schema.posts.deletedAt} IS NULL`,
    ];
    if (!canView) {
      postCountConditions.push(eq(schema.posts.visibility, 'public'));
    }
    const postCountRes = await db.select({ value: count() })
      .from(schema.posts)
      .where(and(...postCountConditions))
      .get();

    const extras = {
      postCount: postCountRes?.value || 0,
      followerCount,
      followingCount,
      followStatus,
      canViewPosts,
      blockStatus,
      muteStatus,
    };

    return isSelf ? toSelfUser(user, extras) : toPublicUser(user, extras);
  }

  // Guest viewer
  const isPrivate = !!(user.isPrivate && user.isPrivate !== 0);
  const canViewPosts = !isPrivate;

  const [followerCount, followingCount] = await Promise.all([
    getFollowerCount(db, userId),
    getFollowingCount(db, userId),
  ]);

  const postCountConditions = [
    eq(schema.posts.userId, userId),
    sql`${schema.posts.deletedAt} IS NULL`,
  ];
  if (!canViewPosts) {
    postCountConditions.push(eq(schema.posts.visibility, 'public'));
  }
  const postCountRes = await db.select({ value: count() })
    .from(schema.posts)
    .where(and(...postCountConditions))
    .get();

  return toPublicUser(user, {
    postCount: postCountRes?.value || 0,
    followerCount,
    followingCount,
    canViewPosts,
  });
}

// Ensure Admin user is seeded in DB
export async function seedAdminUser(db: any) {
  const username = 'admin';
  const existing = await db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  if (!existing) {
    const passwordHash = await bcrypt.hash('087425', 10);
    await db.insert(schema.users).values({
      username,
      passwordHash,
      role: 'admin',
    }).run();
  }
}
