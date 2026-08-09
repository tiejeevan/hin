use crate::messages::{parse_created_at_ms, DeliveryStatus};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadLastMessage {
    pub id: i64,
    pub content: String,
    pub sender_id: i64,
    pub created_at: String,
    pub read: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<DeliveryStatus>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThread {
    pub id: i64,
    pub username: String,
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equipped_badges: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_seen_at: Option<String>,
    pub last_message: Option<ThreadLastMessage>,
    pub unread_count: i32,
}

/// Sort threads by lastMessage.createdAt desc; null lastMessage last; username ascending tie-break.
pub fn sort_threads(mut threads: Vec<ChatThread>) -> Vec<ChatThread> {
    threads.sort_by(|a, b| {
        let ta = a
            .last_message
            .as_ref()
            .map(|m| parse_created_at_ms(&m.created_at));
        let tb = b
            .last_message
            .as_ref()
            .map(|m| parse_created_at_ms(&m.created_at));
        match (ta, tb) {
            (Some(a_t), Some(b_t)) => b_t.cmp(&a_t).then_with(|| a.username.cmp(&b.username)),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.username.cmp(&b.username),
        }
    });
    threads
}

/// Sum unread badges across threads.
pub fn sum_unread(threads: &[ChatThread]) -> i32 {
    threads.iter().map(|t| t.unread_count.max(0)).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thread(id: i64, username: &str, created: Option<&str>, unread: i32) -> ChatThread {
        ChatThread {
            id,
            username: username.into(),
            role: "user".into(),
            avatar_url: None,
            equipped_badges: None,
            last_seen_at: None,
            last_message: created.map(|c| ThreadLastMessage {
                id: 1,
                content: "hi".into(),
                sender_id: id,
                created_at: c.into(),
                read: false,
                status: Some(DeliveryStatus::Sent),
            }),
            unread_count: unread,
        }
    }

    #[test]
    fn sorts_by_last_message_desc() {
        let threads = vec![
            thread(1, "a", Some("2026-01-01T00:00:01.000Z"), 0),
            thread(2, "b", Some("2026-01-01T00:00:03.000Z"), 0),
            thread(3, "c", Some("2026-01-01T00:00:02.000Z"), 0),
        ];
        let sorted = sort_threads(threads);
        assert_eq!(
            sorted.iter().map(|t| t.id).collect::<Vec<_>>(),
            vec![2, 3, 1]
        );
    }

    #[test]
    fn null_last_message_last() {
        let threads = vec![
            thread(1, "z", None, 0),
            thread(2, "a", Some("2026-01-01T00:00:01.000Z"), 0),
        ];
        let sorted = sort_threads(threads);
        assert_eq!(sorted[0].id, 2);
        assert_eq!(sorted[1].id, 1);
    }

    #[test]
    fn username_tie_break_ascending() {
        let ts = "2026-01-01T00:00:01.000Z";
        let threads = vec![thread(1, "zoe", Some(ts), 0), thread(2, "amy", Some(ts), 0)];
        let sorted = sort_threads(threads);
        assert_eq!(sorted[0].username, "amy");
        assert_eq!(sorted[1].username, "zoe");
    }

    #[test]
    fn unread_sum() {
        let threads = vec![
            thread(1, "a", None, 2),
            thread(2, "b", None, 3),
            thread(3, "c", None, 0),
        ];
        assert_eq!(sum_unread(&threads), 5);
    }
}
