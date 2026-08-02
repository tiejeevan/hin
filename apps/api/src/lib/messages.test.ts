import { describe, it, expect } from 'vitest';
import { deriveDeliveryStatus, toMessageDto } from './messages';

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
  });
});
