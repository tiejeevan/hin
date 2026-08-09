use crate::messages::{
    apply_delivered, apply_messages_read, merge_and_sort_messages, DeliveryStatus, Message,
};
use crate::threads::{sort_threads, sum_unread, ChatThread, ThreadLastMessage};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Full chat engine state owned by WASM / pure Rust.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatEngine {
    pub messages: Vec<Message>,
    pub threads: Vec<ChatThread>,
    pub active_recipient_id: Option<i64>,
    pub unread_count: i32,
    /// userId → last typing timestamp (ms); JS clears via ClearTyping.
    pub typing_users: HashMap<String, f64>,
    pub applied_incoming_ids: HashSet<i64>,
    pub replying_to_message_id: Option<i64>,
    pub panel_open: bool,
    pub panel_expanded: bool,
}

/// Diff-style patch returned from `dispatch` for React to apply.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnginePatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<Message>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threads: Option<Vec<ChatThread>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unread: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replying_to: Option<Option<i64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_recipient_id: Option<Option<i64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub panel_open: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub panel_expanded: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub typing_users: Option<HashMap<String, f64>>,
}

/// Engine events (JSON `type` field, PascalCase variant names).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum EngineEvent {
    OpenPanel,
    ClosePanel,
    ToggleExpand,
    SelectRecipient {
        #[serde(rename = "recipientId")]
        recipient_id: i64,
    },
    /// Clear active recipient (back to thread list).
    ClearRecipient,
    IncomingWsMessage {
        message: Message,
        #[serde(rename = "selfUserId")]
        self_user_id: i64,
    },
    IncomingDelivered {
        #[serde(rename = "messageIds")]
        message_ids: Vec<i64>,
        #[serde(rename = "deliveredAt")]
        delivered_at: String,
    },
    IncomingRead {
        #[serde(rename = "senderId")]
        sender_id: i64,
        #[serde(rename = "receiverId")]
        receiver_id: i64,
        #[serde(rename = "readAt")]
        read_at: String,
        #[serde(rename = "selfUserId")]
        self_user_id: i64,
    },
    OptimisticSend {
        message: Message,
    },
    SendFailed {
        #[serde(default, rename = "clientMessageId")]
        client_message_id: Option<String>,
        #[serde(default, rename = "tempId")]
        temp_id: Option<i64>,
    },
    MarkSendingFailed,
    FetchHistoryMerge {
        messages: Vec<Message>,
    },
    SetThreads {
        threads: Vec<ChatThread>,
    },
    TypingEvent {
        #[serde(rename = "userId")]
        user_id: i64,
        #[serde(rename = "isTyping")]
        is_typing: bool,
        #[serde(default)]
        at: Option<f64>,
    },
    ClearTyping {
        #[serde(rename = "userId")]
        user_id: i64,
    },
    SetReplyTo {
        #[serde(rename = "messageId")]
        message_id: i64,
    },
    ClearReplyTo,
    MessageDeleted {
        #[serde(rename = "messageId")]
        message_id: i64,
    },
    OptimisticDelete {
        #[serde(rename = "messageId")]
        message_id: i64,
    },
}

impl ChatEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn snapshot(&self) -> Self {
        self.clone()
    }

    pub fn dispatch(&mut self, event: EngineEvent) -> EnginePatch {
        match event {
            EngineEvent::OpenPanel => {
                self.panel_open = true;
                EnginePatch {
                    panel_open: Some(true),
                    ..Default::default()
                }
            }
            EngineEvent::ClosePanel => {
                self.panel_open = false;
                self.panel_expanded = false;
                self.replying_to_message_id = None;
                EnginePatch {
                    panel_open: Some(false),
                    panel_expanded: Some(false),
                    replying_to: Some(None),
                    ..Default::default()
                }
            }
            EngineEvent::ToggleExpand => {
                self.panel_expanded = !self.panel_expanded;
                EnginePatch {
                    panel_expanded: Some(self.panel_expanded),
                    ..Default::default()
                }
            }
            EngineEvent::SelectRecipient { recipient_id } => {
                self.select_recipient(recipient_id)
            }
            EngineEvent::ClearRecipient => {
                self.active_recipient_id = None;
                self.messages.clear();
                self.replying_to_message_id = None;
                EnginePatch {
                    active_recipient_id: Some(None),
                    messages: Some(vec![]),
                    replying_to: Some(None),
                    ..Default::default()
                }
            }
            EngineEvent::IncomingWsMessage {
                message,
                self_user_id,
            } => self.incoming_ws_message(message, self_user_id),
            EngineEvent::IncomingDelivered {
                message_ids,
                delivered_at,
            } => self.incoming_delivered(&message_ids, &delivered_at),
            EngineEvent::IncomingRead {
                sender_id,
                receiver_id,
                read_at,
                self_user_id,
            } => self.incoming_read(sender_id, receiver_id, &read_at, self_user_id),
            EngineEvent::OptimisticSend { message } => {
                let reply_id = message.reply_to_message_id;
                self.messages = merge_and_sort_messages(&self.messages, &[message]);
                // Successful local send clears reply draft.
                self.replying_to_message_id = None;
                let _ = reply_id;
                EnginePatch {
                    messages: Some(self.messages.clone()),
                    replying_to: Some(None),
                    ..Default::default()
                }
            }
            EngineEvent::SendFailed {
                client_message_id,
                temp_id,
            } => {
                for m in &mut self.messages {
                    let match_cid = matches!(
                        (&m.client_message_id, &client_message_id),
                        (Some(a), Some(b)) if a == b
                    );
                    let match_temp = temp_id.is_some() && Some(m.id) == temp_id;
                    if match_cid || match_temp {
                        m.status = DeliveryStatus::Failed;
                    }
                }
                EnginePatch {
                    messages: Some(self.messages.clone()),
                    ..Default::default()
                }
            }
            EngineEvent::MarkSendingFailed => {
                for m in &mut self.messages {
                    if m.status == DeliveryStatus::Sending {
                        m.status = DeliveryStatus::Failed;
                    }
                }
                EnginePatch {
                    messages: Some(self.messages.clone()),
                    ..Default::default()
                }
            }
            EngineEvent::FetchHistoryMerge { messages } => {
                self.messages = merge_and_sort_messages(&self.messages, &messages);
                EnginePatch {
                    messages: Some(self.messages.clone()),
                    ..Default::default()
                }
            }
            EngineEvent::SetThreads { threads } => {
                self.threads = sort_threads(threads);
                self.unread_count = sum_unread(&self.threads);
                EnginePatch {
                    threads: Some(self.threads.clone()),
                    unread: Some(self.unread_count),
                    ..Default::default()
                }
            }
            EngineEvent::TypingEvent {
                user_id,
                is_typing,
                at,
            } => {
                let key = user_id.to_string();
                if is_typing {
                    self.typing_users
                        .insert(key, at.unwrap_or(0.0));
                } else {
                    self.typing_users.remove(&key);
                }
                EnginePatch {
                    typing_users: Some(self.typing_users.clone()),
                    ..Default::default()
                }
            }
            EngineEvent::ClearTyping { user_id } => {
                self.typing_users.remove(&user_id.to_string());
                EnginePatch {
                    typing_users: Some(self.typing_users.clone()),
                    ..Default::default()
                }
            }
            EngineEvent::SetReplyTo { message_id } => {
                self.replying_to_message_id = Some(message_id);
                EnginePatch {
                    replying_to: Some(Some(message_id)),
                    ..Default::default()
                }
            }
            EngineEvent::ClearReplyTo => {
                self.replying_to_message_id = None;
                EnginePatch {
                    replying_to: Some(None),
                    ..Default::default()
                }
            }
            EngineEvent::MessageDeleted { message_id }
            | EngineEvent::OptimisticDelete { message_id } => {
                self.delete_message(message_id)
            }
        }
    }

    fn select_recipient(&mut self, recipient_id: i64) -> EnginePatch {
        self.active_recipient_id = Some(recipient_id);
        self.replying_to_message_id = None;
        let mut cleared = 0;
        for t in &mut self.threads {
            if t.id == recipient_id {
                cleared = t.unread_count;
                t.unread_count = 0;
            }
        }
        if cleared > 0 {
            self.unread_count = (self.unread_count - cleared).max(0);
        }
        EnginePatch {
            active_recipient_id: Some(Some(recipient_id)),
            threads: Some(self.threads.clone()),
            unread: Some(self.unread_count),
            replying_to: Some(None),
            ..Default::default()
        }
    }

    fn incoming_ws_message(&mut self, msg: Message, self_user_id: i64) -> EnginePatch {
        let partner_id = if msg.sender_id == self_user_id {
            msg.receiver_id
        } else {
            msg.sender_id
        };
        let is_incoming = msg.sender_id != self_user_id;
        let viewing_partner = self.active_recipient_id == Some(partner_id);
        let is_viewing_chat = viewing_partner && self.panel_open;

        let mut patch = EnginePatch::default();

        if viewing_partner {
            self.messages = merge_and_sort_messages(&self.messages, &[msg.clone()]);
            patch.messages = Some(self.messages.clone());
            if is_incoming {
                self.typing_users.remove(&msg.sender_id.to_string());
                patch.typing_users = Some(self.typing_users.clone());
            }
        }

        let last_message = ThreadLastMessage {
            id: msg.id,
            content: if msg.content.trim().is_empty() {
                if msg.media_url.is_some() {
                    "Photo".into()
                } else {
                    String::new()
                }
            } else {
                msg.content.clone()
            },
            created_at: msg.created_at.clone(),
            sender_id: msg.sender_id,
            read: if is_incoming && !is_viewing_chat {
                false
            } else {
                msg.read
            },
            status: Some(msg.status),
        };

        if is_incoming && !is_viewing_chat {
            let already_counted = msg.id > 0 && self.applied_incoming_ids.contains(&msg.id);
            if msg.id > 0 {
                self.applied_incoming_ids.insert(msg.id);
            }
            if already_counted {
                self.update_thread_last_message(partner_id, last_message);
            } else {
                let has_thread = self.threads.iter().any(|t| t.id == partner_id);
                if has_thread {
                    self.unread_count += 1;
                    for t in &mut self.threads {
                        if t.id == partner_id {
                            t.unread_count += 1;
                            t.last_message = Some(last_message.clone());
                        }
                    }
                    patch.unread = Some(self.unread_count);
                } else {
                    // Unknown thread — update last message if present later via SetThreads.
                    self.update_thread_last_message(partner_id, last_message);
                }
            }
        } else {
            self.update_thread_last_message(partner_id, last_message);
        }

        self.threads = sort_threads(std::mem::take(&mut self.threads));
        patch.threads = Some(self.threads.clone());
        patch
    }

    fn update_thread_last_message(&mut self, partner_id: i64, last_message: ThreadLastMessage) {
        for t in &mut self.threads {
            if t.id == partner_id {
                t.last_message = Some(last_message);
                return;
            }
        }
    }

    fn incoming_delivered(&mut self, message_ids: &[i64], delivered_at: &str) -> EnginePatch {
        self.messages = apply_delivered(&self.messages, message_ids, delivered_at);
        let id_set: HashSet<i64> = message_ids.iter().copied().collect();
        for t in &mut self.threads {
            if let Some(ref mut lm) = t.last_message {
                if id_set.contains(&lm.id)
                    && lm.status != Some(DeliveryStatus::Read)
                    && !lm.read
                {
                    lm.status = Some(DeliveryStatus::Delivered);
                }
            }
        }
        EnginePatch {
            messages: Some(self.messages.clone()),
            threads: Some(self.threads.clone()),
            ..Default::default()
        }
    }

    fn incoming_read(
        &mut self,
        sender_id: i64,
        receiver_id: i64,
        read_at: &str,
        self_user_id: i64,
    ) -> EnginePatch {
        let mut patch = EnginePatch::default();
        if self_user_id == sender_id {
            self.messages = apply_messages_read(&self.messages, sender_id, receiver_id, read_at);
            patch.messages = Some(self.messages.clone());
        }
        for t in &mut self.threads {
            if t.id == receiver_id {
                if let Some(ref mut lm) = t.last_message {
                    if lm.sender_id == sender_id {
                        lm.read = true;
                        lm.status = Some(DeliveryStatus::Read);
                    }
                }
            }
        }
        patch.threads = Some(self.threads.clone());
        patch
    }

    fn delete_message(&mut self, message_id: i64) -> EnginePatch {
        self.messages.retain(|m| m.id != message_id);
        let mut cleared_reply = false;
        if self.replying_to_message_id == Some(message_id) {
            self.replying_to_message_id = None;
            cleared_reply = true;
        }
        EnginePatch {
            messages: Some(self.messages.clone()),
            replying_to: if cleared_reply { Some(None) } else { None },
            ..Default::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::messages::MessageReplyTo;

    fn base_msg(id: i64, content: &str) -> Message {
        Message {
            id,
            sender_id: 1,
            sender_username: "me".into(),
            receiver_id: 2,
            receiver_username: "them".into(),
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

    fn thread(id: i64, unread: i32) -> ChatThread {
        ChatThread {
            id,
            username: format!("u{id}"),
            role: "user".into(),
            avatar_url: None,
            equipped_badges: None,
            last_seen_at: None,
            last_message: Some(ThreadLastMessage {
                id: 1,
                content: "x".into(),
                sender_id: id,
                created_at: "2026-01-01T00:00:00.000Z".into(),
                read: false,
                status: Some(DeliveryStatus::Sent),
            }),
            unread_count: unread,
        }
    }

    #[test]
    fn optimistic_send_then_ack_replaces_by_client_message_id() {
        let mut eng = ChatEngine::new();
        eng.panel_open = true;
        eng.active_recipient_id = Some(2);
        let opt = Message {
            id: -1,
            status: DeliveryStatus::Sending,
            client_message_id: Some("c1".into()),
            ..base_msg(-1, "hi")
        };
        eng.dispatch(EngineEvent::OptimisticSend {
            message: opt,
        });
        assert_eq!(eng.messages.len(), 1);
        assert!(eng.replying_to_message_id.is_none());

        let ack = Message {
            id: 50,
            status: DeliveryStatus::Delivered,
            client_message_id: Some("c1".into()),
            ..base_msg(50, "hi")
        };
        eng.dispatch(EngineEvent::IncomingWsMessage {
            message: ack,
            self_user_id: 1,
        });
        assert_eq!(eng.messages.len(), 1);
        assert_eq!(eng.messages[0].id, 50);
    }

    #[test]
    fn duplicate_ws_message_id_ignored_for_unread() {
        let mut eng = ChatEngine::new();
        eng.panel_open = false;
        eng.threads = vec![thread(2, 0)];
        eng.unread_count = 0;
        let msg = Message {
            sender_id: 2,
            receiver_id: 1,
            ..base_msg(10, "yo")
        };
        eng.dispatch(EngineEvent::IncomingWsMessage {
            message: msg.clone(),
            self_user_id: 1,
        });
        assert_eq!(eng.unread_count, 1);
        eng.dispatch(EngineEvent::IncomingWsMessage {
            message: msg,
            self_user_id: 1,
        });
        assert_eq!(eng.unread_count, 1);
    }

    #[test]
    fn select_recipient_clears_unread() {
        let mut eng = ChatEngine::new();
        eng.threads = vec![thread(2, 3), thread(3, 1)];
        eng.unread_count = 4;
        eng.dispatch(EngineEvent::SelectRecipient { recipient_id: 2 });
        assert_eq!(eng.threads.iter().find(|t| t.id == 2).unwrap().unread_count, 0);
        assert_eq!(eng.unread_count, 1);
        assert!(eng.replying_to_message_id.is_none());
    }

    #[test]
    fn set_and_clear_reply_to() {
        let mut eng = ChatEngine::new();
        eng.dispatch(EngineEvent::SetReplyTo { message_id: 9 });
        assert_eq!(eng.replying_to_message_id, Some(9));
        eng.dispatch(EngineEvent::ClearReplyTo);
        assert_eq!(eng.replying_to_message_id, None);
    }

    #[test]
    fn close_panel_clears_reply() {
        let mut eng = ChatEngine::new();
        eng.replying_to_message_id = Some(5);
        eng.panel_open = true;
        eng.dispatch(EngineEvent::ClosePanel);
        assert!(eng.replying_to_message_id.is_none());
        assert!(!eng.panel_open);
    }

    #[test]
    fn message_deleted_removes_and_clears_reply() {
        let mut eng = ChatEngine::new();
        eng.messages = vec![base_msg(1, "a"), base_msg(2, "b")];
        eng.replying_to_message_id = Some(2);
        eng.dispatch(EngineEvent::MessageDeleted { message_id: 2 });
        assert_eq!(eng.messages.len(), 1);
        assert_eq!(eng.messages[0].id, 1);
        assert!(eng.replying_to_message_id.is_none());
    }

    #[test]
    fn optimistic_send_with_reply_attaches_snapshot() {
        let mut eng = ChatEngine::new();
        eng.panel_open = true;
        eng.active_recipient_id = Some(2);
        eng.replying_to_message_id = Some(9);
        let reply = MessageReplyTo {
            id: 9,
            sender_id: 2,
            sender_username: "them".into(),
            content: "prev".into(),
            media_url: None,
            deleted: false,
        };
        let opt = Message {
            id: -3,
            status: DeliveryStatus::Sending,
            client_message_id: Some("r1".into()),
            reply_to_message_id: Some(9),
            reply_to: Some(reply),
            ..base_msg(-3, "answer")
        };
        eng.dispatch(EngineEvent::OptimisticSend { message: opt });
        assert_eq!(eng.messages[0].reply_to_message_id, Some(9));
        assert_eq!(eng.messages[0].reply_to.as_ref().unwrap().content, "prev");
        assert!(eng.replying_to_message_id.is_none());
    }

    #[test]
    fn mark_sending_failed() {
        let mut eng = ChatEngine::new();
        eng.messages = vec![Message {
            status: DeliveryStatus::Sending,
            ..base_msg(-1, "x")
        }];
        eng.dispatch(EngineEvent::MarkSendingFailed);
        assert_eq!(eng.messages[0].status, DeliveryStatus::Failed);
    }

    #[test]
    fn typing_event_and_clear() {
        let mut eng = ChatEngine::new();
        eng.dispatch(EngineEvent::TypingEvent {
            user_id: 2,
            is_typing: true,
            at: Some(1000.0),
        });
        assert!(eng.typing_users.contains_key("2"));
        eng.dispatch(EngineEvent::ClearTyping { user_id: 2 });
        assert!(!eng.typing_users.contains_key("2"));
    }
}
