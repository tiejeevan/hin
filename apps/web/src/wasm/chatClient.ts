/**
 * Lazy WASM init for chat math/engine.
 * Generated pkg lives at apps/web/src/wasm/chat (via wasm-pack).
 */

export type ChatWasmModule = typeof import('../wasm/chat/hin_chat_wasm.js');

let initPromise: Promise<ChatWasmModule> | null = null;
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
      const mod = await import('../wasm/chat/hin_chat_wasm.js');
      // wasm-pack web target exports default init
      const init = (mod as { default?: (input?: unknown) => Promise<unknown> }).default;
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
      return null as unknown as ChatWasmModule;
    }
  })();

  const result = await initPromise;
  if (initFailed) {
    initPromise = null;
    return null;
  }
  return result;
}
