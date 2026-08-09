import { describe, it, expect } from 'vitest';
import type { Message } from '@hin/types';
import {
  applyDelivered,
  mergeAndSortMessages,
  rubberBand,
  releaseSnap,
} from './chatWasmBridge';

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

describe('chatWasmBridge TS fallback', () => {
  it('merges via TS when WASM unavailable', () => {
    const merged = mergeAndSortMessages(
      [msg({ id: 1, content: 'a' })],
      [msg({ id: 2, content: 'b' })],
    );
    expect(merged.map(m => m.id)).toEqual([1, 2]);
  });

  it('preserves replyTo on merge', () => {
    const replyTo = {
      id: 9,
      senderId: 2,
      senderUsername: 'b',
      content: 'prev',
      mediaUrl: null,
      deleted: false,
    };
    const existing = [msg({ id: 1, content: 'hi', replyTo, replyToMessageId: 9, status: 'read', read: true })];
    const incoming = [msg({ id: 1, content: 'hi', status: 'sent' })];
    const merged = mergeAndSortMessages(existing, incoming);
    expect(merged[0].status).toBe('read');
    expect(merged[0].replyTo?.id).toBe(9);
  });

  it('applyDelivered upgrades', () => {
    const next = applyDelivered([msg({ id: 1, content: 'a', status: 'sent' })], [1], 't');
    expect(next[0].status).toBe('delivered');
  });

  it('rubberBand + releaseSnap work', () => {
    expect(rubberBand(10, 100)).toBe(10);
    expect(releaseSnap(400, 0.2, true)).toBe('compact');
  });
});
