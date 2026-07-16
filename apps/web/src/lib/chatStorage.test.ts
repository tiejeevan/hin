import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadChatState,
  saveChatState,
  clearChatState,
  pruneDraftEntry,
  pruneDrafts,
  getDraftForRecipient,
  type DraftEntry,
  type PersistedChatState,
} from './chatStorage';
import type { LinkPreview } from '@hin/types';
import type { ChatRecipient } from '../types/ui';

const V1_KEY = 'hin_chat_ui_v1';
const V2_KEY = 'hin_chat_ui_v2';

const recipient: ChatRecipient = {
  id: 7,
  username: 'alice',
  role: 'user',
  avatarUrl: null,
};

const preview: LinkPreview = {
  url: 'https://example.com/item',
  title: 'Example',
  description: 'Desc',
  imageUrl: null,
  siteName: 'example.com',
};

function draft(partial: Partial<DraftEntry> & { text: string }): DraftEntry {
  return { preview: null, ...partial };
}

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
      for (const key of Object.keys(data)) delete data[key];
    },
    key(index) {
      return Object.keys(data)[index] ?? null;
    },
    get length() {
      return Object.keys(data).length;
    },
  };
}

describe('pruneDraftEntry', () => {
  it('returns null when text is empty and there is no preview', () => {
    expect(pruneDraftEntry(draft({ text: '' }))).toBeNull();
  });

  it('returns null when text is whitespace-only and there is no preview', () => {
    expect(pruneDraftEntry(draft({ text: '   ' }))).toBeNull();
    expect(pruneDraftEntry(draft({ text: '\n\t' }))).toBeNull();
  });

  it('keeps non-empty text and leaves intentional leading/trailing spaces', () => {
    expect(pruneDraftEntry(draft({ text: 'hello' }))).toEqual({
      text: 'hello',
      preview: null,
    });
    expect(pruneDraftEntry(draft({ text: '  hello  ' }))).toEqual({
      text: '  hello  ',
      preview: null,
    });
  });

  it('keeps preview-only drafts with empty text', () => {
    expect(pruneDraftEntry(draft({ text: '', preview }))).toEqual({
      text: '',
      preview,
    });
  });

  it('keeps preview-only drafts with whitespace text (normalized to empty string)', () => {
    expect(pruneDraftEntry(draft({ text: '  ', preview }))).toEqual({
      text: '',
      preview,
    });
  });

  it('drops invalid preview objects and returns null when text is also empty', () => {
    expect(
      pruneDraftEntry(draft({ text: '', preview: { title: 'x' } as unknown as LinkPreview })),
    ).toBeNull();
  });

  it('drops invalid preview but keeps valid text', () => {
    expect(
      pruneDraftEntry(draft({ text: 'hi', preview: { title: 'x' } as unknown as LinkPreview })),
    ).toEqual({ text: 'hi', preview: null });
  });

  it('preserves dismissedPreviewUrl when set to a non-empty string', () => {
    expect(
      pruneDraftEntry(
        draft({ text: 'hi', preview, dismissedPreviewUrl: 'https://example.com/item' }),
      ),
    ).toEqual({
      text: 'hi',
      preview,
      dismissedPreviewUrl: 'https://example.com/item',
    });
  });

  it('omits dismissedPreviewUrl when null, undefined, or empty string', () => {
    expect(pruneDraftEntry(draft({ text: 'hi', dismissedPreviewUrl: null }))).toEqual({
      text: 'hi',
      preview: null,
    });
    expect(pruneDraftEntry(draft({ text: 'hi', dismissedPreviewUrl: undefined }))).toEqual({
      text: 'hi',
      preview: null,
    });
    expect(pruneDraftEntry(draft({ text: 'hi', dismissedPreviewUrl: '' }))).toEqual({
      text: 'hi',
      preview: null,
    });
  });

  it('keeps text, preview, and dismissedPreviewUrl together', () => {
    expect(
      pruneDraftEntry(
        draft({
          text: 'share this',
          preview,
          dismissedPreviewUrl: 'https://dismissed.example',
        }),
      ),
    ).toEqual({
      text: 'share this',
      preview,
      dismissedPreviewUrl: 'https://dismissed.example',
    });
  });
});

describe('pruneDrafts', () => {
  it('returns an empty object for empty input', () => {
    expect(pruneDrafts({})).toEqual({});
  });

  it('keeps drafts that prune to a non-null entry', () => {
    expect(
      pruneDrafts({
        1: draft({ text: 'keep' }),
        2: draft({ text: '', preview }),
      }),
    ).toEqual({
      1: { text: 'keep', preview: null },
      2: { text: '', preview },
    });
  });

  it('drops empty draft entries', () => {
    expect(
      pruneDrafts({
        1: draft({ text: 'keep' }),
        2: draft({ text: '  ' }),
        3: draft({ text: '' }),
      }),
    ).toEqual({ 1: { text: 'keep', preview: null } });
  });

  it('skips non-finite keys (NaN, Infinity)', () => {
    const result = pruneDrafts({
      1: draft({ text: 'keep' }),
      NaN: draft({ text: 'nope' }),
      Infinity: draft({ text: 'nope' }),
    } as Record<number, DraftEntry>);
    expect(result).toEqual({ 1: { text: 'keep', preview: null } });
  });

  it('preserves dismissedPreviewUrl on kept entries', () => {
    expect(
      pruneDrafts({
        9: draft({ text: 'x', dismissedPreviewUrl: 'https://d.example' }),
      }),
    ).toEqual({
      9: { text: 'x', preview: null, dismissedPreviewUrl: 'https://d.example' },
    });
  });
});

describe('getDraftForRecipient', () => {
  it('returns the stored draft when present', () => {
    const drafts = { 7: draft({ text: 'yo', preview }) };
    expect(getDraftForRecipient(drafts, 7)).toEqual({ text: 'yo', preview });
  });

  it('returns an empty draft when the recipient id is missing', () => {
    expect(getDraftForRecipient({}, 7)).toEqual({ text: '', preview: null });
  });

  it('returns an empty draft when looking up a different recipient id', () => {
    const drafts = { 7: draft({ text: 'yo' }) };
    expect(getDraftForRecipient(drafts, 99)).toEqual({ text: '', preview: null });
  });

  it('returns the draft including dismissedPreviewUrl when stored', () => {
    const drafts = {
      7: draft({ text: 'hi', dismissedPreviewUrl: 'https://x.com' }),
    };
    expect(getDraftForRecipient(drafts, 7)).toEqual({
      text: 'hi',
      preview: null,
      dismissedPreviewUrl: 'https://x.com',
    });
  });
});

describe('saveChatState', () => {
  let memory: MemoryStorage;

  beforeEach(() => {
    memory = createMemoryStorage();
    vi.stubGlobal('localStorage', memory);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes pruned state to the v2 key', () => {
    saveChatState({
      isOpen: true,
      isExpanded: false,
      recipient,
      drafts: {
        7: draft({ text: 'hello', preview }),
        8: draft({ text: '   ' }),
      },
    });

    const raw = memory.getItem(V2_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({
      isOpen: true,
      isExpanded: false,
      recipient,
      drafts: {
        7: { text: 'hello', preview },
      },
    });
  });

  it('persists null recipient and empty drafts', () => {
    saveChatState({
      isOpen: false,
      isExpanded: true,
      recipient: null,
      drafts: {},
    });

    expect(JSON.parse(memory.getItem(V2_KEY)!)).toEqual({
      isOpen: false,
      isExpanded: true,
      recipient: null,
      drafts: {},
    });
  });

  it('does not throw when setItem fails (quota / private mode)', () => {
    memory.setItem = () => {
      throw new Error('quota');
    };

    expect(() =>
      saveChatState({
        isOpen: true,
        isExpanded: false,
        recipient: null,
        drafts: { 1: draft({ text: 'x' }) },
      }),
    ).not.toThrow();
  });

  it('overwrites any previously saved state', () => {
    saveChatState({
      isOpen: true,
      isExpanded: true,
      recipient,
      drafts: { 7: draft({ text: 'first' }) },
    });
    saveChatState({
      isOpen: false,
      isExpanded: false,
      recipient: null,
      drafts: {},
    });

    expect(JSON.parse(memory.getItem(V2_KEY)!)).toEqual({
      isOpen: false,
      isExpanded: false,
      recipient: null,
      drafts: {},
    });
  });
});

describe('clearChatState', () => {
  let memory: MemoryStorage;

  beforeEach(() => {
    memory = createMemoryStorage();
    vi.stubGlobal('localStorage', memory);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes both v1 and v2 keys', () => {
    memory.setItem(V1_KEY, '{}');
    memory.setItem(V2_KEY, '{}');
    clearChatState();
    expect(memory.getItem(V1_KEY)).toBeNull();
    expect(memory.getItem(V2_KEY)).toBeNull();
  });

  it('is a no-op when nothing is stored', () => {
    expect(() => clearChatState()).not.toThrow();
    expect(memory.getItem(V1_KEY)).toBeNull();
    expect(memory.getItem(V2_KEY)).toBeNull();
  });

  it('does not throw when removeItem fails', () => {
    memory.removeItem = () => {
      throw new Error('blocked');
    };
    expect(() => clearChatState()).not.toThrow();
  });
});

describe('loadChatState', () => {
  let memory: MemoryStorage;

  beforeEach(() => {
    memory = createMemoryStorage();
    vi.stubGlobal('localStorage', memory);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('empty / missing storage', () => {
    it('returns empty state when nothing is stored', () => {
      expect(loadChatState()).toEqual({
        isOpen: false,
        isExpanded: false,
        recipient: null,
        drafts: {},
      });
    });

    it('returns empty state when getItem throws', () => {
      memory.getItem = () => {
        throw new Error('blocked');
      };

      expect(loadChatState()).toEqual({
        isOpen: false,
        isExpanded: false,
        recipient: null,
        drafts: {},
      });
    });

    it('falls through empty-string v2 raw to empty state when no v1 exists', () => {
      // empty string is falsy, so loadChatState treats it as missing
      memory.setItem(V2_KEY, '');
      expect(loadChatState()).toEqual({
        isOpen: false,
        isExpanded: false,
        recipient: null,
        drafts: {},
      });
    });
  });

  describe('v2 load', () => {
    it('round-trips a full v2 state and drops empty drafts', () => {
      const state: PersistedChatState = {
        isOpen: true,
        isExpanded: true,
        recipient,
        drafts: {
          7: draft({ text: 'hello', preview, dismissedPreviewUrl: 'https://example.com/item' }),
          8: draft({ text: '   ' }),
        },
      };
      saveChatState(state);

      const loaded = loadChatState();
      expect(loaded.isOpen).toBe(true);
      expect(loaded.isExpanded).toBe(true);
      expect(loaded.recipient).toEqual(recipient);
      expect(loaded.drafts).toEqual({
        7: {
          text: 'hello',
          preview,
          dismissedPreviewUrl: 'https://example.com/item',
        },
      });
      expect(loaded.drafts[8]).toBeUndefined();
    });

    it('coerces truthy/falsy isOpen and isExpanded flags', () => {
      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: 1,
          isExpanded: 0,
          recipient: null,
          drafts: {},
        }),
      );
      const loaded = loadChatState();
      expect(loaded.isOpen).toBe(true);
      expect(loaded.isExpanded).toBe(false);
    });

    it('rejects invalid recipient shapes (isChatRecipient)', () => {
      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: false,
          recipient: { id: 'nope', username: 'x' },
          drafts: {},
        }),
      );
      expect(loadChatState().recipient).toBeNull();

      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: false,
          recipient: 'alice',
          drafts: {},
        }),
      );
      expect(loadChatState().recipient).toBeNull();

      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: false,
          recipient: { id: 1, username: 'x' }, // missing role
          drafts: {},
        }),
      );
      expect(loadChatState().recipient).toBeNull();

      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: false,
          recipient: null,
          drafts: {},
        }),
      );
      expect(loadChatState().recipient).toBeNull();
    });

    it('accepts a valid recipient', () => {
      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: true,
          isExpanded: false,
          recipient,
          drafts: {},
        }),
      );
      expect(loadChatState().recipient).toEqual(recipient);
    });

    it('parses drafts and skips invalid entries (parseDrafts / isDraftEntry)', () => {
      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: true,
          isExpanded: false,
          recipient: null,
          drafts: {
            1: { text: 'ok', preview: null },
            2: { text: 123, preview: null },
            3: null,
            4: { text: 'bad', preview: { noUrl: true } },
            5: { text: 'bad-dismiss', preview: null, dismissedPreviewUrl: 99 },
            abc: { text: 'skip-key', preview: null },
            6: { text: 'ok-preview', preview },
            7: { text: 'ok-dismiss', preview: null, dismissedPreviewUrl: 'https://d.com' },
          },
        }),
      );

      expect(loadChatState().drafts).toEqual({
        1: { text: 'ok', preview: null },
        6: { text: 'ok-preview', preview },
        7: {
          text: 'ok-dismiss',
          preview: null,
          dismissedPreviewUrl: 'https://d.com',
        },
      });
    });

    it('treats non-object drafts as empty', () => {
      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: false,
          recipient: null,
          drafts: 'nope',
        }),
      );
      expect(loadChatState().drafts).toEqual({});
    });

    it('treats null drafts as empty', () => {
      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: false,
          recipient: null,
          drafts: null,
        }),
      );
      expect(loadChatState().drafts).toEqual({});
    });

    it('skips draft entries that prune to empty and non-object draft values', () => {
      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: false,
          recipient: null,
          drafts: {
            9: { text: '   ', preview: null },
            10: 'not-an-object',
            11: { text: 'ok', preview: 'not-preview' },
          },
        }),
      );
      expect(loadChatState().drafts).toEqual({});
    });

    it('returns empty state when v2 JSON is corrupt', () => {
      memory.setItem(V2_KEY, '{broken');
      expect(loadChatState()).toEqual({
        isOpen: false,
        isExpanded: false,
        recipient: null,
        drafts: {},
      });
    });
  });

  describe('v1 migration (loadV1AsV2)', () => {
    it('migrates v1 state into v2 and removes the v1 key', () => {
      memory.setItem(
        V1_KEY,
        JSON.stringify({
          isOpen: true,
          isExpanded: false,
          recipient,
          draftText: 'from v1',
          draftPreview: preview,
        }),
      );

      const loaded = loadChatState();
      expect(loaded).toEqual({
        isOpen: true,
        isExpanded: false,
        recipient,
        drafts: {
          7: { text: 'from v1', preview },
        },
      });
      expect(memory.getItem(V1_KEY)).toBeNull();
      expect(memory.getItem(V2_KEY)).toBeTruthy();
    });

    it('migrates v1 with recipient but empty draft without seeding drafts', () => {
      memory.setItem(
        V1_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: true,
          recipient,
          draftText: '   ',
          draftPreview: null,
        }),
      );

      const loaded = loadChatState();
      expect(loaded.recipient).toEqual(recipient);
      expect(loaded.isExpanded).toBe(true);
      expect(loaded.drafts).toEqual({});
    });

    it('migrates v1 without a valid recipient (no draft seeding)', () => {
      memory.setItem(
        V1_KEY,
        JSON.stringify({
          isOpen: true,
          recipient: { id: 1 },
          draftText: 'orphan',
          draftPreview: { url: 'https://x.com' },
        }),
      );

      const loaded = loadChatState();
      expect(loaded.recipient).toBeNull();
      expect(loaded.drafts).toEqual({});
      expect(loaded.isOpen).toBe(true);
    });

    it('migrates v1 with non-string draftText and invalid preview', () => {
      memory.setItem(
        V1_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: false,
          recipient,
          draftText: 42,
          draftPreview: { title: 'no url' },
        }),
      );

      expect(loadChatState().drafts).toEqual({});
    });

    it('migrates v1 preview-only draft for a valid recipient', () => {
      memory.setItem(
        V1_KEY,
        JSON.stringify({
          isOpen: true,
          isExpanded: false,
          recipient,
          draftText: '',
          draftPreview: preview,
        }),
      );

      expect(loadChatState().drafts).toEqual({
        7: { text: '', preview },
      });
    });

    it('returns empty state when v1 JSON is corrupt', () => {
      memory.setItem(V1_KEY, '{not-json');
      expect(loadChatState()).toEqual({
        isOpen: false,
        isExpanded: false,
        recipient: null,
        drafts: {},
      });
    });

    it('still migrates when removing the v1 key throws', () => {
      memory.setItem(
        V1_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: false,
          recipient,
          draftText: 'keep',
          draftPreview: null,
        }),
      );

      memory.removeItem = (key: string) => {
        if (key === V1_KEY) throw new Error('blocked');
        delete memory.data[key];
      };

      const loaded = loadChatState();
      expect(loaded.drafts[7]).toEqual({ text: 'keep', preview: null });
      expect(memory.getItem(V2_KEY)).toBeTruthy();
    });

    it('prefers v2 over v1 when both exist', () => {
      memory.setItem(
        V1_KEY,
        JSON.stringify({
          isOpen: true,
          isExpanded: true,
          recipient,
          draftText: 'from v1',
          draftPreview: null,
        }),
      );
      memory.setItem(
        V2_KEY,
        JSON.stringify({
          isOpen: false,
          isExpanded: false,
          recipient: null,
          drafts: { 1: { text: 'from v2', preview: null } },
        }),
      );

      const loaded = loadChatState();
      expect(loaded).toEqual({
        isOpen: false,
        isExpanded: false,
        recipient: null,
        drafts: { 1: { text: 'from v2', preview: null } },
      });
      expect(memory.getItem(V1_KEY)).toBeTruthy();
    });
  });
});
