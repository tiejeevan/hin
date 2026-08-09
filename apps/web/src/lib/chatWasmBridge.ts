/**
 * Unified chat math API with WASM when available, TS fallback otherwise.
 */
import type { ChatThread, Message } from '@hin/types';
import * as tsMessages from './chatMessages';
import * as tsMorph from './panelMorph';
import { ensureChatWasm, getChatWasmModule, isChatWasmEnabled } from '../wasm/chatClient';

export type ReleaseSnapAction = tsMorph.ReleaseSnapAction;
export type RectLike = tsMorph.RectLike;

let warnedFallback = false;

function noteFallback(reason: string) {
  if (warnedFallback || !isChatWasmEnabled()) return;
  warnedFallback = true;
  console.info(`[chat:wasm] using TS fallback (${reason})`);
}

export async function initChatWasmBridge(): Promise<boolean> {
  const mod = await ensureChatWasm();
  return !!mod;
}

export function mergeAndSortMessages(existing: Message[], incoming: Message[]): Message[] {
  const wasm = getChatWasmModule();
  if (wasm) {
    try {
      const json = wasm.merge_and_sort_messages(JSON.stringify(existing), JSON.stringify(incoming));
      return JSON.parse(json) as Message[];
    } catch (err) {
      noteFallback('merge_and_sort_messages error');
      console.warn('[chat:wasm]', err);
    }
  } else {
    noteFallback('unavailable');
  }
  return tsMessages.mergeAndSortMessages(existing, incoming);
}

export function applyDelivered(
  messages: Message[],
  messageIds: number[],
  deliveredAt: string,
): Message[] {
  const wasm = getChatWasmModule();
  if (wasm) {
    try {
      const json = wasm.apply_delivered(
        JSON.stringify(messages),
        JSON.stringify(messageIds),
        deliveredAt,
      );
      return JSON.parse(json) as Message[];
    } catch (err) {
      noteFallback('apply_delivered error');
      console.warn('[chat:wasm]', err);
    }
  }
  return tsMessages.applyDelivered(messages, messageIds, deliveredAt);
}

export function applyMessagesRead(
  messages: Message[],
  opts: { senderId: number; receiverId: number; readAt: string },
): Message[] {
  const wasm = getChatWasmModule();
  if (wasm) {
    try {
      const json = wasm.apply_messages_read(
        JSON.stringify(messages),
        BigInt(opts.senderId),
        BigInt(opts.receiverId),
        opts.readAt,
      );
      return JSON.parse(json) as Message[];
    } catch (err) {
      noteFallback('apply_messages_read error');
      console.warn('[chat:wasm]', err);
    }
  }
  return tsMessages.applyMessagesRead(messages, opts);
}

export function rubberBand(offset: number, limit: number): number {
  const wasm = getChatWasmModule();
  if (wasm) {
    try {
      return wasm.rubber_band(offset, limit);
    } catch {
      /* fallback */
    }
  }
  return tsMorph.rubberBand(offset, limit);
}

export function releaseSnap(
  offsetY: number,
  velocityY: number,
  expanded: boolean,
  threshold?: number,
  flickUp?: number,
  flickDown?: number,
): ReleaseSnapAction {
  const wasm = getChatWasmModule();
  if (wasm) {
    try {
      const action = wasm.release_snap(
        offsetY,
        velocityY,
        expanded,
        threshold,
        flickUp,
        flickDown,
      );
      return action as ReleaseSnapAction;
    } catch {
      /* fallback */
    }
  }
  return tsMorph.releaseSnap(offsetY, velocityY, expanded, threshold, flickUp, flickDown);
}

export function invertFlipUniform(from: RectLike, to: RectLike): tsMorph.InvertFlipUniformResult {
  const wasm = getChatWasmModule();
  if (wasm) {
    try {
      const json = wasm.invert_flip_uniform(JSON.stringify(from), JSON.stringify(to));
      return JSON.parse(json) as tsMorph.InvertFlipUniformResult;
    } catch {
      /* fallback */
    }
  }
  return tsMorph.invertFlipUniform(from, to);
}

export function sortThreads(threads: ChatThread[]): ChatThread[] {
  const wasm = getChatWasmModule();
  if (wasm) {
    try {
      const json = wasm.sort_threads(JSON.stringify(threads));
      return JSON.parse(json) as ChatThread[];
    } catch {
      /* fallback */
    }
  }
  return [...threads].sort((a, b) => {
    const ta = a.lastMessage?.createdAt ? Date.parse(a.lastMessage.createdAt) : 0;
    const tb = b.lastMessage?.createdAt ? Date.parse(b.lastMessage.createdAt) : 0;
    if (tb !== ta) return tb - ta;
    return a.username.localeCompare(b.username);
  });
}

// Re-export TS-only helpers
export { deriveLocalStatus, STATUS_RANK } from './chatMessages';
export {
  easeScrollTo,
  invertFlip,
  invertFlipCss,
  measureRect,
  prefersReducedMotion,
  transformLayoutToTargetUniform,
} from './panelMorph';
