import { eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import { User } from '@hin/types';
import bcrypt from 'bcryptjs';

export function toPublicUser(
  user: {
    id: number;
    username: string;
    role: string;
    bio?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    createdAt: string;
    deletedAt?: string | null;
  },
  postCount?: number
): User {
  return {
    id: user.id,
    username: user.username,
    role: user.role as User['role'],
    bio: user.bio ?? null,
    avatarUrl: user.avatarUrl ?? null,
    coverUrl: user.coverUrl ?? null,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt ?? null,
    ...(postCount !== undefined ? { postCount } : {}),
  };
}

export const USER_PUBLIC_FIELDS = {
  id: schema.users.id,
  username: schema.users.username,
  role: schema.users.role,
  bio: schema.users.bio,
  avatarUrl: schema.users.avatarUrl,
  coverUrl: schema.users.coverUrl,
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
