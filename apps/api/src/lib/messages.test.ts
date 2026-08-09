import { describe, it, expect, vi } from 'vitest';
import { deriveDeliveryStatus, toMessageDto, loadReplyToMap } from './messages';

describe('deriveDeliveryStatus', () => {
  it('returns sent when unread and not delivered', () => {
    expect(deriveDeliveryStatus({ read: 0, deliveredAt: null })).toBe('sent');
  });

  it('returns delivered when deliveredAt is set and unread', () => {
    expect(deriveDeliveryStatus({ read: 0, deliveredAt: '2026-01-01T00:00:00.000Z' })).toBe('delivered');
  });

  it('returns read when read flag is set', () => {
    expect(deriveDeliveryStatus({
      read: 1,
      deliveredAt: '2026-01-01T00:00:00.000Z',
      readAt: '2026-01-01T00:01:00.000Z',
    })).toBe('read');
  });
});

describe('toMessageDto', () => {
  it('maps row fields and derives status', () => {
    const dto = toMessageDto({
      id: 1,
      senderId: 1,
      senderUsername: 'a',
      receiverId: 2,
      receiverUsername: 'b',
      content: 'hi',
      createdAt: '2026-01-01T00:00:00.000Z',
      read: 0,
      deliveredAt: '2026-01-01T00:00:01.000Z',
      clientMessageId: 'cid-1',
    });
    expect(dto.status).toBe('delivered');
    expect(dto.read).toBe(false);
    expect(dto.clientMessageId).toBe('cid-1');
    expect(dto.replyToMessageId).toBeNull();
    expect(dto.replyTo).toBeNull();
  });

  it('includes replyTo quote when provided', () => {
    const replyTo = {
      id: 9,
      senderId: 2,
      senderUsername: 'b',
      content: 'original',
      mediaUrl: null,
      deleted: false,
    };
    const dto = toMessageDto({
      id: 10,
      senderId: 1,
      senderUsername: 'a',
      receiverId: 2,
      receiverUsername: 'b',
      content: 'reply',
      createdAt: '2026-01-01T00:00:00.000Z',
      read: 0,
      replyToMessageId: 9,
      replyTo,
    });
    expect(dto.replyToMessageId).toBe(9);
    expect(dto.replyTo).toEqual(replyTo);
  });
});

describe('loadReplyToMap', () => {
  it('returns empty map for empty / invalid ids without querying', async () => {
    const db = {
      select: vi.fn(),
    } as any;
    const map = await loadReplyToMap(db, []);
    expect(map.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();

    const map2 = await loadReplyToMap(db, [0, -1]);
    expect(map2.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('maps rows including soft-deleted parents', async () => {
    const rows = [
      {
        id: 1,
        senderId: 2,
        content: 'alive',
        mediaUrl: null,
        deletedAt: null,
        senderUsername: 'bob',
      },
      {
        id: 2,
        senderId: 1,
        content: 'gone',
        mediaUrl: 'https://example.com/x.jpg',
        deletedAt: '2026-01-02T00:00:00.000Z',
        senderUsername: 'alice',
      },
    ];
    const chain: Record<string, any> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.from = vi.fn(self);
    chain.innerJoin = vi.fn(self);
    chain.where = vi.fn(self);
    chain.all = vi.fn().mockResolvedValue(rows);

    const map = await loadReplyToMap(chain as any, [1, 2, 2, 1]);
    expect(map.size).toBe(2);
    expect(map.get(1)).toEqual({
      id: 1,
      senderId: 2,
      senderUsername: 'bob',
      content: 'alive',
      mediaUrl: null,
      deleted: false,
    });
    expect(map.get(2)).toEqual({
      id: 2,
      senderId: 1,
      senderUsername: 'alice',
      content: 'gone',
      mediaUrl: 'https://example.com/x.jpg',
      deleted: true,
    });
  });
});
