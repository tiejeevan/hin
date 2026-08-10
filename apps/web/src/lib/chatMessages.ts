import type { DeliveryStatus, Message } from '@hin/types';

export const STATUS_RANK: Record<DeliveryStatus, number> = {
  sending: 0,
  failed: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/** Prefer server status; fall back to deriving from timestamps for older payloads. */
export function deriveLocalStatus(msg: Message): DeliveryStatus {
  if (msg.status === 'sending' || msg.status === 'failed') return msg.status;
  if (msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read') {
    return msg.status;
  }
  if (msg.read) return 'read';
  if (msg.deliveredAt) return 'delivered';
  return 'sent';
}

function sortKey(msg: Message): [number, number] {
  const t = Date.parse(msg.createdAt);
  const time = Number.isFinite(t) ? t : 0;
  return [time, msg.id];
}

/** Merge two versions of the same message without lowering delivery rank. */
export function mergeMessagePreferHigherStatus(existing: Message | undefined, incoming: Message): Message {
  if (!existing) return incoming;
  const existingRank = STATUS_RANK[deriveLocalStatus(existing)];
  const incomingRank = STATUS_RANK[deriveLocalStatus(incoming)];
  const preferIncomingStatus = incomingRank >= existingRank;
  const status = preferIncomingStatus ? deriveLocalStatus(incoming) : deriveLocalStatus(existing);
  return {
    ...existing,
    ...incoming,
    read: existing.read || incoming.read,
    status,
    deliveredAt: incoming.deliveredAt ?? existing.deliveredAt ?? null,
    readAt: incoming.readAt ?? existing.readAt ?? null,
    clientMessageId: incoming.clientMessageId ?? existing.clientMessageId ?? null,
    linkPreview: incoming.linkPreview !== undefined ? incoming.linkPreview : existing.linkPreview,
    mediaUrl: incoming.mediaUrl !== undefined ? incoming.mediaUrl : existing.mediaUrl,
    mediaType: incoming.mediaType !== undefined ? incoming.mediaType : existing.mediaType,
    replyToMessageId:
      incoming.replyToMessageId !== undefined ? incoming.replyToMessageId : existing.replyToMessageId,
    replyTo: incoming.replyTo !== undefined ? incoming.replyTo : existing.replyTo,
  };
}

/**
 * Merge incoming messages into an existing list:
 * - Dedupes by positive server id
 * - Replaces optimistic rows (id < 0) by clientMessageId, else sender+content
 * - Never downgrades delivery status
 * - Sorts by createdAt then id
 */
export function mergeAndSortMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<number, Message>();
  const optimistic: Message[] = [];

  for (const msg of existing) {
    if (msg.id > 0) byId.set(msg.id, msg);
    else optimistic.push(msg);
  }

  let remainingOptimistic = [...optimistic];

  for (const msg of incoming) {
    if (msg.id > 0) {
      remainingOptimistic = remainingOptimistic.filter(opt => {
        if (msg.clientMessageId && opt.clientMessageId && msg.clientMessageId === opt.clientMessageId) {
          return false;
        }
        if (
          !msg.clientMessageId &&
          opt.id < 0 &&
          opt.senderId === msg.senderId &&
          opt.content === msg.content
        ) {
          return false;
        }
        return true;
      });
      byId.set(msg.id, mergeMessagePreferHigherStatus(byId.get(msg.id), msg));
    } else {
      const idx = remainingOptimistic.findIndex(
        o => o.clientMessageId && msg.clientMessageId && o.clientMessageId === msg.clientMessageId,
      );
      if (idx >= 0) remainingOptimistic[idx] = msg;
      else remainingOptimistic.push(msg);
    }
  }

  return [...byId.values(), ...remainingOptimistic].sort((a, b) => {
    const [ta, ia] = sortKey(a);
    const [tb, ib] = sortKey(b);
    if (ta !== tb) return ta - tb;
    return ia - ib;
  });
}

/** Filter messages excluding suppressed (pending/confirmed deleted) ids. */
export function excludeDeletedIds(messages: Message[], deletedIds: Iterable<number>): Message[] {
  const deleted = deletedIds instanceof Set ? deletedIds : new Set(deletedIds);
  if (deleted.size === 0) return messages;
  return messages.filter(m => !deleted.has(m.id));
}

/** Merge then exclude — convenience for history/WS merges (does not alter mergeAndSortMessages). */
export function mergeAndSortMessagesExcludingDeleted(
  existing: Message[],
  incoming: Message[],
  deletedIds: Iterable<number>,
): Message[] {
  return excludeDeletedIds(mergeAndSortMessages(existing, incoming), deletedIds);
}

/** Cap list to last maxCount messages (by sort order already applied) — PF memory cap. */
export function capMessageWindow(messages: Message[], maxCount = 2000): Message[] {
  if (maxCount <= 0) return [];
  if (messages.length <= maxCount) return messages;
  return messages.slice(messages.length - maxCount);
}

/** Upgrade delivery status for matching positive ids (never downgrade). */
export function applyDelivered(
  messages: Message[],
  messageIds: number[],
  deliveredAt: string,
): Message[] {
  const idSet = new Set(messageIds);
  return messages.map(msg => {
    if (!idSet.has(msg.id)) return msg;
    const current = deriveLocalStatus(msg);
    if (STATUS_RANK[current] >= STATUS_RANK.delivered) return msg;
    return {
      ...msg,
      deliveredAt,
      status: 'delivered',
    };
  });
}

export function applyMessagesRead(
  messages: Message[],
  opts: { senderId: number; receiverId: number; readAt: string },
): Message[] {
  return messages.map(msg => {
    if (msg.senderId !== opts.senderId || msg.receiverId !== opts.receiverId) return msg;
    return {
      ...msg,
      read: true,
      readAt: opts.readAt,
      deliveredAt: msg.deliveredAt ?? opts.readAt,
      status: 'read' as const,
    };
  });
}
