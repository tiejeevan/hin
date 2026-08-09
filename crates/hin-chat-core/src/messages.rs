use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// Delivery lifecycle for UI checkmarks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeliveryStatus {
    Sending,
    Failed,
    Sent,
    Delivered,
    Read,
}

/// Nested reply quote snapshot on a message.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageReplyTo {
    pub id: i64,
    pub sender_id: i64,
    pub sender_username: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_url: Option<String>,
    #[serde(default)]
    pub deleted: bool,
}

/// Chat message DTO (camelCase JSON).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: i64,
    pub sender_id: i64,
    pub sender_username: String,
    pub receiver_id: i64,
    pub receiver_username: String,
    pub content: String,
    pub created_at: String,
    pub read: bool,
    pub status: DeliveryStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivered_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_message_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    /// Optional JSON value; `None` means field omitted (preserve on merge).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_preview: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to_message_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<MessageReplyTo>,
}

/// Rank used so merges never downgrade delivery status.
pub fn status_rank(status: DeliveryStatus) -> u8 {
    match status {
        DeliveryStatus::Sending | DeliveryStatus::Failed => 0,
        DeliveryStatus::Sent => 1,
        DeliveryStatus::Delivered => 2,
        DeliveryStatus::Read => 3,
    }
}

/// Prefer server status; fall back to deriving from timestamps for older payloads.
/// Mirrors `deriveLocalStatus` in chatMessages.ts.
pub fn derive_local_status(msg: &Message) -> DeliveryStatus {
    match msg.status {
        DeliveryStatus::Sending => DeliveryStatus::Sending,
        DeliveryStatus::Failed => DeliveryStatus::Failed,
        DeliveryStatus::Sent | DeliveryStatus::Delivered | DeliveryStatus::Read => msg.status,
    }
}

/// Sort key: createdAt millis (0 if unparseable), then id.
fn sort_key(msg: &Message) -> (i64, i64) {
    (parse_created_at_ms(&msg.created_at), msg.id)
}

/// Approximate `Date.parse` for ISO-8601 timestamps; invalid → 0.
pub fn parse_created_at_ms(created_at: &str) -> i64 {
    parse_iso_ms(created_at).unwrap_or(0)
}

fn parse_iso_ms(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.len() < 19 {
        return None;
    }
    let bytes = s.as_bytes();
    if bytes[4] != b'-' || bytes[7] != b'-' || (bytes[10] != b'T' && bytes[10] != b't') {
        return None;
    }
    if bytes[13] != b':' || bytes[16] != b':' {
        return None;
    }
    let year: i64 = std::str::from_utf8(&bytes[0..4]).ok()?.parse().ok()?;
    let month: i64 = std::str::from_utf8(&bytes[5..7]).ok()?.parse().ok()?;
    let day: i64 = std::str::from_utf8(&bytes[8..10]).ok()?.parse().ok()?;
    let hour: i64 = std::str::from_utf8(&bytes[11..13]).ok()?.parse().ok()?;
    let min: i64 = std::str::from_utf8(&bytes[14..16]).ok()?.parse().ok()?;
    let sec: i64 = std::str::from_utf8(&bytes[17..19]).ok()?.parse().ok()?;

    let mut idx = 19;
    let mut millis: i64 = 0;
    if idx < bytes.len() && bytes[idx] == b'.' {
        idx += 1;
        let start = idx;
        while idx < bytes.len() && bytes[idx].is_ascii_digit() {
            idx += 1;
        }
        let frac = std::str::from_utf8(&bytes[start..idx]).ok()?;
        let mut digits = frac.to_string();
        while digits.len() < 3 {
            digits.push('0');
        }
        millis = digits[..3.min(digits.len())].parse().ok()?;
    }

    let days = days_from_civil(year, month, day)?;
    let total_secs = days * 86_400 + hour * 3600 + min * 60 + sec;
    Some(total_secs * 1000 + millis)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> Option<i64> {
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

/// Merge two versions of the same message without lowering delivery rank.
pub fn merge_message_prefer_higher_status(
    existing: Option<&Message>,
    incoming: Message,
) -> Message {
    let Some(existing) = existing else {
        return incoming;
    };

    let existing_status = derive_local_status(existing);
    let incoming_status = derive_local_status(&incoming);
    let existing_rank = status_rank(existing_status);
    let incoming_rank = status_rank(incoming_status);
    let prefer_incoming_status = incoming_rank >= existing_rank;
    let status = if prefer_incoming_status {
        incoming_status
    } else {
        existing_status
    };

    Message {
        id: incoming.id,
        sender_id: incoming.sender_id,
        sender_username: incoming.sender_username.clone(),
        receiver_id: incoming.receiver_id,
        receiver_username: incoming.receiver_username.clone(),
        content: incoming.content.clone(),
        created_at: incoming.created_at.clone(),
        read: existing.read || incoming.read,
        status,
        delivered_at: incoming
            .delivered_at
            .clone()
            .or_else(|| existing.delivered_at.clone()),
        read_at: incoming
            .read_at
            .clone()
            .or_else(|| existing.read_at.clone()),
        client_message_id: incoming
            .client_message_id
            .clone()
            .or_else(|| existing.client_message_id.clone()),
        deleted_at: incoming
            .deleted_at
            .clone()
            .or_else(|| existing.deleted_at.clone()),
        link_preview: if incoming.link_preview.is_some() {
            incoming.link_preview.clone()
        } else {
            existing.link_preview.clone()
        },
        media_url: if incoming.media_url.is_some() {
            incoming.media_url.clone()
        } else {
            existing.media_url.clone()
        },
        media_type: if incoming.media_type.is_some() {
            incoming.media_type.clone()
        } else {
            existing.media_type.clone()
        },
        reply_to_message_id: if incoming.reply_to_message_id.is_some() {
            incoming.reply_to_message_id
        } else {
            existing.reply_to_message_id
        },
        reply_to: if incoming.reply_to.is_some() {
            incoming.reply_to.clone()
        } else {
            existing.reply_to.clone()
        },
    }
}

/// Merge incoming messages into an existing list:
/// - Dedupes by positive server id
/// - Replaces optimistic rows (id < 0) by clientMessageId, else sender+content
/// - Never downgrades delivery status
/// - Sorts by createdAt then id
pub fn merge_and_sort_messages(existing: &[Message], incoming: &[Message]) -> Vec<Message> {
    let mut by_id: HashMap<i64, Message> = HashMap::new();
    let mut optimistic: Vec<Message> = Vec::new();

    for msg in existing {
        if msg.id > 0 {
            by_id.insert(msg.id, msg.clone());
        } else {
            optimistic.push(msg.clone());
        }
    }

    let mut remaining_optimistic = optimistic;

    for msg in incoming {
        if msg.id > 0 {
            let mut replaced_optimistic: Option<Message> = None;
            remaining_optimistic.retain(|opt| {
                let match_cid = matches!(
                    (&msg.client_message_id, &opt.client_message_id),
                    (Some(a), Some(b)) if a == b
                );
                let match_content = msg.client_message_id.is_none()
                    && opt.id < 0
                    && opt.sender_id == msg.sender_id
                    && opt.content == msg.content;
                if match_cid || match_content {
                    replaced_optimistic = Some(opt.clone());
                    return false;
                }
                true
            });
            // Prefer server row in by_id; fall back to replaced optimistic so replyTo
            // / media fields survive optimistic → ack when the ack omits them.
            let prior = by_id.get(&msg.id).cloned().or(replaced_optimistic);
            let merged = merge_message_prefer_higher_status(prior.as_ref(), msg.clone());
            by_id.insert(msg.id, merged);
        } else {
            let idx = remaining_optimistic.iter().position(|o| {
                matches!(
                    (&o.client_message_id, &msg.client_message_id),
                    (Some(a), Some(b)) if a == b
                )
            });
            if let Some(idx) = idx {
                remaining_optimistic[idx] = msg.clone();
            } else {
                remaining_optimistic.push(msg.clone());
            }
        }
    }

    let mut out: Vec<Message> = by_id.into_values().collect();
    out.extend(remaining_optimistic);
    out.sort_by(|a, b| {
        let (ta, ia) = sort_key(a);
        let (tb, ib) = sort_key(b);
        ta.cmp(&tb).then(ia.cmp(&ib))
    });
    out
}

/// Upgrade delivery status for matching positive ids (never downgrade).
pub fn apply_delivered(
    messages: &[Message],
    message_ids: &[i64],
    delivered_at: &str,
) -> Vec<Message> {
    let id_set: std::collections::HashSet<i64> = message_ids.iter().copied().collect();
    messages
        .iter()
        .map(|msg| {
            if !id_set.contains(&msg.id) {
                return msg.clone();
            }
            let current = derive_local_status(msg);
            if status_rank(current) >= status_rank(DeliveryStatus::Delivered) {
                return msg.clone();
            }
            let mut next = msg.clone();
            next.delivered_at = Some(delivered_at.to_string());
            next.status = DeliveryStatus::Delivered;
            next
        })
        .collect()
}

/// Mark messages in a sender→receiver pair as read.
pub fn apply_messages_read(
    messages: &[Message],
    sender_id: i64,
    receiver_id: i64,
    read_at: &str,
) -> Vec<Message> {
    messages
        .iter()
        .map(|msg| {
            if msg.sender_id != sender_id || msg.receiver_id != receiver_id {
                return msg.clone();
            }
            let mut next = msg.clone();
            next.read = true;
            next.read_at = Some(read_at.to_string());
            next.delivered_at = next
                .delivered_at
                .clone()
                .or_else(|| Some(read_at.to_string()));
            next.status = DeliveryStatus::Read;
            next
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn msg(id: i64, content: &str) -> Message {
        Message {
            id,
            sender_id: 1,
            sender_username: "a".into(),
            receiver_id: 2,
            receiver_username: "b".into(),
            content: content.into(),
            created_at: "2026-01-01T00:00:00.000Z".into(),
            read: false,
            status: DeliveryStatus::Sent,
            delivered_at: None,
            read_at: None,
            client_message_id: None,
            deleted_at: None,
            link_preview: None,
            media_url: None,
            media_type: None,
            reply_to_message_id: None,
            reply_to: None,
        }
    }

    #[test]
    fn dedupes_by_positive_id_and_sorts() {
        let existing = vec![
            Message {
                created_at: "2026-01-01T00:00:02.000Z".into(),
                ..msg(2, "b")
            },
            Message {
                created_at: "2026-01-01T00:00:01.000Z".into(),
                ..msg(1, "a")
            },
        ];
        let incoming = vec![
            Message {
                created_at: "2026-01-01T00:00:00.500Z".into(),
                ..msg(3, "c")
            },
            Message {
                created_at: "2026-01-01T00:00:02.000Z".into(),
                status: DeliveryStatus::Delivered,
                content: "b2".into(),
                ..msg(2, "b2")
            },
        ];
        let merged = merge_and_sort_messages(&existing, &incoming);
        assert_eq!(
            merged.iter().map(|m| m.id).collect::<Vec<_>>(),
            vec![3, 1, 2]
        );
        let m2 = merged.iter().find(|m| m.id == 2).unwrap();
        assert_eq!(m2.content, "b2");
        assert_eq!(m2.status, DeliveryStatus::Delivered);
    }

    #[test]
    fn replaces_optimistic_by_client_message_id() {
        let existing = vec![Message {
            id: -100,
            status: DeliveryStatus::Sending,
            client_message_id: Some("cid-1".into()),
            ..msg(-100, "hi")
        }];
        let incoming = vec![Message {
            id: 50,
            status: DeliveryStatus::Delivered,
            client_message_id: Some("cid-1".into()),
            ..msg(50, "hi")
        }];
        let merged = merge_and_sort_messages(&existing, &incoming);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].id, 50);
        assert_eq!(merged[0].status, DeliveryStatus::Delivered);
        assert_eq!(merged[0].client_message_id.as_deref(), Some("cid-1"));
    }

    #[test]
    fn replaces_optimistic_by_sender_and_content() {
        let existing = vec![Message {
            id: -5,
            status: DeliveryStatus::Sending,
            ..msg(-5, "hello")
        }];
        let incoming = vec![msg(99, "hello")];
        let merged = merge_and_sort_messages(&existing, &incoming);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].id, 99);
    }

    #[test]
    fn handles_out_of_order_packets() {
        let merged = merge_and_sort_messages(
            &[Message {
                created_at: "2026-01-01T00:00:10.000Z".into(),
                ..msg(10, "later")
            }],
            &[Message {
                created_at: "2026-01-01T00:00:05.000Z".into(),
                ..msg(5, "earlier")
            }],
        );
        assert_eq!(
            merged.iter().map(|m| m.id).collect::<Vec<_>>(),
            vec![5, 10]
        );
    }

    #[test]
    fn never_downgrades_read_from_stale_rest() {
        let existing = vec![Message {
            status: DeliveryStatus::Read,
            read: true,
            delivered_at: Some("2026-01-01T00:00:01.000Z".into()),
            read_at: Some("2026-01-01T00:00:02.000Z".into()),
            ..msg(1, "hi")
        }];
        let incoming = vec![Message {
            status: DeliveryStatus::Sent,
            read: false,
            delivered_at: None,
            read_at: None,
            ..msg(1, "hi")
        }];
        let merged = merge_and_sort_messages(&existing, &incoming);
        assert_eq!(merged[0].status, DeliveryStatus::Read);
        assert!(merged[0].read);
        assert_eq!(
            merged[0].delivered_at.as_deref(),
            Some("2026-01-01T00:00:01.000Z")
        );
    }

    #[test]
    fn derive_local_status_respects_sending_failed() {
        assert_eq!(
            derive_local_status(&Message {
                status: DeliveryStatus::Sending,
                ..msg(-1, "x")
            }),
            DeliveryStatus::Sending
        );
        assert_eq!(
            derive_local_status(&Message {
                status: DeliveryStatus::Failed,
                ..msg(-1, "x")
            }),
            DeliveryStatus::Failed
        );
    }

    #[test]
    fn apply_delivered_upgrades_without_downgrading_read() {
        let messages = vec![
            msg(1, "a"),
            Message {
                status: DeliveryStatus::Read,
                read: true,
                ..msg(2, "b")
            },
        ];
        let next = apply_delivered(&messages, &[1, 2], "2026-01-01T00:00:01.000Z");
        assert_eq!(next[0].status, DeliveryStatus::Delivered);
        assert_eq!(next[1].status, DeliveryStatus::Read);
    }

    #[test]
    fn apply_messages_read_only_matching_pair() {
        let messages = vec![
            msg(1, "a"),
            Message {
                sender_id: 9,
                receiver_id: 8,
                ..msg(2, "b")
            },
        ];
        let next = apply_messages_read(&messages, 1, 2, "2026-01-01T00:00:03.000Z");
        assert_eq!(next[0].status, DeliveryStatus::Read);
        assert!(next[0].read);
        assert_eq!(next[1].status, DeliveryStatus::Sent);
        assert!(!next[1].read);
    }

    #[test]
    fn merge_preserves_reply_to_when_incoming_omits() {
        let reply = MessageReplyTo {
            id: 9,
            sender_id: 2,
            sender_username: "b".into(),
            content: "previous".into(),
            media_url: None,
            deleted: false,
        };
        let existing = vec![Message {
            id: -1,
            status: DeliveryStatus::Sending,
            client_message_id: Some("c1".into()),
            reply_to_message_id: Some(9),
            reply_to: Some(reply),
            ..msg(-1, "reply")
        }];
        let incoming = vec![Message {
            id: 40,
            client_message_id: Some("c1".into()),
            status: DeliveryStatus::Sent,
            reply_to_message_id: None,
            reply_to: None,
            ..msg(40, "reply")
        }];
        let merged = merge_and_sort_messages(&existing, &incoming);
        assert_eq!(merged[0].reply_to_message_id, Some(9));
        assert_eq!(merged[0].reply_to.as_ref().unwrap().id, 9);
    }

    #[test]
    fn merge_preserves_link_preview_when_incoming_omits() {
        let existing = vec![Message {
            link_preview: Some(json!({"url": "https://example.com"})),
            ..msg(1, "hi")
        }];
        let incoming = vec![Message {
            content: "hi2".into(),
            link_preview: None,
            ..msg(1, "hi2")
        }];
        let merged = merge_and_sort_messages(&existing, &incoming);
        assert_eq!(
            merged[0].link_preview,
            Some(json!({"url": "https://example.com"}))
        );
    }

    #[test]
    fn status_rank_ordering() {
        assert!(status_rank(DeliveryStatus::Sending) < status_rank(DeliveryStatus::Sent));
        assert!(status_rank(DeliveryStatus::Sent) < status_rank(DeliveryStatus::Delivered));
        assert!(status_rank(DeliveryStatus::Delivered) < status_rank(DeliveryStatus::Read));
        assert_eq!(
            status_rank(DeliveryStatus::Sending),
            status_rank(DeliveryStatus::Failed)
        );
    }
}
