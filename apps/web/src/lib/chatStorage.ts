import type { LinkPreview } from '@hin/types';
import type { ChatRecipient } from '../types/ui';

const CHAT_STORAGE_KEY_V1 = 'hin_chat_ui_v1';
export const CHAT_STORAGE_KEY = 'hin_chat_ui_v2';

export type MediaDraftMeta = {
  fileName: string;
  fileType: string;
  fileSize: number;
};

export interface DraftEntry {
  text: string;
  preview: LinkPreview | null;
  dismissedPreviewUrl?: string | null;
  mediaDraft?: MediaDraftMeta | null;
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

function isMediaDraft(value: unknown): value is MediaDraftMeta {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.fileName === 'string' &&
    typeof m.fileType === 'string' &&
    typeof m.fileSize === 'number' &&
    Number.isFinite(m.fileSize)
  );
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
  if (d.mediaDraft != null && !isMediaDraft(d.mediaDraft)) return false;
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

/** Drop empty drafts (no text, preview, or mediaDraft). */
export function pruneDraftEntry(entry: DraftEntry): DraftEntry | null {
  const text = entry.text.trim() ? entry.text : '';
  const preview = entry.preview && isLinkPreview(entry.preview) ? entry.preview : null;
  const mediaDraft =
    entry.mediaDraft && isMediaDraft(entry.mediaDraft) ? entry.mediaDraft : null;
  if (!text && !preview && !mediaDraft) return null;
  const result: DraftEntry = { text, preview };
  if (entry.dismissedPreviewUrl) {
    result.dismissedPreviewUrl = entry.dismissedPreviewUrl;
  }
  if (mediaDraft) {
    result.mediaDraft = mediaDraft;
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

/**
 * Merge per-recipient drafts so one tab does not wipe unrelated thread drafts
 * written by another tab. Incoming fields win per key via shallow spread.
 */
export function mergeDraftMaps(
  existing: Record<number, DraftEntry>,
  incoming: Record<number, DraftEntry>,
): Record<number, DraftEntry> {
  const out: Record<number, DraftEntry> = { ...existing };
  for (const [key, entry] of Object.entries(incoming)) {
    const id = Number(key);
    if (!Number.isFinite(id)) continue;
    const prev = out[id];
    out[id] = prev ? { ...prev, ...entry } : entry;
  }
  return out;
}

function parseV2Raw(raw: string): PersistedChatState {
  const parsed = JSON.parse(raw) as Partial<PersistedChatState>;
  return {
    isOpen: !!parsed.isOpen,
    isExpanded: !!parsed.isExpanded,
    recipient: isChatRecipient(parsed.recipient) ? parsed.recipient : null,
    drafts: parseDrafts(parsed.drafts),
  };
}

/** Read existing v2 state without triggering v1 migration (avoids save recursion). */
function readExistingV2State(): PersistedChatState | null {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return null;
    return parseV2Raw(raw);
  } catch {
    return null;
  }
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
      return parseV2Raw(raw);
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
    const existing = readExistingV2State();
    const mergedDrafts = mergeDraftMaps(existing?.drafts ?? {}, state.drafts);
    const toSave: PersistedChatState = {
      isOpen: state.isOpen,
      isExpanded: state.isExpanded,
      recipient: state.recipient,
      drafts: pruneDrafts(mergedDrafts),
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

/**
 * Subscribe to cross-tab chat UI storage updates.
 * Fires when another tab writes (or clears) CHAT_STORAGE_KEY.
 */
export function subscribeChatStorage(
  onChange: (state: PersistedChatState) => void,
): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key !== CHAT_STORAGE_KEY) return;
    onChange(loadChatState());
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
