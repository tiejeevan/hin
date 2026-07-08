import { drizzle } from 'drizzle-orm/d1';
import { eq, and, count, sql, inArray, notInArray } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { ChatThread } from '@hin/types';
import { getBlockedUserIds, getBlockerUserIds } from './blocks';
import { isGamificationEnabled } from './gamification/settings';
import { loadEquippedBadgesForUsers } from './gamification/equipped';

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function getHiddenMessagePartnerIds(db: Db, userId: number): Promise<Set<number>> {
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(db, userId),
    getBlockerUserIds(db, userId),
  ]);
  return new Set([...blockedByMe, ...blockedMe]);
}

export async function countUnreadMessages(db: Db, userId: number): Promise<number> {
  const hidden = await getHiddenMessagePartnerIds(db, userId);
  const conditions = [
    eq(schema.messages.receiverId, userId),
    eq(schema.messages.read, 0),
    sql`${schema.messages.deletedAt} IS NULL`,
  ];
  if (hidden.size > 0) {
    conditions.push(notInArray(schema.messages.senderId, [...hidden]));
  }

  const res = await db
    .select({ value: count() })
    .from(schema.messages)
    .where(and(...conditions))
    .get();
  return res?.value || 0;
}

type LastMessageRow = {
  partnerId: number;
  content: string;
  senderId: number;
  createdAt: string;
  read: number;
};

export async function listMessageThreads(db: Db, userId: number): Promise<ChatThread[]> {
  const hidden = await getHiddenMessagePartnerIds(db, userId);

  const lastMessageRows = await db.all<LastMessageRow>(sql`
    WITH partner_messages AS (
      SELECT
        m.id,
        m.sender_id AS sender_id,
        m.receiver_id AS receiver_id,
        m.content,
        m.read,
        m.created_at AS created_at,
        CASE
          WHEN m.sender_id = ${userId} THEN m.receiver_id
          ELSE m.sender_id
        END AS partner_id
      FROM messages m
      WHERE (m.sender_id = ${userId} OR m.receiver_id = ${userId})
        AND m.deleted_at IS NULL
    ),
    ranked AS (
      SELECT
        partner_id AS partnerId,
        content,
        sender_id AS senderId,
        created_at AS createdAt,
        read,
        ROW_NUMBER() OVER (PARTITION BY partner_id ORDER BY created_at DESC) AS rn
      FROM partner_messages
    )
    SELECT partnerId, content, senderId, createdAt, read
    FROM ranked
    WHERE rn = 1
  `);

  const visibleLastMessages = lastMessageRows.filter(row => !hidden.has(row.partnerId));
  if (visibleLastMessages.length === 0) {
    return [];
  }

  const partnerIds = visibleLastMessages.map(row => row.partnerId);

  const [otherUsers, unreadRows] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(
        and(
          inArray(schema.users.id, partnerIds),
          sql`${schema.users.deletedAt} IS NULL`,
        ),
      )
      .all(),
    db
      .select({
        senderId: schema.messages.senderId,
        value: count(),
      })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.receiverId, userId),
          eq(schema.messages.read, 0),
          sql`${schema.messages.deletedAt} IS NULL`,
          inArray(schema.messages.senderId, partnerIds),
        ),
      )
      .groupBy(schema.messages.senderId)
      .all(),
  ]);

  const unreadBySender = new Map(unreadRows.map(row => [row.senderId, row.value]));
  const lastByPartner = new Map(visibleLastMessages.map(row => [row.partnerId, row]));
  const userById = new Map(otherUsers.map(u => [u.id, u]));

  const equippedBadgesByUser = (await isGamificationEnabled(db))
    ? await loadEquippedBadgesForUsers(db, partnerIds)
    : new Map();

  const threads: ChatThread[] = [];
  for (const partnerId of partnerIds) {
    const u = userById.get(partnerId);
    if (!u) continue;
    const lastMsg = lastByPartner.get(partnerId);
    threads.push({
      id: u.id,
      username: u.username,
      role: u.role,
      equippedBadges: equippedBadgesByUser.get(u.id) ?? [],
      lastMessage: lastMsg
        ? {
            content: lastMsg.content,
            senderId: lastMsg.senderId,
            createdAt: lastMsg.createdAt,
            read: lastMsg.read === 1,
          }
        : null,
      unreadCount: unreadBySender.get(partnerId) || 0,
    });
  }

  threads.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ?? '';
    const bTime = b.lastMessage?.createdAt ?? '';
    return bTime.localeCompare(aTime);
  });

  return threads;
}
