/**
 * Temporary browser-history layers for the chat overlay.
 * Uses history.state markers only — no URL changes.
 */

export type ChatHistoryLayer = 'list' | 'thread';

export const HIN_CHAT_STATE_KEY = 'hinChat';

export function getChatLayer(state: unknown): ChatHistoryLayer | null {
  if (!state || typeof state !== 'object') return null;
  const layer = (state as Record<string, unknown>)[HIN_CHAT_STATE_KEY];
  if (layer === 'list' || layer === 'thread') return layer;
  return null;
}

export function mergeChatState(
  existing: unknown,
  layer: ChatHistoryLayer | null,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (layer == null) {
    delete base[HIN_CHAT_STATE_KEY];
  } else {
    base[HIN_CHAT_STATE_KEY] = layer;
  }
  return base;
}

export type ChatHistoryController = {
  getDepth: () => number;
  isSuppressing: () => boolean;
  pushList: () => void;
  pushThread: () => void;
  ensureOpenToList: () => void;
  ensureOpenToThread: () => void;
  replaceLayer: (layer: ChatHistoryLayer) => void;
  notePopped: () => void;
  resetDepth: () => void;
  /** @returns true if this pop was part of an intentional dismiss */
  consumeSuppressedPop: () => boolean;
  /**
   * Remove chat history entries. Calls onSettled sync when depth is 0,
   * or after history.go(-depth) pops complete.
   * @returns true if history.go was invoked
   */
  dismiss: (opts?: { onSettled?: () => void }) => boolean;
};

export type ChatHistoryControllerOptions = {
  history?: Pick<History, 'state' | 'pushState' | 'replaceState' | 'go'>;
  getUrl?: () => string;
};

export function createChatHistoryController(
  opts?: ChatHistoryControllerOptions,
): ChatHistoryController {
  const hist = opts?.history ?? window.history;
  const getUrl =
    opts?.getUrl ??
    (() => `${window.location.pathname}${window.location.search}${window.location.hash}`);

  let depth = 0;
  let suppressRemaining = 0;
  let onSettled: (() => void) | null = null;

  const pushList = () => {
    if (getChatLayer(hist.state) === 'list') return;
    hist.pushState(mergeChatState(hist.state, 'list'), '', getUrl());
    depth += 1;
  };

  const pushThread = () => {
    if (getChatLayer(hist.state) === 'thread') return;
    hist.pushState(mergeChatState(hist.state, 'thread'), '', getUrl());
    depth += 1;
  };

  return {
    getDepth: () => depth,
    isSuppressing: () => suppressRemaining > 0,

    pushList,
    pushThread,

    ensureOpenToList: () => {
      const layer = getChatLayer(hist.state);
      if (layer === 'list' || layer === 'thread') return;
      pushList();
    },

    ensureOpenToThread: () => {
      const layer = getChatLayer(hist.state);
      if (layer === 'thread') return;
      if (layer !== 'list') pushList();
      pushThread();
    },

    replaceLayer: (layer: ChatHistoryLayer) => {
      hist.replaceState(mergeChatState(hist.state, layer), '', getUrl());
    },

    notePopped: () => {
      if (depth > 0) depth -= 1;
    },

    resetDepth: () => {
      depth = 0;
    },

    consumeSuppressedPop: () => {
      if (suppressRemaining <= 0) return false;
      suppressRemaining -= 1;
      // history.go(-n) emits a single popstate for the final entry.
      depth = 0;
      if (suppressRemaining === 0) {
        const cb = onSettled;
        onSettled = null;
        cb?.();
      }
      return true;
    },

    dismiss: (dismissOpts?: { onSettled?: () => void }) => {
      if (suppressRemaining > 0) {
        if (dismissOpts?.onSettled) {
          const prev = onSettled;
          onSettled = () => {
            prev?.();
            dismissOpts.onSettled?.();
          };
        }
        return true;
      }

      if (depth <= 0) {
        if (getChatLayer(hist.state)) {
          hist.replaceState(mergeChatState(hist.state, null), '', getUrl());
        }
        dismissOpts?.onSettled?.();
        return false;
      }

      onSettled = dismissOpts?.onSettled ?? null;
      const delta = depth;
      // One popstate for go(-n), regardless of how many entries we skip.
      suppressRemaining = 1;
      hist.go(-delta);
      return true;
    },
  };
}
