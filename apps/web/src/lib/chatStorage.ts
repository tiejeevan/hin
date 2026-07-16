import type { LinkPreview } from '@hin/types';
import type { ChatRecipient } from '../types/ui';

const CHAT_STORAGE_KEY_V1 = 'hin_chat_ui_v1';
const CHAT_STORAGE_KEY = 'hin_chat_ui_v2';

export interface DraftEntry {
  text: string;
  preview: LinkPreview | null;
  dismissedPreviewUrl?: string | null;
}

export interface PersistedChatState {
  isOpen: boolean;
  isExpanded: boolean;
  recipient: ChatRecipient | null;
  drafts: Record<number, DraftEntry>;
}

const EMPTY: PersistedChatState = {
  isOpen: false,
  isExpanded: false,
  recipient: null,
  drafts: {},
};

function isChatRecipient(value: unknown): value is ChatRecipient {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === 'number' && typeof r.username === 'string' && typeof r.role === 'string';
}

function isLinkPreview(value: unknown): value is LinkPreview {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>).url === 'string';
}

function isDraftEntry(value: unknown): value is DraftEntry {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  if (typeof d.text !== 'string') return false;
  if (d.preview != null && !isLinkPreview(d.preview)) return false;
  if (
    d.dismissedPreviewUrl != null &&
    typeof d.dismissedPreviewUrl !== 'string'
  ) {
    return false;
  }
  return true;
}

function parseDrafts(value: unknown): Record<number, DraftEntry> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<number, DraftEntry> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const id = Number(key);
    if (!Number.isFinite(id) || !isDraftEntry(entry)) continue;
    const pruned = pruneDraftEntry(entry);
    if (pruned) out[id] = pruned;
  }
  return out;
}

/** Drop empty drafts (no text and no preview). */
export function pruneDraftEntry(entry: DraftEntry): DraftEntry | null {
  const text = entry.text.trim() ? entry.text : '';
  const preview = entry.preview && isLinkPreview(entry.preview) ? entry.preview : null;
  if (!text && !preview) return null;
  const result: DraftEntry = { text, preview };
  if (entry.dismissedPreviewUrl) {
    result.dismissedPreviewUrl = entry.dismissedPreviewUrl;
  }
  return result;
}

export function pruneDrafts(drafts: Record<number, DraftEntry>): Record<number, DraftEntry> {
  const out: Record<number, DraftEntry> = {};
  for (const [key, entry] of Object.entries(drafts)) {
    const id = Number(key);
    if (!Number.isFinite(id)) continue;
    const pruned = pruneDraftEntry(entry);
    if (pruned) out[id] = pruned;
  }
  return out;
}

function loadV1AsV2(): PersistedChatState | null {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY_V1);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      isOpen?: boolean;
      isExpanded?: boolean;
      recipient?: unknown;
      draftText?: unknown;
      draftPreview?: unknown;
    };
    const recipient = isChatRecipient(parsed.recipient) ? parsed.recipient : null;
    const draftText = typeof parsed.draftText === 'string' ? parsed.draftText : '';
    const draftPreview = isLinkPreview(parsed.draftPreview) ? parsed.draftPreview : null;
    const drafts: Record<number, DraftEntry> = {};
    if (recipient) {
      const entry = pruneDraftEntry({ text: draftText, preview: draftPreview });
      if (entry) drafts[recipient.id] = entry;
    }
    return {
      isOpen: !!parsed.isOpen,
      isExpanded: !!parsed.isExpanded,
      recipient,
      drafts,
    };
  } catch {
    return null;
  }
}

export function loadChatState(): PersistedChatState {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedChatState>;
      return {
        isOpen: !!parsed.isOpen,
        isExpanded: !!parsed.isExpanded,
        recipient: isChatRecipient(parsed.recipient) ? parsed.recipient : null,
        drafts: parseDrafts(parsed.drafts),
      };
    }

    const migrated = loadV1AsV2();
    if (migrated) {
      saveChatState(migrated);
      try {
        localStorage.removeItem(CHAT_STORAGE_KEY_V1);
      } catch {
        // ignore (private mode / restricted storage)
      }
      return migrated;
    }

    return { ...EMPTY, drafts: {} };
  } catch {
    return { ...EMPTY, drafts: {} };
  }
}

export function saveChatState(state: PersistedChatState): void {
  try {
    const toSave: PersistedChatState = {
      isOpen: state.isOpen,
      isExpanded: state.isExpanded,
      recipient: state.recipient,
      drafts: pruneDrafts(state.drafts),
    };
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // ignore quota / private mode
  }
}

export function clearChatState(): void {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem(CHAT_STORAGE_KEY_V1);
  } catch {
    // ignore
  }
}

export function getDraftForRecipient(
  drafts: Record<number, DraftEntry>,
  recipientId: number,
): DraftEntry {
  return drafts[recipientId] ?? { text: '', preview: null };
}
