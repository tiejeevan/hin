import { eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import { FollowStatus, User } from '@hin/types';
import bcrypt from 'bcryptjs';

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
  },
  extras?: {
    postCount?: number | null;
    followerCount?: number;
    followingCount?: number;
    followStatus?: FollowStatus;
    canViewPosts?: boolean;
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
    ...(extras?.postCount !== undefined ? { postCount: extras.postCount } : {}),
    ...(extras?.followerCount !== undefined ? { followerCount: extras.followerCount } : {}),
    ...(extras?.followingCount !== undefined ? { followingCount: extras.followingCount } : {}),
    ...(extras?.followStatus !== undefined ? { followStatus: extras.followStatus } : {}),
    ...(extras?.canViewPosts !== undefined ? { canViewPosts: extras.canViewPosts } : {}),
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
};

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
