use hin_chat_core::{
    apply_delivered as core_apply_delivered, apply_messages_read as core_apply_messages_read,
    extract_first_url as core_extract_first_url, invert_flip_uniform as core_invert_flip_uniform,
    merge_and_sort_messages as core_merge_and_sort_messages, release_snap as core_release_snap,
    rubber_band as core_rubber_band, sort_threads as core_sort_threads, ChatEngine, EngineEvent,
    Message, RectLike, DEFAULT_FLICK_DOWN, DEFAULT_FLICK_UP, DEFAULT_SNAP_THRESHOLD,
};

/// Keep in sync with `CHAT_WASM_BRIDGE_VERSION` in `apps/web/src/lib/chatWasmBridge.ts`.
const CHAT_CORE_VERSION: &str = "1";
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use wasm_bindgen::prelude::*;

fn engines() -> &'static Mutex<HashMap<u32, ChatEngine>> {
    static ENGINES: OnceLock<Mutex<HashMap<u32, ChatEngine>>> = OnceLock::new();
    ENGINES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_id() -> &'static Mutex<u32> {
    static NEXT: OnceLock<Mutex<u32>> = OnceLock::new();
    NEXT.get_or_init(|| Mutex::new(1))
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn chat_core_version() -> String {
    CHAT_CORE_VERSION.to_string()
}

#[wasm_bindgen]
pub fn extract_first_url(text: &str) -> Option<String> {
    core_extract_first_url(text)
}

fn js_err(err: impl ToString) -> JsValue {
    JsValue::from_str(&err.to_string())
}

#[wasm_bindgen]
pub fn merge_and_sort_messages(existing_json: &str, incoming_json: &str) -> Result<String, JsValue> {
    let existing: Vec<Message> = serde_json::from_str(existing_json).map_err(js_err)?;
    let incoming: Vec<Message> = serde_json::from_str(incoming_json).map_err(js_err)?;
    let merged = core_merge_and_sort_messages(&existing, &incoming);
    serde_json::to_string(&merged).map_err(js_err)
}

#[wasm_bindgen]
pub fn apply_delivered(
    messages_json: &str,
    ids_json: &str,
    delivered_at: &str,
) -> Result<String, JsValue> {
    let messages: Vec<Message> = serde_json::from_str(messages_json).map_err(js_err)?;
    let ids: Vec<i64> = serde_json::from_str(ids_json).map_err(js_err)?;
    let next = core_apply_delivered(&messages, &ids, delivered_at);
    serde_json::to_string(&next).map_err(js_err)
}

#[wasm_bindgen]
pub fn apply_messages_read(
    messages_json: &str,
    sender_id: i64,
    receiver_id: i64,
    read_at: &str,
) -> Result<String, JsValue> {
    let messages: Vec<Message> = serde_json::from_str(messages_json).map_err(js_err)?;
    let next = core_apply_messages_read(&messages, sender_id, receiver_id, read_at);
    serde_json::to_string(&next).map_err(js_err)
}

#[wasm_bindgen]
pub fn rubber_band(offset: f64, limit: f64) -> f64 {
    core_rubber_band(offset, limit)
}

#[wasm_bindgen]
pub fn release_snap(
    offset_y: f64,
    velocity_y: f64,
    expanded: bool,
    threshold: Option<f64>,
    flick_up: Option<f64>,
    flick_down: Option<f64>,
) -> String {
    core_release_snap(
        offset_y,
        velocity_y,
        expanded,
        threshold.unwrap_or(DEFAULT_SNAP_THRESHOLD),
        flick_up.unwrap_or(DEFAULT_FLICK_UP),
        flick_down.unwrap_or(DEFAULT_FLICK_DOWN),
    )
    .as_str()
    .to_string()
}

#[wasm_bindgen]
pub fn invert_flip_uniform(from_json: &str, to_json: &str) -> Result<String, JsValue> {
    let from: RectLike = serde_json::from_str(from_json).map_err(js_err)?;
    let to: RectLike = serde_json::from_str(to_json).map_err(js_err)?;
    let result = core_invert_flip_uniform(from, to);
    serde_json::to_string(&result).map_err(js_err)
}

#[wasm_bindgen]
pub fn sort_threads(threads_json: &str) -> Result<String, JsValue> {
    let threads = serde_json::from_str(threads_json).map_err(js_err)?;
    let sorted = core_sort_threads(threads);
    serde_json::to_string(&sorted).map_err(js_err)
}

#[wasm_bindgen]
pub fn engine_create() -> u32 {
    let mut map = engines().lock().expect("engines lock");
    let mut next = next_id().lock().expect("next id lock");
    let id = *next;
    *next = next.saturating_add(1);
    map.insert(id, ChatEngine::new());
    id
}

#[wasm_bindgen]
pub fn engine_dispatch(engine_id: u32, event_json: &str) -> Result<String, JsValue> {
    let event: EngineEvent = serde_json::from_str(event_json).map_err(js_err)?;
    let mut map = engines().lock().map_err(|_| js_err("engines lock"))?;
    let engine = map
        .get_mut(&engine_id)
        .ok_or_else(|| js_err(format!("unknown engine id {engine_id}")))?;
    let patch = engine.dispatch(event);
    serde_json::to_string(&patch).map_err(js_err)
}

#[wasm_bindgen]
pub fn engine_snapshot(engine_id: u32) -> Result<String, JsValue> {
    let map = engines().lock().map_err(|_| js_err("engines lock"))?;
    let engine = map
        .get(&engine_id)
        .ok_or_else(|| js_err(format!("unknown engine id {engine_id}")))?;
    serde_json::to_string(engine).map_err(js_err)
}
