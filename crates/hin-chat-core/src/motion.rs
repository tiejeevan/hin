use serde::{Deserialize, Serialize};

pub const DEFAULT_SNAP_THRESHOLD: f64 = 320.0;
pub const DEFAULT_FLICK_UP: f64 = 0.5;
pub const DEFAULT_FLICK_DOWN: f64 = 0.36;
pub const DEFAULT_FLICK_UP_STRONG: f64 = 1.1;
pub const DEFAULT_FLICK_DOWN_STRONG: f64 = 0.75;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RectLike {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvertFlipResult {
    pub dx: f64,
    pub dy: f64,
    pub scale_x: f64,
    pub scale_y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvertFlipUniformResult {
    pub dx: f64,
    pub dy: f64,
    pub scale: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReleaseSnapAction {
    Expand,
    Compact,
    Close,
    None,
}

impl ReleaseSnapAction {
    pub fn as_str(self) -> &'static str {
        match self {
            ReleaseSnapAction::Expand => "expand",
            ReleaseSnapAction::Compact => "compact",
            ReleaseSnapAction::Close => "close",
            ReleaseSnapAction::None => "none",
        }
    }
}

/// Dampen an overscroll offset past `limit` (pixel rubber-band).
pub fn rubber_band(offset: f64, limit: f64) -> f64 {
    if limit <= 0.0 {
        return 0.0;
    }
    let sign = if offset < 0.0 { -1.0 } else { 1.0 };
    let abs = offset.abs();
    if abs <= limit {
        return offset;
    }
    let excess = abs - limit;
    let damped = limit + excess * (limit / (limit + excess));
    sign * damped.min(limit * 1.5)
}

/// Decide snap action after a vertical drag on the chat shell handle.
/// Positive `offset_y` = dragged down.
pub fn release_snap(
    offset_y: f64,
    velocity_y: f64,
    expanded: bool,
    threshold: f64,
    flick_up: f64,
    flick_down: f64,
) -> ReleaseSnapAction {
    let strong_up = DEFAULT_FLICK_UP_STRONG;
    let strong_down = DEFAULT_FLICK_DOWN_STRONG;

    if expanded {
        if velocity_y < -strong_up || (offset_y < -threshold && velocity_y <= flick_up) {
            return ReleaseSnapAction::None;
        }
        if velocity_y > strong_down || offset_y > threshold {
            return ReleaseSnapAction::Compact;
        }
        if velocity_y > flick_down && offset_y > threshold * 0.35 {
            return ReleaseSnapAction::Compact;
        }
        return ReleaseSnapAction::None;
    }

    // Compact mode
    if velocity_y < -strong_up || (offset_y < -threshold * 0.45 && velocity_y <= flick_up) {
        return ReleaseSnapAction::Expand;
    }
    if velocity_y > strong_down || offset_y > threshold * 0.55 {
        return ReleaseSnapAction::Close;
    }
    if velocity_y > flick_down && offset_y > threshold * 0.3 {
        return ReleaseSnapAction::Close;
    }
    ReleaseSnapAction::None
}

pub fn release_snap_default(
    offset_y: f64,
    velocity_y: f64,
    expanded: bool,
) -> ReleaseSnapAction {
    release_snap(
        offset_y,
        velocity_y,
        expanded,
        DEFAULT_SNAP_THRESHOLD,
        DEFAULT_FLICK_UP,
        DEFAULT_FLICK_DOWN,
    )
}

/// Invert a FLIP layout change into a transform that starts at `from` and ends at identity on `to`.
pub fn invert_flip(from: RectLike, to: RectLike) -> InvertFlipResult {
    let scale_x = if to.width == 0.0 {
        1.0
    } else {
        from.width / to.width
    };
    let scale_y = if to.height == 0.0 {
        1.0
    } else {
        from.height / to.height
    };
    let dx = from.x + from.width / 2.0 - (to.x + to.width / 2.0);
    let dy = from.y + from.height / 2.0 - (to.y + to.height / 2.0);
    InvertFlipResult {
        dx,
        dy,
        scale_x,
        scale_y,
    }
}

/// Uniform-scale invert (single scale factor = min of scaleX/scaleY).
pub fn invert_flip_uniform(from: RectLike, to: RectLike) -> InvertFlipUniformResult {
    let InvertFlipResult {
        dx,
        dy,
        scale_x,
        scale_y,
    } = invert_flip(from, to);
    InvertFlipUniformResult {
        dx,
        dy,
        scale: scale_x.min(scale_y),
    }
}

pub fn invert_flip_css(from: RectLike, to: RectLike) -> String {
    let r = invert_flip(from, to);
    format!(
        "translate({}px, {}px) scale({}, {})",
        r.dx, r.dy, r.scale_x, r.scale_y
    )
}

/// Map current layout rect toward a target with uniform scale.
pub fn transform_layout_to_target_uniform(from: RectLike, to: RectLike) -> InvertFlipUniformResult {
    invert_flip_uniform(from, to)
}

/// Cubic ease-out used by scroll helpers; callers apply scrollTop per frame.
pub fn ease_scroll_to(t: f64) -> f64 {
    let clamped = t.clamp(0.0, 1.0);
    1.0 - (1.0 - clamped).powi(3)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rubber_band_passthrough_within_limit() {
        assert!((rubber_band(10.0, 100.0) - 10.0).abs() < f64::EPSILON);
        assert!((rubber_band(-20.0, 100.0) + 20.0).abs() < f64::EPSILON);
    }

    #[test]
    fn rubber_band_damps_beyond_limit() {
        let v = rubber_band(200.0, 100.0);
        assert!(v > 100.0);
        assert!(v <= 150.0);
    }

    #[test]
    fn rubber_band_zero_limit() {
        assert_eq!(rubber_band(50.0, 0.0), 0.0);
    }

    #[test]
    fn release_snap_expanded_compacts_on_strong_down() {
        assert_eq!(
            release_snap_default(0.0, 1.2, true),
            ReleaseSnapAction::Compact
        );
    }

    #[test]
    fn release_snap_expanded_compacts_past_threshold() {
        assert_eq!(
            release_snap_default(400.0, 0.0, true),
            ReleaseSnapAction::Compact
        );
    }

    #[test]
    fn release_snap_expanded_none_on_flick_up() {
        assert_eq!(
            release_snap_default(-400.0, -0.1, true),
            ReleaseSnapAction::None
        );
    }

    #[test]
    fn release_snap_compact_expands_on_strong_up() {
        assert_eq!(
            release_snap_default(0.0, -1.2, false),
            ReleaseSnapAction::Expand
        );
    }

    #[test]
    fn release_snap_compact_closes_on_down() {
        assert_eq!(
            release_snap_default(200.0, 0.0, false),
            ReleaseSnapAction::Close
        );
    }

    #[test]
    fn release_snap_compact_none_small_drag() {
        assert_eq!(
            release_snap_default(10.0, 0.0, false),
            ReleaseSnapAction::None
        );
    }

    #[test]
    fn invert_flip_uniform_uses_min_scale() {
        let from = RectLike {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 50.0,
        };
        let to = RectLike {
            x: 0.0,
            y: 0.0,
            width: 200.0,
            height: 200.0,
        };
        let r = invert_flip_uniform(from, to);
        assert!((r.scale - 0.25).abs() < 1e-9);
    }

    #[test]
    fn invert_flip_zero_width_fallback() {
        let from = RectLike {
            x: 0.0,
            y: 0.0,
            width: 40.0,
            height: 40.0,
        };
        let to = RectLike {
            x: 10.0,
            y: 10.0,
            width: 0.0,
            height: 80.0,
        };
        let r = invert_flip(from, to);
        assert!((r.scale_x - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn ease_scroll_to_bounds() {
        assert!((ease_scroll_to(0.0) - 0.0).abs() < 1e-12);
        assert!((ease_scroll_to(1.0) - 1.0).abs() < 1e-12);
        assert!(ease_scroll_to(0.5) > 0.5);
        assert!((ease_scroll_to(-1.0) - 0.0).abs() < 1e-12);
        assert!((ease_scroll_to(2.0) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn transform_layout_matches_uniform() {
        let from = RectLike {
            x: 1.0,
            y: 2.0,
            width: 10.0,
            height: 20.0,
        };
        let to = RectLike {
            x: 5.0,
            y: 6.0,
            width: 40.0,
            height: 40.0,
        };
        assert_eq!(
            transform_layout_to_target_uniform(from, to),
            invert_flip_uniform(from, to)
        );
    }
}
