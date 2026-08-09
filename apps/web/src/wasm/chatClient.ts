/**
 * Lazy WASM init for chat math/engine.
 *
 * Generated pkg (optional) lives at apps/web/src/wasm/chat via wasm-pack.
 * Build must succeed without that folder — e.g. Cloudflare Pages with
 * `apps/web` + `npm run build` and no Rust toolchain. Runtime falls back to TS.
 */

/** Hand-maintained surface so TypeScript does not require generated pkg files. */
export type ChatWasmModule = {
  default?: (input?: unknown) => Promise<unknown>;
  merge_and_sort_messages: (existingJson: string, incomingJson: string) => string;
  apply_delivered: (messagesJson: string, idsJson: string, deliveredAt: string) => string;
  apply_messages_read: (
    messagesJson: string,
    senderId: bigint,
    receiverId: bigint,
    readAt: string,
  ) => string;
  rubber_band: (offset: number, limit: number) => number;
  release_snap: (
    offsetY: number,
    velocityY: number,
    expanded: boolean,
    threshold?: number,
    flickUp?: number,
    flickDown?: number,
  ) => string;
  invert_flip_uniform: (fromJson: string, toJson: string) => string;
  sort_threads: (threadsJson: string) => string;
};

let initPromise: Promise<ChatWasmModule | null> | null = null;
let wasmModule: ChatWasmModule | null = null;
let initFailed = false;

declare global {
  interface Window {
    __CHAT_WASM_READY__?: boolean;
  }
}

export function isChatWasmEnabled(): boolean {
  const flag = import.meta.env.VITE_CHAT_WASM;
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return true;
  return import.meta.env.PROD;
}

export function getChatWasmModule(): ChatWasmModule | null {
  return wasmModule;
}

export function wasChatWasmInitFailed(): boolean {
  return initFailed;
}

/** Initialize chat WASM once. Safe to call repeatedly. */
export async function ensureChatWasm(): Promise<ChatWasmModule | null> {
  if (!isChatWasmEnabled()) return null;
  if (initFailed) return null;
  if (wasmModule) return wasmModule;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      performance.mark('chat-wasm-init');
      // Variable specifier + @vite-ignore: don't fail CI/Pages when pkg isn't generated.
      const wasmSpecifier = '../wasm/chat/hin_chat_wasm.js';
      const mod = (await import(/* @vite-ignore */ wasmSpecifier)) as ChatWasmModule;
      const init = mod.default;
      if (typeof init === 'function') {
        await init();
      }
      wasmModule = mod;
      if (typeof window !== 'undefined') {
        window.__CHAT_WASM_READY__ = true;
      }
      return mod;
    } catch (err) {
      initFailed = true;
      console.warn('[chat:wasm] init failed, using TS fallback', err);
      return null;
    }
  })();

  const result = await initPromise;
  if (initFailed) {
    initPromise = null;
    return null;
  }
  return result;
}
