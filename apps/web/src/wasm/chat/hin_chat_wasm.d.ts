/* tslint:disable */
/* eslint-disable */

export function apply_delivered(messages_json: string, ids_json: string, delivered_at: string): string;

export function apply_messages_read(messages_json: string, sender_id: bigint, receiver_id: bigint, read_at: string): string;

export function engine_create(): number;

export function engine_dispatch(engine_id: number, event_json: string): string;

export function engine_snapshot(engine_id: number): string;

export function invert_flip_uniform(from_json: string, to_json: string): string;

export function merge_and_sort_messages(existing_json: string, incoming_json: string): string;

export function release_snap(offset_y: number, velocity_y: number, expanded: boolean, threshold?: number | null, flick_up?: number | null, flick_down?: number | null): string;

export function rubber_band(offset: number, limit: number): number;

export function sort_threads(threads_json: string): string;

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly merge_and_sort_messages: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly apply_delivered: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly apply_messages_read: (a: number, b: number, c: bigint, d: bigint, e: number, f: number) => [number, number, number, number];
    readonly rubber_band: (a: number, b: number) => number;
    readonly release_snap: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly invert_flip_uniform: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly sort_threads: (a: number, b: number) => [number, number, number, number];
    readonly engine_create: () => number;
    readonly engine_dispatch: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_snapshot: (a: number) => [number, number, number, number];
    readonly start: () => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
