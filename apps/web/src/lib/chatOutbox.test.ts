import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadOutbox,
  saveOutbox,
  enqueueOutbox,
  dequeueOutbox,
  type OutboxItem,
} from './chatOutbox';

type MemoryStorage = {
  data: Record<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  length: number;
};

function createMemoryStorage(): MemoryStorage {
  const data: Record<string, string> = {};
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key]! : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    clear() {
      for (const k of Object.keys(data)) delete data[k];
    },
    key(index) {
      return Object.keys(data)[index] ?? null;
    },
    get length() {
      return Object.keys(data).length;
    },
  };
}

const itemA: OutboxItem = {
  clientMessageId: 'c-1',
  recipientId: 7,
  content: 'hello',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const itemB: OutboxItem = {
  clientMessageId: 'c-2',
  recipientId: 8,
  content: 'with media',
  mediaUrl: 'https://cdn.example/x.png',
  mediaType: 'image/png',
  replyToMessageId: 99,
  createdAt: '2024-01-01T00:01:00.000Z',
};

describe('chatOutbox', () => {
  let memory: MemoryStorage;

  beforeEach(() => {
    memory = createMemoryStorage();
    vi.stubGlobal('localStorage', memory);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty array when nothing is stored', () => {
    expect(loadOutbox(1)).toEqual([]);
  });

  it('round-trips via saveOutbox / loadOutbox under user-scoped key', () => {
    saveOutbox(42, [itemA, itemB]);
    expect(memory.getItem('hin_chat_outbox_v1_42')).toBeTruthy();
    expect(loadOutbox(42)).toEqual([itemA, itemB]);
    expect(loadOutbox(99)).toEqual([]);
  });

  it('enqueues items and replaces same clientMessageId', () => {
    enqueueOutbox(1, itemA);
    enqueueOutbox(1, itemB);
    expect(loadOutbox(1)).toEqual([itemA, itemB]);

    const updated: OutboxItem = { ...itemA, content: 'edited' };
    enqueueOutbox(1, updated);
    expect(loadOutbox(1)).toEqual([itemB, updated]);
  });

  it('dequeues by clientMessageId', () => {
    enqueueOutbox(1, itemA);
    enqueueOutbox(1, itemB);
    dequeueOutbox(1, 'c-1');
    expect(loadOutbox(1)).toEqual([itemB]);
    dequeueOutbox(1, 'missing');
    expect(loadOutbox(1)).toEqual([itemB]);
  });

  it('ignores corrupt or invalid stored payloads', () => {
    memory.setItem('hin_chat_outbox_v1_1', '{broken');
    expect(loadOutbox(1)).toEqual([]);

    memory.setItem('hin_chat_outbox_v1_1', JSON.stringify({ not: 'array' }));
    expect(loadOutbox(1)).toEqual([]);

    memory.setItem(
      'hin_chat_outbox_v1_1',
      JSON.stringify([itemA, { clientMessageId: 1, content: 'bad' }, itemB]),
    );
    expect(loadOutbox(1)).toEqual([itemA, itemB]);
  });

  it('does not throw when setItem fails', () => {
    memory.setItem = () => {
      throw new Error('quota');
    };
    expect(() => enqueueOutbox(1, itemA)).not.toThrow();
  });
});
