import { drizzle } from 'drizzle-orm/d1';
import { eq, and, count, sql, inArray, notInArray } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { ChatThread, DeliveryStatus, LinkPreview, Message, MessageReplyTo } from '@hin/types';
import { getBlockedUserIds, getBlockerUserIds } from './blocks';
import { isGamificationEnabled } from './gamification/settings';
import { loadEquippedBadgesForUsers } from './gamification/equipped';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Derive WhatsApp-style delivery status from persisted timestamps + read flag. */
export function deriveDeliveryStatus(row: {
  read: number | boolean;
  deliveredAt?: string | null;
  readAt?: string | null;
}): DeliveryStatus {
  const isRead = row.read === 1 || row.read === true;
  if (isRead) return 'read';
  if (row.deliveredAt) return 'delivered';
  return 'sent';
}

export type MessageRowInput = {
  id: number;
  senderId: number;
  senderUsername: string;
  receiverId: number;
  receiverUsername: string;
  content: string;
  createdAt: string;
  read: number | boolean;
  deliveredAt?: string | null;
  readAt?: string | null;
  deletedAt?: string | null;
  linkPreview?: LinkPreview | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  clientMessageId?: string | null;
  replyToMessageId?: number | null;
  replyTo?: MessageReplyTo | null;
};

export function toMessageDto(row: MessageRowInput): Message {
  const read = row.read === 1 || row.read === true;
  return {
    id: row.id,
    senderId: row.senderId,
    senderUsername: row.senderUsername,
    receiverId: row.receiverId,
    receiverUsername: row.receiverUsername,
    content: row.content,
    createdAt: row.createdAt,
    read,
    status: deriveDeliveryStatus(row),
    deliveredAt: row.deliveredAt ?? null,
    readAt: row.readAt ?? null,
    deletedAt: row.deletedAt ?? null,
    linkPreview: row.linkPreview ?? null,
    mediaUrl: row.mediaUrl ?? null,
    mediaType: row.mediaType ?? null,
    clientMessageId: row.clientMessageId ?? null,
    replyToMessageId: row.replyToMessageId ?? null,
    replyTo: row.replyTo ?? null,
  };
}

/** Batch-load reply quotes for message history / WS payloads (includes soft-deleted parents). */
export async function loadReplyToMap(
  db: Db,
  ids: number[],
): Promise<Map<number, MessageReplyTo>> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return new Map();

  const rows = await db
    .select({
      id: schema.messages.id,
      senderId: schema.messages.senderId,
      content: schema.messages.content,
      mediaUrl: schema.messages.mediaUrl,
      deletedAt: schema.messages.deletedAt,
      senderUsername: schema.users.username,
    })
    .from(schema.messages)
    .innerJoin(schema.users, eq(schema.messages.senderId, schema.users.id))
    .where(inArray(schema.messages.id, unique))
    .all();

  const map = new Map<number, MessageReplyTo>();
  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      senderId: row.senderId,
      senderUsername: row.senderUsername,
      content: row.content,
      mediaUrl: row.mediaUrl ?? null,
      deleted: !!row.deletedAt,
    });
  }
  return map;
}

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
  id: number;
  content: string;
  mediaUrl: string | null;
  senderId: number;
  createdAt: string;
  read: number;
  deliveredAt: string | null;
  readAt: string | null;
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
        m.media_url AS media_url,
        m.read,
        m.delivered_at AS delivered_at,
        m.read_at AS read_at,
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
        id,
        content,
        media_url AS mediaUrl,
        sender_id AS senderId,
        created_at AS createdAt,
        read,
        delivered_at AS deliveredAt,
        read_at AS readAt,
        ROW_NUMBER() OVER (PARTITION BY partner_id ORDER BY created_at DESC) AS rn
      FROM partner_messages
    )
    SELECT partnerId, id, content, mediaUrl, senderId, createdAt, read, deliveredAt, readAt
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
        moderatorStatus: schema.users.moderatorStatus,
        avatarUrl: schema.users.avatarUrl,
        lastSeenAt: schema.users.lastSeenAt,
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
      moderatorStatus:
        u.role === 'moderator' ? ((u.moderatorStatus as ChatThread['moderatorStatus']) ?? 'active') : undefined,
      avatarUrl: u.avatarUrl,
      equippedBadges: equippedBadgesByUser.get(u.id) ?? [],
      lastSeenAt: u.lastSeenAt ?? null,
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            content: lastMsg.content.trim()
              ? lastMsg.content
              : lastMsg.mediaUrl
                ? 'Photo'
                : '',
            senderId: lastMsg.senderId,
            createdAt: lastMsg.createdAt,
            read: lastMsg.read === 1,
            status: deriveDeliveryStatus({
              read: lastMsg.read,
              deliveredAt: lastMsg.deliveredAt,
              readAt: lastMsg.readAt,
            }),
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

/** Shared UPDATE values when marking messages read (also backfills deliveredAt). */
export function markMessagesReadSet(nowIso: string) {
  return {
    read: 1 as const,
    readAt: nowIso,
    deliveredAt: sql`COALESCE(${schema.messages.deliveredAt}, ${nowIso})`,
  };
}
