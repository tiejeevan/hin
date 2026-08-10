export type OutboxItem = {
  clientMessageId: string;
  recipientId: number;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  replyToMessageId?: number;
  createdAt: string;
};

function outboxKey(userId: number): string {
  return `hin_chat_outbox_v1_${userId}`;
}

function isOutboxItem(value: unknown): value is OutboxItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (typeof item.clientMessageId !== 'string') return false;
  if (typeof item.recipientId !== 'number' || !Number.isFinite(item.recipientId)) {
    return false;
  }
  if (typeof item.content !== 'string') return false;
  if (typeof item.createdAt !== 'string') return false;
  if (item.mediaUrl != null && typeof item.mediaUrl !== 'string') return false;
  if (item.mediaType != null && typeof item.mediaType !== 'string') return false;
  if (
    item.replyToMessageId != null &&
    (typeof item.replyToMessageId !== 'number' || !Number.isFinite(item.replyToMessageId))
  ) {
    return false;
  }
  return true;
}

export function loadOutbox(userId: number): OutboxItem[] {
  try {
    const raw = localStorage.getItem(outboxKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOutboxItem);
  } catch {
    return [];
  }
}

export function saveOutbox(userId: number, items: OutboxItem[]): void {
  try {
    localStorage.setItem(outboxKey(userId), JSON.stringify(items));
  } catch {
    // ignore quota / private mode
  }
}

export function enqueueOutbox(userId: number, item: OutboxItem): void {
  const existing = loadOutbox(userId).filter(
    (entry) => entry.clientMessageId !== item.clientMessageId,
  );
  existing.push(item);
  saveOutbox(userId, existing);
}

export function dequeueOutbox(userId: number, clientMessageId: string): void {
  saveOutbox(
    userId,
    loadOutbox(userId).filter((entry) => entry.clientMessageId !== clientMessageId),
  );
}
