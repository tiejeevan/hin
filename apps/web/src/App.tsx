import { useState, useEffect, useRef } from 'react';
import { Comment, Message, Notification, User as UserType } from '@hin/types';
import { API_URL, WS_URL } from './config';
import { Toast, AdminData, ActiveTab, ChatRecipient, CommentNode } from './types/ui';
import { AppShell } from './components/layout/AppShell';
import { AppHeader } from './components/layout/AppHeader';
import { ImpersonationBanner } from './components/layout/ImpersonationBanner';
import { AuthForm } from './components/auth/AuthForm';
import { FeedView } from './components/feed/FeedView';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { ProfileView } from './components/profile/ProfileView';
import { MessagesPanel } from './components/messages/MessagesPanel';
import { ToastContainer } from './components/ui/ToastContainer';

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('hin_token'));
  const [currentUser, setCurrentUser] = useState<UserType | null>(() => {
    const saved = localStorage.getItem('hin_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState<UserType[]>([]);
  const [posts, setPosts] = useState<import('@hin/types').Post[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');

  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('hin_admin_token'));
  const [adminUser, setAdminUser] = useState<UserType | null>(() => {
    const saved = localStorage.getItem('hin_admin_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [newPostContent, setNewPostContent] = useState('');
  const [newlyCreatedPostId, setNewlyCreatedPostId] = useState<number | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const [showNewPostForm, setShowNewPostForm] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const [postComments, setPostComments] = useState<Record<number, Comment[]>>({});
  const [newCommentText, setNewCommentText] = useState<Record<number, string>>({});
  const [replyingTo, setReplyingTo] = useState<Record<number, Comment | null>>({});

  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editingPostContent, setEditingPostContent] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');

  const [chatRecipient, setChatRecipient] = useState<ChatRecipient | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [newMsgText, setNewMsgText] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [threads, setThreads] = useState<import('@hin/types').ChatThread[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<number, boolean>>({});
  const typingTimeoutRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastTypingSentRef = useRef<Record<number, number>>({});

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessagesDropdown, setShowMessagesDropdown] = useState(false);
  const [messagesPanelExpanded, setMessagesPanelExpanded] = useState(false);
  const [messageIconPulseAt, setMessageIconPulseAt] = useState(0);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [adminData, setAdminData] = useState<AdminData | null>(null);

  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [profileUser, setProfileUser] = useState<UserType | null>(null);
  const [profilePosts, setProfilePosts] = useState<import('@hin/types').Post[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isProfileEditing, setIsProfileEditing] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef(false);
  const processedNotifIdsRef = useRef<Set<number>>(new Set());
  const showMessagesDropdownRef = useRef(showMessagesDropdown);
  const chatRecipientRef = useRef(chatRecipient);

  useEffect(() => {
    showMessagesDropdownRef.current = showMessagesDropdown;
  }, [showMessagesDropdown]);

  useEffect(() => {
    chatRecipientRef.current = chatRecipient;
  }, [chatRecipient]);

  const getHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const addToast = (content: string, type: Toast['type']) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, content, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const goHome = () => {
    setActiveTab('feed');
    setProfileUserId(null);
    setProfileUser(null);
    setProfilePosts([]);
    setProfileError(null);
    setIsProfileEditing(false);
    setShowNotifications(false);
    setShowMessagesDropdown(false);
    setMessagesPanelExpanded(false);
    setChatRecipient(null);
  };

  const closeMessagesPanel = () => {
    setShowMessagesDropdown(false);
    setMessagesPanelExpanded(false);
    setChatRecipient(null);
  };

  const openChatInPanel = (recipient: ChatRecipient) => {
    setChatRecipient(recipient);
    fetchMessages(recipient.id);
    setThreads(prev =>
      prev.map(t => (t.id === recipient.id ? { ...t, unreadCount: 0 } : t))
    );
  };

  const backToMessagesList = () => {
    setChatRecipient(null);
  };

  const toggleMessagesDropdown = () => {
    setShowMessagesDropdown(prev => {
      const next = !prev;
      if (next) {
        setShowNotifications(false);
        fetchThreads();
      } else {
        setMessagesPanelExpanded(false);
        setChatRecipient(null);
      }
      return next;
    });
  };

  const unreadMessagesCount = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  const fetchProfile = async (userId: number) => {
    if (!token) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const res = await fetch(`${API_URL}/api/users/${userId}`, { headers: getHeaders() });
      if (res.ok) {
        setProfileUser(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setProfileError(data.error || 'Failed to load profile');
        setProfileUser(null);
      }
    } catch {
      setProfileError('Failed to load profile');
      setProfileUser(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchProfilePosts = async (userId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/posts?userId=${userId}`, { headers: getHeaders() });
      if (res.ok) setProfilePosts(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const openProfile = (userId: number) => {
    setProfileUserId(userId);
    setActiveTab('profile');
    setIsProfileEditing(false);
    setShowNotifications(false);
    setShowMessagesDropdown(false);
    setMessagesPanelExpanded(false);
    setChatRecipient(null);
    fetchProfile(userId);
    fetchProfilePosts(userId);
  };

  const handleProfileSaved = (updated: UserType) => {
    setProfileUser(updated);
    setUsers(prev => prev.map(u => (u.id === updated.id ? updated : u)));
    if (currentUser?.id === updated.id) {
      setCurrentUser(updated);
      localStorage.setItem('hin_user', JSON.stringify(updated));
    }
    addToast('Profile updated successfully', 'system');
  };

  const openAdmin = () => {
    setActiveTab('admin');
    setProfileUserId(null);
    setIsProfileEditing(false);
    setShowNotifications(false);
  };

  const fetchUsers = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/users`, { headers: getHeaders() });
      if (res.ok) setUsers(await res.json());
    } catch (e) {
      console.error('Error fetching users:', e);
    }
  };

  const fetchPosts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/posts`, { headers: getHeaders() });
      if (res.ok) setPosts(await res.json());
    } catch (e) {
      console.error('Error fetching posts:', e);
    }
  };

  const fetchComments = async (postId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/comments`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPostComments(prev => ({ ...prev, [postId]: data }));
      }
    } catch (e) {
      console.error('Error fetching comments:', e);
    }
  };

  const fetchNotifications = async () => {
    if (!currentUser || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/notifications`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const filtered = data.filter((n: Notification) => n.type !== 'message');
        setNotifications(filtered);
        setUnreadNotifsCount(filtered.filter((n: Notification) => !n.read).length);
      }
    } catch (e) {
      console.error('Error fetching notifications:', e);
    }
  };

  const fetchMessages = async (otherUserId: number) => {
    if (!currentUser || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/messages/${otherUserId}`, { headers: getHeaders() });
      if (res.ok) setChatMessages(await res.json());
    } catch (e) {
      console.error('Error fetching messages:', e);
    }
  };

  const fetchThreads = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/messages/threads`, { headers: getHeaders() });
      if (res.ok) setThreads(await res.json());
    } catch (e) {
      console.error('Error fetching threads:', e);
    }
  };

  const fetchAdminStats = async () => {
    if (!currentUser || currentUser.role !== 'admin' || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/stats`, { headers: getHeaders() });
      if (res.ok) setAdminData(await res.json());
    } catch (e) {
      console.error('Error fetching admin stats:', e);
    }
  };

  const handleUserTyping = (recipientId: number) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !wsReadyRef.current) return;
    const now = Date.now();
    if (!lastTypingSentRef.current[recipientId] || now - lastTypingSentRef.current[recipientId] > 1000) {
      ws.current.send(JSON.stringify({ type: 'typing', payload: { receiverId: recipientId, isTyping: true } }));
      lastTypingSentRef.current[recipientId] = now;
    }
    if (typingTimeoutRef.current[recipientId]) clearTimeout(typingTimeoutRef.current[recipientId]);
    typingTimeoutRef.current[recipientId] = setTimeout(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'typing', payload: { receiverId: recipientId, isTyping: false } }));
      }
      lastTypingSentRef.current[recipientId] = 0;
    }, 1500);
  };

  useEffect(() => {
    if (token) {
      fetchUsers();
      fetchPosts();
      fetchNotifications();
      fetchThreads();
      if (currentUser?.role === 'admin') fetchAdminStats();
    } else {
      setUsers([]);
      setPosts([]);
      setNotifications([]);
      setThreads([]);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'admin') fetchAdminStats();
  }, [activeTab]);

  const sendActiveChat = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !wsReadyRef.current) return;
    const recipientId =
      chatRecipientRef.current && showMessagesDropdownRef.current
        ? chatRecipientRef.current.id
        : null;
    ws.current.send(JSON.stringify({ type: 'active_chat', payload: { recipientId } }));
  };

  useEffect(() => {
    sendActiveChat();
  }, [chatRecipient, showMessagesDropdown]);

  useEffect(() => {
    if (!currentUser || !token) {
      wsReadyRef.current = false;
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
        ws.current = null;
      }
      return;
    }

    const appendChatMessage = (msg: Message) => {
      setChatMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        const withoutOptimistic = prev.filter(
          m => !(m.id < 0 && m.content === msg.content && m.senderId === msg.senderId)
        );
        return [...withoutOptimistic, msg];
      });
    };

    const connectWS = () => {
      wsReadyRef.current = false;
      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'join', payload: { token } }));
      };

      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          switch (message.type) {
            case 'joined':
              wsReadyRef.current = true;
              sendActiveChat();
              break;
            case 'presence_snapshot': {
              const ids: number[] = message.payload.onlineUserIds || [];
              setOnlineUserIds(new Set(ids));
              break;
            }
            case 'user_online':
              setOnlineUserIds(prev => {
                const next = new Set(prev);
                next.add(message.payload.userId);
                return next;
              });
              break;
            case 'user_offline':
              setOnlineUserIds(prev => {
                const next = new Set(prev);
                next.delete(message.payload.userId);
                return next;
              });
              break;
            case 'message': {
              const msg: Message = message.payload;
              const partnerId = msg.senderId === currentUser!.id ? msg.receiverId : msg.senderId;
              const isIncoming = msg.senderId !== currentUser!.id;
              const viewingPartner = chatRecipientRef.current?.id === partnerId;
              const isViewingChat = viewingPartner && showMessagesDropdownRef.current;

              if (viewingPartner) {
                appendChatMessage(msg);
                if (isIncoming) {
                  fetch(`${API_URL}/api/messages/read/${partnerId}`, {
                    method: 'POST',
                    headers: getHeaders(),
                  });
                }
              }

              if (isIncoming && !isViewingChat) {
                setMessageIconPulseAt(Date.now());
                setThreads(prev => {
                  const idx = prev.findIndex(t => t.id === partnerId);
                  if (idx === -1) return prev;
                  return prev.map(t =>
                    t.id === partnerId
                      ? {
                          ...t,
                          unreadCount: t.unreadCount + 1,
                          lastMessage: {
                            content: msg.content,
                            createdAt: msg.createdAt,
                            senderId: msg.senderId,
                            read: false,
                          },
                        }
                      : t
                  );
                });
              }

              fetchThreads();
              break;
            }
            case 'messages_read': {
              const { senderId, receiverId } = message.payload;
              // Sent to the message sender; receiverId is the chat partner who read them
              if (currentUser!.id === senderId && chatRecipientRef.current?.id === receiverId) {
                setChatMessages(prev =>
                  prev.map(m => (m.senderId === currentUser!.id ? { ...m, read: true } : m))
                );
              }
              setThreads(prev =>
                prev.map(t => {
                  if (t.id !== receiverId || !t.lastMessage || t.lastMessage.senderId !== senderId) return t;
                  return { ...t, lastMessage: { ...t.lastMessage, read: true } };
                })
              );
              break;
            }
            case 'typing':
              setTypingUsers(prev => ({ ...prev, [message.payload.senderId]: message.payload.isTyping }));
              break;
            case 'notification': {
              const notif: Notification = message.payload;
              if (notif.type === 'message') break;
              if (processedNotifIdsRef.current.has(notif.id)) break;
              processedNotifIdsRef.current.add(notif.id);
              setNotifications(prev => (prev.some(n => n.id === notif.id) ? prev : [notif, ...prev]));
              setUnreadNotifsCount(prev => prev + 1);
              if (notif.type === 'like') addToast(notif.content, 'like');
              else if (notif.type === 'comment') addToast(notif.content, 'comment');
              break;
            }
            case 'post_created': {
              const { post } = message.payload;
              setPosts(prev => (prev.some(p => p.id === post.id) ? prev : [post, ...prev]));
              break;
            }
            case 'post_deleted': {
              const { postId } = message.payload;
              setPosts(prev => prev.filter(p => p.id !== postId));
              setExpandedComments(prev => {
                const next = { ...prev };
                delete next[postId];
                return next;
              });
              break;
            }
            case 'post_updated': {
              const { post } = message.payload;
              setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, content: post.content } : p)));
              break;
            }
            case 'like_update': {
              const { postId, likesCount, userId, liked } = message.payload;
              setPosts(prev =>
                prev.map(p =>
                  p.id === postId
                    ? { ...p, likesCount, hasLiked: userId === currentUser!.id ? liked : p.hasLiked }
                    : p
                )
              );
              break;
            }
            case 'comment_created': {
              const { comment } = message.payload;
              setPostComments(prev => {
                const list = prev[comment.postId] || [];
                if (list.some(c => c.id === comment.id)) return prev;
                return { ...prev, [comment.postId]: [comment, ...list] };
              });
              setPosts(prev =>
                prev.map(p => (p.id === comment.postId ? { ...p, commentsCount: p.commentsCount + 1 } : p))
              );
              break;
            }
            case 'comment_deleted': {
              const { commentId, postId } = message.payload;
              setPostComments(prev => ({
                ...prev,
                [postId]: (prev[postId] || []).map(c =>
                  c.id === commentId
                    ? { ...c, deletedAt: new Date().toISOString(), username: 'deleted', content: '[Comment deleted]' }
                    : c
                ),
              }));
              setPosts(prev =>
                prev.map(p => (p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p))
              );
              break;
            }
            case 'comment_updated': {
              const { comment } = message.payload;
              setPostComments(prev => ({
                ...prev,
                [comment.postId]: (prev[comment.postId] || []).map(c => (c.id === comment.id ? comment : c)),
              }));
              break;
            }
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      socket.onclose = () => {
        wsReadyRef.current = false;
        setTimeout(() => {
          if (currentUser && token) connectWS();
        }, 3000);
      };
    };

    connectWS();
    return () => {
      wsReadyRef.current = false;
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }
    };
  }, [currentUser, token]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput) {
      setAuthError('Please fill in all fields');
      return;
    }
    setAuthError(null);
    setIsAuthLoading(true);
    const path = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput.trim(), password: passwordInput }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem('hin_token', data.token);
        localStorage.setItem('hin_user', JSON.stringify(data.user));
        setUsernameInput('');
        setPasswordInput('');
        setAuthError(null);
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch {
      setAuthError('Error connecting to authentication service');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem('hin_token');
    localStorage.removeItem('hin_user');
    localStorage.removeItem('hin_admin_token');
    localStorage.removeItem('hin_admin_user');
    setAdminToken(null);
    setAdminUser(null);
    setChatRecipient(null);
    setChatMessages([]);
    setNotifications([]);
    setUnreadNotifsCount(0);
    setActiveTab('feed');
    processedNotifIdsRef.current.clear();
    setOnlineUserIds(new Set());
    ws.current?.close();
  };

  const handleCreatePost = async (_e: React.FormEvent, mediaUrls: string[]) => {
    if (!currentUser || !newPostContent.trim()) return;
    const res = await fetch(`${API_URL}/api/posts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ content: newPostContent, mediaUrls }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create post');
    }
    const newPost = await res.json();
    setPosts(prev => (prev.some(p => p.id === newPost.id) ? prev : [newPost, ...prev]));
    if (profileUserId === currentUser.id) {
      setProfilePosts(prev => (prev.some(p => p.id === newPost.id) ? prev : [newPost, ...prev]));
      setProfileUser(prev => (prev ? { ...prev, postCount: (prev.postCount || 0) + 1 } : prev));
    }
    setNewPostContent('');
    setShowNewPostForm(false);
    setNewlyCreatedPostId(newPost.id);
    setTimeout(() => setNewlyCreatedPostId(null), 3000);
  };

  const handleSavePostEdit = async (postId: number) => {
    if (!editingPostContent.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ content: editingPostContent }),
      });
      if (res.ok) {
        const updatedPost = await res.json();
        setPosts(prev => prev.map(p => (p.id === postId ? updatedPost : p)));
        setProfilePosts(prev => prev.map(p => (p.id === postId ? updatedPost : p)));
        setEditingPostId(null);
        addToast('Post updated successfully', 'system');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePost = async (postId: number) => {
    if (!currentUser || !confirm('Are you sure you want to delete this post?')) return;
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== postId));
        setProfilePosts(prev => prev.filter(p => p.id !== postId));
        if (profileUser) {
          setProfileUser(prev => prev ? { ...prev, postCount: Math.max(0, (prev.postCount || 1) - 1) } : prev);
        }
        addToast('Post deleted successfully', 'system');
        if (currentUser.role === 'admin') fetchAdminStats();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleLike = async (postId: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/like`, { method: 'POST', headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPosts(prev =>
          prev.map(p => (p.id === postId ? { ...p, hasLiked: data.liked, likesCount: data.likesCount } : p))
        );
        setProfilePosts(prev =>
          prev.map(p => (p.id === postId ? { ...p, hasLiked: data.liked, likesCount: data.likesCount } : p))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleComments = (postId: number) => {
    setExpandedComments(prev => {
      const next = { ...prev, [postId]: !prev[postId] };
      if (next[postId]) fetchComments(postId);
      return next;
    });
  };

  const handleCreateComment = async (postId: number, e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const text = newCommentText[postId] || '';
    if (!text.trim()) return;
    const parent = replyingTo[postId];
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ content: text, parentId: parent ? parent.id : null }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setPostComments(prev => ({ ...prev, [postId]: [newComment, ...(prev[postId] || [])] }));
        setNewCommentText(prev => ({ ...prev, [postId]: '' }));
        setReplyingTo(prev => ({ ...prev, [postId]: null }));
        setPosts(prev =>
          prev.map(p => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCommentEdit = async (postId: number, commentId: number) => {
    if (!editingCommentContent.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ content: editingCommentContent }),
      });
      if (res.ok) {
        const updatedComment = await res.json();
        setPostComments(prev => ({
          ...prev,
          [postId]: (prev[postId] || []).map(c => (c.id === commentId ? updatedComment : c)),
        }));
        setEditingCommentId(null);
        addToast('Comment updated successfully', 'system');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteComment = async (postId: number, commentId: number) => {
    if (!currentUser || !confirm('Are you sure you want to delete this comment?')) return;
    try {
      const res = await fetch(`${API_URL}/api/comments/${commentId}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) {
        setPostComments(prev => ({
          ...prev,
          [postId]: (prev[postId] || []).map(c =>
            c.id === commentId
              ? { ...c, deletedAt: new Date().toISOString(), username: 'deleted', content: '[Comment deleted]' }
              : c
          ),
        }));
        setPosts(prev =>
          prev.map(p => (p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p))
        );
        addToast('Comment deleted', 'system');
        if (currentUser.role === 'admin') fetchAdminStats();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startChat = (user: UserType | ChatRecipient) => {
    const recipient: ChatRecipient = { id: user.id, username: user.username, role: user.role };
    setShowNotifications(false);
    setShowMessagesDropdown(true);
    setMessagesPanelExpanded(false);
    openChatInPanel(recipient);
    fetchThreads();
  };

  const handleSendDM = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !chatRecipient || !newMsgText.trim()) return;
    const content = newMsgText.trim();
    if (ws.current?.readyState === WebSocket.OPEN && wsReadyRef.current) {
      setChatMessages(prev => [
        ...prev,
        {
          id: -Date.now(),
          senderId: currentUser.id,
          senderUsername: currentUser.username,
          receiverId: chatRecipient.id,
          receiverUsername: chatRecipient.username,
          content,
          createdAt: new Date().toISOString(),
          read: false,
        },
      ]);
      ws.current.send(
        JSON.stringify({
          type: 'send_message',
          payload: { receiverId: chatRecipient.id, content },
        })
      );
      if (typingTimeoutRef.current[chatRecipient.id]) clearTimeout(typingTimeoutRef.current[chatRecipient.id]);
      ws.current.send(JSON.stringify({ type: 'typing', payload: { receiverId: chatRecipient.id, isTyping: false } }));
      lastTypingSentRef.current[chatRecipient.id] = 0;
      setNewMsgText('');
    } else {
      alert('Real-time connection is not ready yet. Please wait a moment and try again.');
    }
  };

  const handleMarkNotifRead = async (notifId: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/api/notifications/${notifId}/read`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => (n.id === notifId ? { ...n, read: true } : n)));
        setUnreadNotifsCount(prev => Math.max(0, prev - 1));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationClick = (n: Notification) => {
    handleMarkNotifRead(n.id);
    setShowNotifications(false);
    if (n.type === 'message') {
      const sender = users.find(u => u.id === n.senderId);
      if (sender) startChat(sender);
    } else {
      goHome();
    }
  };

  const handleImpersonateUser = async (userId: number) => {
    if (!currentUser || currentUser.role !== 'admin' || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/impersonate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('hin_admin_token', token);
        localStorage.setItem('hin_admin_user', JSON.stringify(currentUser));
        setAdminToken(token);
        setAdminUser(currentUser);
        localStorage.setItem('hin_token', data.token);
        localStorage.setItem('hin_user', JSON.stringify(data.user));
        setToken(data.token);
        setCurrentUser(data.user);
        goHome();
        addToast(`Now acting as @${data.user.username}`, 'system');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to impersonate');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStopImpersonating = () => {
    const savedToken = localStorage.getItem('hin_admin_token');
    const savedUser = localStorage.getItem('hin_admin_user');
    if (savedToken && savedUser) {
      localStorage.setItem('hin_token', savedToken);
      localStorage.setItem('hin_user', savedUser);
      setToken(savedToken);
      setCurrentUser(JSON.parse(savedUser));
      localStorage.removeItem('hin_admin_token');
      localStorage.removeItem('hin_admin_user');
      setAdminToken(null);
      setAdminUser(null);
      setActiveTab('admin');
      setChatRecipient(null);
      addToast('Returned to Admin session', 'system');
    }
  };

  const handleUpdateUserRole = async (userId: number, currentRole: 'user' | 'admin') => {
    if (!currentUser || currentUser.role !== 'admin' || !token) return;
    const nextRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!confirm(`Are you sure you want to change this user's role to ${nextRole}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ role: nextRole }),
      });
      if (res.ok) {
        addToast('User role updated successfully', 'system');
        fetchAdminStats();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdminDeleteUser = async (userId: number, targetUsername: string) => {
    if (!currentUser || currentUser.role !== 'admin' || !token) return;
    if (!confirm(`WARNING: Are you sure you want to soft-delete @${targetUsername}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) {
        addToast(`Account @${targetUsername} has been soft-deleted`, 'system');
        fetchAdminStats();
        fetchUsers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AppShell
      impersonationBanner={
        adminToken && adminUser && currentUser ? (
          <ImpersonationBanner
            adminUser={adminUser}
            currentUsername={currentUser.username}
            onStopImpersonating={handleStopImpersonating}
          />
        ) : undefined
      }
      header={
        <AppHeader
          currentUser={currentUser}
          showNotifications={showNotifications}
          unreadNotifsCount={unreadNotifsCount}
          notifications={notifications}
          isAdminTab={activeTab === 'admin'}
          onGoHome={goHome}
          onOpenAdmin={currentUser?.role === 'admin' ? openAdmin : undefined}
          onToggleNotifications={() => {
            setShowNotifications(prev => {
              if (!prev) setShowMessagesDropdown(false);
              return !prev;
            });
          }}
          onCloseNotifications={() => setShowNotifications(false)}
          onNotificationClick={handleNotificationClick}
          onOpenProfile={openProfile}
          onLogout={handleLogout}
        />
      }
    >
      <section className="flex-grow flex flex-col min-w-0 min-h-0 bg-bg-primary/40 relative">
        {!currentUser ? (
          <AuthForm
            isRegisterMode={isRegisterMode}
            usernameInput={usernameInput}
            passwordInput={passwordInput}
            authError={authError}
            isAuthLoading={isAuthLoading}
            onSubmit={handleAuthSubmit}
            onUsernameChange={setUsernameInput}
            onPasswordChange={setPasswordInput}
            onToggleMode={() => {
              setIsRegisterMode(!isRegisterMode);
              setAuthError(null);
            }}
          />
        ) : activeTab === 'feed' ? (
          <FeedView
            posts={posts}
            users={users}
            currentUser={currentUser}
            showNewPostForm={showNewPostForm}
            showMessagesDropdown={showMessagesDropdown}
            unreadMessagesCount={unreadMessagesCount}
            messageIconPulseAt={messageIconPulseAt}
            newPostContent={newPostContent}
            token={token!}
            newlyCreatedPostId={newlyCreatedPostId}
            expandedComments={expandedComments}
            postComments={postComments}
            newCommentText={newCommentText}
            replyingTo={replyingTo}
            editingPostId={editingPostId}
            editingPostContent={editingPostContent}
            editingCommentId={editingCommentId}
            editingCommentContent={editingCommentContent}
            onOpenCreatePost={() => {
              setShowMessagesDropdown(false);
              setShowNewPostForm(true);
            }}
            onCloseCreatePost={() => setShowNewPostForm(false)}
            onToggleMessages={toggleMessagesDropdown}
            onNewPostContentChange={setNewPostContent}
            onCreatePost={handleCreatePost}
            onToggleLike={handleToggleLike}
            onToggleComments={toggleComments}
            onDeletePost={handleDeletePost}
            onStartPostEdit={(id, content) => {
              setEditingPostId(id);
              setEditingPostContent(content);
            }}
            onCancelPostEdit={() => setEditingPostId(null)}
            onSavePostEdit={handleSavePostEdit}
            onEditPostContentChange={setEditingPostContent}
            onCreateComment={handleCreateComment}
            onCommentTextChange={(postId, text) => setNewCommentText(prev => ({ ...prev, [postId]: text }))}
            onCancelReply={postId => setReplyingTo(prev => ({ ...prev, [postId]: null }))}
            onViewProfile={openProfile}
            onDeleteComment={handleDeleteComment}
            onStartCommentEdit={(id, content) => {
              setEditingCommentId(id);
              setEditingCommentContent(content);
            }}
            onCancelCommentEdit={() => setEditingCommentId(null)}
            onSaveCommentEdit={handleSaveCommentEdit}
            onEditCommentContentChange={setEditingCommentContent}
            onReply={(postId, comment: CommentNode) => setReplyingTo(prev => ({ ...prev, [postId]: comment }))}
          />
        ) : activeTab === 'profile' && profileUserId && token ? (
          <ProfileView
            profileUser={profileUser}
            profilePosts={profilePosts}
            isLoading={profileLoading}
            loadError={profileError}
            currentUser={currentUser}
            token={token}
            isEditing={isProfileEditing}
            users={users}
            expandedComments={expandedComments}
            postComments={postComments}
            newCommentText={newCommentText}
            replyingTo={replyingTo}
            editingPostId={editingPostId}
            editingPostContent={editingPostContent}
            editingCommentId={editingCommentId}
            editingCommentContent={editingCommentContent}
            onBack={goHome}
            onStartEdit={() => setIsProfileEditing(true)}
            onCancelEdit={() => setIsProfileEditing(false)}
            onProfileSaved={handleProfileSaved}
            onStartChat={startChat}
            onToggleLike={handleToggleLike}
            onToggleComments={toggleComments}
            onDeletePost={handleDeletePost}
            onStartPostEdit={(id, content) => {
              setEditingPostId(id);
              setEditingPostContent(content);
            }}
            onCancelPostEdit={() => setEditingPostId(null)}
            onSavePostEdit={handleSavePostEdit}
            onEditPostContentChange={setEditingPostContent}
            onCreateComment={handleCreateComment}
            onCommentTextChange={(postId, text) => setNewCommentText(prev => ({ ...prev, [postId]: text }))}
            onCancelReply={postId => setReplyingTo(prev => ({ ...prev, [postId]: null }))}
            onDeleteComment={handleDeleteComment}
            onStartCommentEdit={(id, content) => {
              setEditingCommentId(id);
              setEditingCommentContent(content);
            }}
            onCancelCommentEdit={() => setEditingCommentId(null)}
            onSaveCommentEdit={handleSaveCommentEdit}
            onEditCommentContentChange={setEditingCommentContent}
            onReply={(postId, comment: CommentNode) => setReplyingTo(prev => ({ ...prev, [postId]: comment }))}
            onViewProfile={openProfile}
          />
        ) : activeTab === 'admin' ? (
          <AdminDashboard
            adminData={adminData}
            currentUser={currentUser}
            onImpersonateUser={handleImpersonateUser}
            onUpdateUserRole={handleUpdateUserRole}
            onDeleteUser={handleAdminDeleteUser}
          />
        ) : null}

        {currentUser && (
          <MessagesPanel
            isOpen={showMessagesDropdown}
            isExpanded={messagesPanelExpanded}
            onToggleExpand={() => setMessagesPanelExpanded(prev => !prev)}
            threads={threads}
            currentUser={currentUser}
            chatRecipient={chatRecipient}
            chatMessages={chatMessages}
            newMsgText={newMsgText}
            typingUsers={typingUsers}
            onlineUserIds={onlineUserIds}
            chatBottomRef={chatBottomRef}
            onClose={closeMessagesPanel}
            onSelectThread={openChatInPanel}
            onBackToList={backToMessagesList}
            onNewMsgTextChange={setNewMsgText}
            onSendDM={handleSendDM}
            onTyping={handleUserTyping}
          />
        )}

        <ToastContainer toasts={toasts} />
      </section>
    </AppShell>
  );
}
