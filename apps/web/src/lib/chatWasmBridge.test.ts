import { describe, it, expect } from 'vitest';
import type { Message } from '@hin/types';
import {
  applyDelivered,
  assertChatWasmVersionCompatible,
  CHAT_WASM_BRIDGE_VERSION,
  extractFirstUrl,
  getChatWasmCoreVersion,
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

/** Documented expectations shared with `crates/hin-chat-core/src/url.rs` tests. */
const URL_CASES: Array<{ input: string; expected: string | null }> = [
  { input: 'see https://example.com/item now', expected: 'https://example.com/item' },
  { input: 'go https://example.com.', expected: 'https://example.com' },
  { input: 'check example.com please', expected: 'https://example.com' },
  { input: 'see www.example.com/path now', expected: 'https://www.example.com/path' },
  { input: 'foo.co.uk/x', expected: 'https://foo.co.uk/x' },
  { input: 'email me at user@example.com thanks', expected: null },
  { input: 'shipped 1.2.3 today', expected: null },
  { input: 'http://a.co/x', expected: 'http://a.co/x' },
  { input: 'no links here', expected: null },
];

describe('extractFirstUrl parity (WA-009 / CM-016)', () => {
  it.each(URL_CASES)('extracts $input', ({ input, expected }) => {
    expect(extractFirstUrl(input)).toBe(expected);
  });
});

describe('WASM version handshake (WA-008)', () => {
  it('exports bridge version constant', () => {
    expect(CHAT_WASM_BRIDGE_VERSION).toBe('1');
  });

  it('treats missing WASM as compatible', () => {
    expect(getChatWasmCoreVersion()).toBeNull();
    expect(assertChatWasmVersionCompatible()).toBe(true);
  });
});
