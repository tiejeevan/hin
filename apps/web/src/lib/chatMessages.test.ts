import { describe, it, expect } from 'vitest';
import type { Message } from '@hin/types';
import {
  applyDelivered,
  capMessageWindow,
  deriveLocalStatus,
  excludeDeletedIds,
  mergeAndSortMessages,
  mergeAndSortMessagesExcludingDeleted,
} from './chatMessages';
import { addTombstone, removeTombstone } from './chatDeleteTombstones';

function msg(partial: Partial<Message> & Pick<Message, 'id' | 'content'>): Message {
  return {
    senderId: 1,
    senderUsername: 'a',
    receiverId: 2,
    receiverUsername: 'b',
    createdAt: '2026-01-01T00:00:00.000Z',
    read: false,
    status: 'sent',
    ...partial,
  };
}

describe('mergeAndSortMessages', () => {
  it('dedupes by positive id and sorts by createdAt then id', () => {
    const existing = [
      msg({ id: 2, content: 'b', createdAt: '2026-01-01T00:00:02.000Z' }),
      msg({ id: 1, content: 'a', createdAt: '2026-01-01T00:00:01.000Z' }),
    ];
    const incoming = [
      msg({ id: 3, content: 'c', createdAt: '2026-01-01T00:00:00.500Z' }),
      msg({ id: 2, content: 'b2', createdAt: '2026-01-01T00:00:02.000Z', status: 'delivered' }),
    ];
    const merged = mergeAndSortMessages(existing, incoming);
    expect(merged.map(m => m.id)).toEqual([3, 1, 2]);
    expect(merged.find(m => m.id === 2)?.content).toBe('b2');
    expect(merged.find(m => m.id === 2)?.status).toBe('delivered');
  });

  it('replaces optimistic rows by clientMessageId', () => {
    const existing = [
      msg({
        id: -100,
        content: 'hi',
        status: 'sending',
        clientMessageId: 'cid-1',
      }),
    ];
    const incoming = [
      msg({
        id: 50,
        content: 'hi',
        status: 'delivered',
        clientMessageId: 'cid-1',
      }),
    ];
    const merged = mergeAndSortMessages(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 50, status: 'delivered', clientMessageId: 'cid-1' });
  });

  it('handles out-of-order packets', () => {
    const merged = mergeAndSortMessages(
      [msg({ id: 10, content: 'later', createdAt: '2026-01-01T00:00:10.000Z' })],
      [msg({ id: 5, content: 'earlier', createdAt: '2026-01-01T00:00:05.000Z' })],
    );
    expect(merged.map(m => m.id)).toEqual([5, 10]);
  });

  it('never downgrades delivered/read to sent from stale REST', () => {
    const existing = [
      msg({
        id: 1,
        content: 'hi',
        status: 'read',
        read: true,
        deliveredAt: '2026-01-01T00:00:01.000Z',
        readAt: '2026-01-01T00:00:02.000Z',
      }),
    ];
    const incoming = [
      msg({
        id: 1,
        content: 'hi',
        status: 'sent',
        read: false,
        deliveredAt: null,
        readAt: null,
      }),
    ];
    const merged = mergeAndSortMessages(existing, incoming);
    expect(merged[0].status).toBe('read');
    expect(merged[0].read).toBe(true);
    expect(merged[0].deliveredAt).toBe('2026-01-01T00:00:01.000Z');
  });
});

describe('deriveLocalStatus', () => {
  it('respects explicit sending/failed', () => {
    expect(deriveLocalStatus(msg({ id: -1, content: 'x', status: 'sending' }))).toBe('sending');
    expect(deriveLocalStatus(msg({ id: -1, content: 'x', status: 'failed' }))).toBe('failed');
  });
});

describe('applyDelivered', () => {
  it('upgrades sent to delivered without downgrading read', () => {
    const messages = [
      msg({ id: 1, content: 'a', status: 'sent' }),
      msg({ id: 2, content: 'b', status: 'read', read: true }),
    ];
    const next = applyDelivered(messages, [1, 2], '2026-01-01T00:00:01.000Z');
    expect(next[0].status).toBe('delivered');
    expect(next[1].status).toBe('read');
  });
});

describe('excludeDeletedIds', () => {
  it('filters suppressed pending/confirmed deleted ids', () => {
    const messages = [
      msg({ id: 1, content: 'a' }),
      msg({ id: 2, content: 'b' }),
      msg({ id: 3, content: 'c' }),
    ];
    expect(excludeDeletedIds(messages, [2]).map(m => m.id)).toEqual([1, 3]);
    expect(excludeDeletedIds(messages, new Set([1, 3])).map(m => m.id)).toEqual([2]);
  });

  it('returns same array reference when deleted set is empty', () => {
    const messages = [msg({ id: 1, content: 'a' })];
    expect(excludeDeletedIds(messages, [])).toBe(messages);
    expect(excludeDeletedIds(messages, new Set())).toBe(messages);
  });
});

describe('mergeAndSortMessagesExcludingDeleted', () => {
  it('merges then drops tombstoned ids without changing mergeAndSortMessages', () => {
    const existing = [
      msg({ id: 2, content: 'b', createdAt: '2026-01-01T00:00:02.000Z' }),
      msg({ id: 1, content: 'a', createdAt: '2026-01-01T00:00:01.000Z' }),
    ];
    const incoming = [
      msg({ id: 3, content: 'c', createdAt: '2026-01-01T00:00:00.500Z' }),
      msg({ id: 2, content: 'b2', createdAt: '2026-01-01T00:00:02.000Z', status: 'delivered' }),
    ];
    const plain = mergeAndSortMessages(existing, incoming);
    expect(plain.map(m => m.id)).toEqual([3, 1, 2]);

    const filtered = mergeAndSortMessagesExcludingDeleted(existing, incoming, [2, 99]);
    expect(filtered.map(m => m.id)).toEqual([3, 1]);
    expect(filtered.find(m => m.id === 3)?.content).toBe('c');
  });
});

describe('capMessageWindow', () => {
  it('keeps the last maxCount messages in sorted order', () => {
    const messages = [
      msg({ id: 1, content: 'a', createdAt: '2026-01-01T00:00:01.000Z' }),
      msg({ id: 2, content: 'b', createdAt: '2026-01-01T00:00:02.000Z' }),
      msg({ id: 3, content: 'c', createdAt: '2026-01-01T00:00:03.000Z' }),
      msg({ id: 4, content: 'd', createdAt: '2026-01-01T00:00:04.000Z' }),
    ];
    expect(capMessageWindow(messages, 2).map(m => m.id)).toEqual([3, 4]);
    expect(capMessageWindow(messages, 2000)).toBe(messages);
    expect(capMessageWindow(messages).map(m => m.id)).toEqual([1, 2, 3, 4]);
  });

  it('returns empty for non-positive maxCount', () => {
    expect(capMessageWindow([msg({ id: 1, content: 'a' })], 0)).toEqual([]);
  });
});

describe('tombstone helpers', () => {
  it('addTombstone / removeTombstone are immutable', () => {
    const empty = new Set<number>();
    const withOne = addTombstone(empty, 10);
    expect(empty.has(10)).toBe(false);
    expect(withOne.has(10)).toBe(true);
    expect(addTombstone(withOne, 10)).toBe(withOne);

    const cleared = removeTombstone(withOne, 10);
    expect(withOne.has(10)).toBe(true);
    expect(cleared.has(10)).toBe(false);
    expect(removeTombstone(cleared, 10)).toBe(cleared);
  });
});
