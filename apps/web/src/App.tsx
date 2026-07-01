import React, { useState, useEffect, useRef } from 'react';
import { 
  Heart, 
  MessageSquare, 
  Send, 
  Users, 
  Bell, 
  Plus, 
  Image as ImageIcon, 
  X, 
  LogOut, 
  MessageCircle, 
  Compass, 
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Trash2,
  Shield,
  Lock
} from 'lucide-react';
import { Post, Comment, Message, Notification, User as UserType } from '@hin/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8787/ws';

interface Toast {
  id: string;
  content: string;
  type: 'like' | 'comment' | 'message' | 'system';
}

interface AdminData {
  stats: {
    users: number;
    posts: number;
    comments: number;
    messages: number;
  };
  users: UserType[];
}

interface CommentNode extends Comment {
  replies: CommentNode[];
}

export default function App() {
  // App States
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('hin_token'));
  const [currentUser, setCurrentUser] = useState<UserType | null>(() => {
    const saved = localStorage.getItem('hin_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState<UserType[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'messages' | 'admin'>('feed');
  
  // Auth Form States
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Feed States
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostMedia, setNewPostMedia] = useState('');
  const [showNewPostForm, setShowNewPostForm] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const [postComments, setPostComments] = useState<Record<number, Comment[]>>({});
  const [newCommentText, setNewCommentText] = useState<Record<number, string>>({});
  const [replyingTo, setReplyingTo] = useState<Record<number, Comment | null>>({});
  
  // Chat States
  const [chatRecipient, setChatRecipient] = useState<UserType | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [newMsgText, setNewMsgText] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [showChatMobile, setShowChatMobile] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Notification States
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Admin Panel States
  const [adminData, setAdminData] = useState<AdminData | null>(null);

  // WebSockets Ref
  const ws = useRef<WebSocket | null>(null);

  // Helper for auth headers
  const getHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // Fetch all users
  const fetchUsers = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/users`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error('Error fetching users:', e);
    }
  };

  // Fetch posts
  const fetchPosts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/posts`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      }
    } catch (e) {
      console.error('Error fetching posts:', e);
    }
  };

  // Fetch comments for a specific post
  const fetchComments = async (postId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setPostComments(prev => ({ ...prev, [postId]: data }));
      }
    } catch (e) {
      console.error('Error fetching comments:', e);
    }
  };

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!currentUser || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/notifications`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        setUnreadNotifsCount(data.filter((n: Notification) => !n.read).length);
      }
    } catch (e) {
      console.error('Error fetching notifications:', e);
    }
  };

  // Fetch direct messages history
  const fetchMessages = async (otherUserId: number) => {
    if (!currentUser || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/messages/${otherUserId}`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data);
      }
    } catch (e) {
      console.error('Error fetching messages:', e);
    }
  };

  // Fetch Admin Stats
  const fetchAdminStats = async () => {
    if (!currentUser || currentUser.role !== 'admin' || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/stats`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setAdminData(data);
      }
    } catch (e) {
      console.error('Error fetching admin stats:', e);
    }
  };

  // Trigger local toast notification
  const addToast = (content: string, type: 'like' | 'comment' | 'message' | 'system') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, content, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Initial load when token change
  useEffect(() => {
    if (token) {
      fetchUsers();
      fetchPosts();
      fetchNotifications();
      if (currentUser?.role === 'admin') {
        fetchAdminStats();
      }
    } else {
      setUsers([]);
      setPosts([]);
      setNotifications([]);
    }
  }, [token]);

  // Fetch admin stats when active tab shifts to admin
  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminStats();
    }
  }, [activeTab]);

  // Update active chat status on the WebSocket server
  useEffect(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const recipientId = activeTab === 'messages' && chatRecipient ? chatRecipient.id : null;
      ws.current.send(JSON.stringify({
        type: 'active_chat',
        payload: { recipientId }
      }));
    }
  }, [chatRecipient, activeTab]);

  // Connect to WebSockets
  useEffect(() => {
    if (!currentUser || !token) {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      return;
    }

    const connectWS = () => {
      console.log('Connecting to WebSocket...');
      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        console.log('WebSocket connected');
        // Join the realtime session with JWT token
        socket.send(JSON.stringify({
          type: 'join',
          payload: { token }
        }));
        
        // Restore active chat if any
        const recipientId = activeTab === 'messages' && chatRecipient ? chatRecipient.id : null;
        socket.send(JSON.stringify({
          type: 'active_chat',
          payload: { recipientId }
        }));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received WebSocket message:', message);

          switch (message.type) {
            case 'online_users':
              setOnlineUserIds(message.payload.userIds);
              break;

            case 'message': {
              const msg: Message = message.payload;
              // Append to active chat screen if relevant
              if (chatRecipient && (msg.senderId === chatRecipient.id || msg.receiverId === chatRecipient.id)) {
                setChatMessages(prev => [...prev, msg]);
              }
              break;
            }

            case 'notification': {
              const notif: Notification = message.payload;
              setNotifications(prev => [notif, ...prev]);
              setUnreadNotifsCount(prev => prev + 1);
              
              if (notif.type === 'like') {
                addToast(notif.content, 'like');
              } else if (notif.type === 'comment') {
                addToast(notif.content, 'comment');
              } else if (notif.type === 'message') {
                addToast(notif.content, 'message');
              }
              break;
            }

            case 'post_created': {
              const { post } = message.payload;
              setPosts(prev => {
                if (prev.some(p => p.id === post.id)) return prev;
                return [post, ...prev];
              });
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

            case 'like_update': {
              const { postId, likesCount, userId, liked } = message.payload;
              setPosts(prev => prev.map(p => {
                if (p.id === postId) {
                  return { 
                    ...p, 
                    likesCount, 
                    hasLiked: userId === currentUser.id ? liked : p.hasLiked 
                  };
                }
                return p;
              }));
              break;
            }

            case 'comment_created': {
              const { comment } = message.payload;
              setPostComments(prev => {
                const currentList = prev[comment.postId] || [];
                if (currentList.some(c => c.id === comment.id)) return prev;
                return {
                  ...prev,
                  [comment.postId]: [comment, ...currentList]
                };
              });
              setPosts(prev => prev.map(p => {
                if (p.id === comment.postId) {
                  return { ...p, commentsCount: p.commentsCount + 1 };
                }
                return p;
              }));
              break;
            }

            case 'comment_deleted': {
              const { commentId, postId } = message.payload;
              setPostComments(prev => {
                const currentList = prev[postId] || [];
                return {
                  ...prev,
                  [postId]: currentList.map(c => 
                    c.id === commentId 
                      ? { ...c, deletedAt: new Date().toISOString(), username: 'deleted', content: '[Comment deleted]' } 
                      : c
                  )
                };
              });
              setPosts(prev => prev.map(p => {
                if (p.id === postId) {
                  return { ...p, commentsCount: Math.max(0, p.commentsCount - 1) };
                }
                return p;
              }));
              break;
            }
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      socket.onclose = (e) => {
        console.log('WebSocket closed, reconnecting in 3s...', e.reason);
        setTimeout(() => {
          if (currentUser && token) connectWS();
        }, 3000);
      };

      socket.onerror = (e) => {
        console.error('WebSocket error:', e);
      };
    };

    connectWS();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [currentUser, token, chatRecipient]);

  // Scroll to bottom of chat when messages update
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Handle Login & Registration
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
        body: JSON.stringify({
          username: usernameInput.trim(),
          password: passwordInput
        })
      });

      const data = await res.json();

      if (res.ok) {
        setToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem('hin_token', data.token);
        localStorage.setItem('hin_user', JSON.stringify(data.user));
        
        // Reset form
        setUsernameInput('');
        setPasswordInput('');
        setAuthError(null);
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (e) {
      console.error(e);
      setAuthError('Error connecting to authentication service');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem('hin_token');
    localStorage.removeItem('hin_user');
    setChatRecipient(null);
    setChatMessages([]);
    setNotifications([]);
    setUnreadNotifsCount(0);
    setActiveTab('feed');
    setShowChatMobile(false);
    if (ws.current) {
      ws.current.close();
    }
  };

  // Create / Publish Post
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newPostContent.trim()) return;

    try {
      const res = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          content: newPostContent,
          mediaUrl: newPostMedia || null
        })
      });

      if (res.ok) {
        const newPost = await res.json();
        setPosts(prev => [newPost, ...prev]);
        setNewPostContent('');
        setNewPostMedia('');
        setShowNewPostForm(false);
        addToast('Post published successfully!', 'system');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete Post (Owner or Admin)
  const handleDeletePost = async (postId: number) => {
    if (!currentUser) return;
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== postId));
        addToast('Post deleted successfully', 'system');
        if (currentUser.role === 'admin') {
          fetchAdminStats();
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle Like
  const handleToggleLike = async (postId: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/like`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(prev => prev.map(p => {
          if (p.id === postId) {
            return { ...p, hasLiked: data.liked, likesCount: data.likesCount };
          }
          return p;
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle comments expand
  const toggleComments = (postId: number) => {
    setExpandedComments(prev => {
      const next = { ...prev, [postId]: !prev[postId] };
      if (next[postId]) {
        fetchComments(postId);
      }
      return next;
    });
  };

  // Create Comment or Reply
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
        body: JSON.stringify({ 
          content: text,
          parentId: parent ? parent.id : null
        })
      });

      if (res.ok) {
        const newComment = await res.json();
        setPostComments(prev => ({
          ...prev,
          [postId]: [newComment, ...(prev[postId] || [])]
        }));
        setNewCommentText(prev => ({ ...prev, [postId]: '' }));
        setReplyingTo(prev => ({ ...prev, [postId]: null }));
        setPosts(prev => prev.map(p => {
          if (p.id === postId) {
            return { ...p, commentsCount: p.commentsCount + 1 };
          }
          return p;
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete Comment (Owner or Admin)
  const handleDeleteComment = async (postId: number, commentId: number) => {
    if (!currentUser) return;
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        setPostComments(prev => ({
          ...prev,
          [postId]: (prev[postId] || []).map(c => 
            c.id === commentId 
              ? { ...c, deletedAt: new Date().toISOString(), username: 'deleted', content: '[Comment deleted]' } 
              : c
          )
        }));
        setPosts(prev => prev.map(p => {
          if (p.id === postId) {
            return { ...p, commentsCount: Math.max(0, p.commentsCount - 1) };
          }
          return p;
        }));
        addToast('Comment deleted', 'system');
        if (currentUser.role === 'admin') {
          fetchAdminStats();
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Select User for Chat
  const startChat = (recipient: UserType) => {
    setChatRecipient(recipient);
    setActiveTab('messages');
    setShowChatMobile(true);
    fetchMessages(recipient.id);
  };

  // Send Direct Message via WS
  const handleSendDM = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !chatRecipient || !newMsgText.trim()) return;

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'send_message',
        payload: {
          receiverId: chatRecipient.id,
          content: newMsgText.trim()
        }
      }));
      setNewMsgText('');
    } else {
      alert('WebSocket is currently disconnected. Reconnecting...');
    }
  };

  // Mark Notification as read
  const handleMarkNotifRead = async (notifId: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/api/notifications/${notifId}/read`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
        setUnreadNotifsCount(prev => Math.max(0, prev - 1));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Constructs a nested tree of CommentNodes from a flat comments list
  const buildCommentTree = (flatComments: Comment[]): CommentNode[] => {
    const map: Record<number, CommentNode> = {};
    const roots: CommentNode[] = [];

    // Map all flat comments to node structures
    flatComments.forEach(comment => {
      map[comment.id] = { ...comment, replies: [] };
    });

    // Nest under parents
    flatComments.forEach(comment => {
      const node = map[comment.id];
      if (comment.parentId) {
        const parent = map[comment.parentId];
        if (parent) {
          parent.replies.push(node);
        } else {
          // If parent is missing, treat as root node
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    // Recursively prune deleted nodes that have no active children
    const pruneTree = (nodes: CommentNode[]): CommentNode[] => {
      return nodes.filter(node => {
        node.replies = pruneTree(node.replies);
        const isDeleted = !!node.deletedAt || node.username === 'deleted';
        return !isDeleted || node.replies.length > 0;
      });
    };

    return pruneTree(roots);
  };

  // Recursive Comment Rendering Component
  const CommentItem = ({ 
    comment, 
    depth = 0, 
    postId 
  }: { 
    comment: CommentNode; 
    depth: number; 
    postId: number;
  }) => {
    const isDeleted = !!comment.deletedAt || comment.username === 'deleted';
    
    return (
      <div 
        className="space-y-2 text-left" 
        style={{ marginLeft: depth > 0 ? `${Math.min(depth * 14, 56)}px` : '0px' }}
      >
        <div className={`flex gap-2.5 text-xs border-b border-slate-900 pb-2.5 relative group ${
          depth > 0 ? 'border-l border-slate-800/40 pl-3.5' : ''
        }`}>
          
          {/* Delete Action (Owner or Admin) */}
          {!isDeleted && currentUser && (currentUser.role === 'admin' || currentUser.id === comment.userId) && (
            <button
              onClick={() => handleDeleteComment(postId, comment.id)}
              className="absolute right-0 top-0.5 text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-1"
              title="Delete Comment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] uppercase text-slate-400 shrink-0 border border-slate-700">
            {isDeleted ? '?' : comment.username[0]}
          </div>
          
          <div className="flex-grow min-w-0 text-left pr-6">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`font-semibold ${isDeleted ? 'text-slate-500 font-mono' : 'text-slate-200'}`}>
                {isDeleted ? '[deleted]' : `@${comment.username}`}
              </span>
              <span className="text-[9px] text-slate-500">
                {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            
            <p className={`${isDeleted ? 'text-slate-500 italic mt-1' : 'text-slate-300'} text-xs mt-0.5 leading-relaxed break-words`}>
              {comment.content}
            </p>
            
            {/* Reply toggle */}
            {!isDeleted && currentUser && (
              <button
                onClick={() => setReplyingTo(prev => ({ ...prev, [postId]: comment }))}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold mt-1 transition-colors cursor-pointer block"
              >
                Reply
              </button>
            )}
          </div>
        </div>
        
        {/* Render child comments recursively */}
        {comment.replies && comment.replies.map(reply => (
          <CommentItem 
            key={reply.id} 
            comment={reply} 
            depth={depth + 1} 
            postId={postId}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans select-none text-slate-100">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
            Hin
          </span>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono font-medium">
            Secure
          </span>
        </div>

        {currentUser && (
          <div className="flex items-center gap-4">
            {/* Notification Bell (Hidden on mobile bottom nav) */}
            <div className="relative hidden md:block">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  showNotifications 
                    ? 'bg-slate-800 border-slate-700 text-indigo-400' 
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Bell className="h-5 w-5" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center animate-pulse-ring">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>

              {/* Desktop Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 py-2 divide-y divide-slate-800/50">
                  <div className="px-4 py-2 flex items-center justify-between bg-slate-950/40">
                    <span className="text-xs font-semibold text-slate-400">Notifications</span>
                    {unreadNotifsCount > 0 && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                        {unreadNotifsCount} Unread
                      </span>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-500">
                      No notifications yet.
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div 
                        key={n.id} 
                        onClick={() => {
                          handleMarkNotifRead(n.id);
                          if (n.type === 'message') {
                            const sender = users.find(u => u.id === n.senderId);
                            if (sender) startChat(sender);
                          } else {
                            setActiveTab('feed');
                          }
                          setShowNotifications(false);
                        }}
                        className={`px-4 py-3 flex gap-2 cursor-pointer transition-colors ${
                          n.read ? 'hover:bg-slate-800/50' : 'bg-indigo-950/15 hover:bg-indigo-950/25'
                        }`}
                      >
                        <div className="mt-0.5">
                          {n.type === 'like' && <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />}
                          {n.type === 'comment' && <MessageSquare className="h-4 w-4 text-indigo-400" />}
                          {n.type === 'message' && <MessageCircle className="h-4 w-4 text-emerald-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs ${n.read ? 'text-slate-300' : 'text-white font-medium'} text-left`}>
                            {n.content}
                          </p>
                          <span className="text-[10px] text-slate-500 mt-1 block text-left">
                            {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {!n.read && (
                          <div className="h-2 w-2 rounded-full bg-indigo-500 self-center" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Profile badge / Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-850">
              <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-slate-300 font-semibold uppercase text-sm select-none">
                {currentUser.username[0]}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                  @{currentUser.username}
                  {currentUser.role === 'admin' && (
                    <span title="Admin User">
                      <Shield className="h-3 w-3 text-amber-500 fill-amber-500/20" />
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-slate-500 capitalize">{currentUser.role} Account</span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-450 hover:bg-slate-800/50 transition-colors ml-1 cursor-pointer"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-6xl w-full mx-auto flex overflow-hidden">
        
        {/* Left Sidebar - Navigation / Users (Desktop Only) */}
        {currentUser ? (
          <aside className="w-80 border-r border-slate-900/60 hidden md:flex flex-col p-4 gap-4 shrink-0 bg-slate-950">
            {/* Navigation Tabs */}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => {
                  setActiveTab('feed');
                  setShowNotifications(false);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'feed' && !showNotifications
                    ? 'bg-indigo-600 text-white font-medium shadow-lg shadow-indigo-600/20' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Compass className="h-5 w-5" />
                <span>Explore Feed</span>
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('messages');
                  setShowNotifications(false);
                  if (chatRecipient) {
                    setShowChatMobile(true);
                  } else if (users.length > 0) {
                    const firstOther = users.find(u => u.id !== currentUser.id);
                    if (firstOther) startChat(firstOther);
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'messages' && !showNotifications
                    ? 'bg-indigo-600 text-white font-medium shadow-lg shadow-indigo-600/20' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <MessageSquare className="h-5 w-5" />
                <span>Direct Messages</span>
              </button>

              {/* Admin Panel Link (Only visible to Admins) */}
              {currentUser.role === 'admin' && (
                <button
                  onClick={() => {
                    setActiveTab('admin');
                    setShowNotifications(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'admin' && !showNotifications
                      ? 'bg-amber-600 text-white font-medium shadow-lg shadow-amber-600/20' 
                      : 'text-amber-500/80 hover:text-amber-400 hover:bg-slate-900'
                  }`}
                >
                  <Shield className="h-5 w-5" />
                  <span>Admin Dashboard</span>
                </button>
              )}
            </div>

            {/* Online Members List */}
            <div className="flex-grow flex flex-col min-h-0 bg-slate-900/20 rounded-2xl border border-slate-900/60 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 px-2 pb-3 border-b border-slate-900/80">
                <Users className="h-4 w-4" />
                <span>Active Users ({users.length})</span>
              </div>
              <div className="flex-grow overflow-y-auto mt-2 space-y-1">
                {users.map(u => {
                  const isSelf = u.id === currentUser.id;
                  const isOnline = onlineUserIds.includes(u.id);
                  return (
                    <div 
                      key={u.id}
                      onClick={() => !isSelf && startChat(u)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl transition-colors text-left ${
                        isSelf 
                          ? 'bg-slate-900/10 opacity-70 cursor-default' 
                          : 'cursor-pointer hover:bg-slate-900/60'
                      } ${chatRecipient?.id === u.id && activeTab === 'messages' ? 'bg-slate-900' : ''}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative">
                          <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs uppercase text-slate-300">
                            {u.username[0]}
                          </div>
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-slate-950" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate flex items-center gap-1">
                            @{u.username} 
                            {isSelf && <span className="text-[10px] text-slate-500 font-normal">(you)</span>}
                            {u.role === 'admin' && <Shield className="h-3 w-3 text-amber-500" />}
                          </p>
                          <p className="text-[9px] text-slate-500">
                            {isOnline ? 'Online' : 'Offline'}
                          </p>
                        </div>
                      </div>
                      {!isSelf && (
                        <ChevronRight className="h-3 w-3 text-slate-600" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        ) : null}

        {/* Workspace Content Area */}
        <section className="flex-grow flex flex-col min-w-0 bg-slate-950/40 relative">
          {!currentUser ? (
            /* Secure Register & Login Form */
            <div className="flex-grow flex flex-col items-center justify-center p-4 bg-radial from-indigo-900/10 via-transparent to-transparent">
              <div className="max-w-md w-full bg-slate-900 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                
                <div className="text-center mb-6">
                  <div className="inline-flex h-14 w-14 rounded-2xl bg-indigo-600/10 text-indigo-400 items-center justify-center mb-3">
                    <Lock className="h-8 w-8" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">
                    {isRegisterMode ? 'Create Account' : 'Welcome Back'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-2">
                    {isRegisterMode 
                      ? 'Register a secure username and password' 
                      : 'Sign in to access secure real-time messaging'}
                  </p>
                </div>

                {authError && (
                  <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-450 text-xs px-3.5 py-2.5 rounded-xl text-left">
                    {authError}
                  </div>
                )}

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter username"
                      value={usernameInput}
                      onChange={e => setUsernameInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={passwordInput}
                      onChange={e => setPasswordInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold text-sm py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isAuthLoading ? 'Please wait...' : isRegisterMode ? 'Register Account' : 'Sign In'}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <button
                    onClick={() => {
                      setIsRegisterMode(!isRegisterMode);
                      setAuthError(null);
                    }}
                    className="text-xs text-indigo-400 hover:underline cursor-pointer"
                  >
                    {isRegisterMode 
                      ? 'Already have an account? Sign in' 
                      : "Don't have an account? Register"}
                  </button>
                </div>

              </div>
            </div>
          ) : activeTab === 'feed' && !showNotifications ? (
            /* SOCIAL FEED VIEW */
            <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-6">
              
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                    <Compass className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xs font-bold text-white">Explore Feed</h4>
                    <p className="text-[10px] text-slate-400">Share your thoughts and connect with other users in real time.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowNewPostForm(true)} 
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition-all shadow-md shadow-indigo-600/15 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Create Post
                </button>
              </div>

              {/* Create Post Form */}
              {showNewPostForm && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                    <span className="text-xs font-bold text-slate-350">Create New Post</span>
                    <button onClick={() => setShowNewPostForm(false)} className="text-slate-400 hover:text-white cursor-pointer p-1">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <form onSubmit={handleCreatePost} className="space-y-3">
                    <textarea
                      required
                      rows={3}
                      placeholder="What is on your mind?"
                      value={newPostContent}
                      onChange={e => setNewPostContent(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-slate-550" />
                      <input
                        type="text"
                        placeholder="Image URL (optional)"
                        value={newPostMedia}
                        onChange={e => setNewPostMedia(e.target.value)}
                        className="flex-grow bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowNewPostForm(false)}
                        className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md shadow-indigo-600/15 cursor-pointer"
                      >
                        Publish Post
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Posts List */}
              <div className="space-y-4">
                {posts.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-sm">
                    No posts on the feed yet. Be the first to publish!
                  </div>
                ) : (
                  posts.map(post => {
                    const commentsList = postComments[post.id] || [];
                    const nestedComments = buildCommentTree(commentsList);
                    const isCommentsExpanded = expandedComments[post.id] || false;

                    return (
                      <article key={post.id} className="bg-slate-900 border border-slate-900/60 rounded-2xl p-4 space-y-4 shadow-sm hover:border-slate-800/50 transition-colors relative">
                        
                        {/* Delete Action (Owner or Admin) */}
                        {currentUser && (currentUser.role === 'admin' || currentUser.id === post.userId) && (
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="absolute top-4 right-4 p-1.5 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 text-rose-550 rounded-lg transition-colors cursor-pointer"
                            title="Delete Post"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}

                        {/* Post Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs uppercase text-slate-300">
                              {post.username[0]}
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-bold text-slate-200 flex items-center gap-1">
                                @{post.username}
                                {users.find(u => u.id === post.userId)?.role === 'admin' && (
                                  <Shield className="h-3 w-3 text-amber-500" />
                                )}
                              </p>
                              <span className="text-[9px] text-slate-500">
                                {new Date(post.createdAt).toLocaleDateString()} {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>

                          {/* Quick Message Button for Post Author */}
                          {currentUser && post.userId !== currentUser.id && (
                            <button
                              onClick={() => {
                                const authorUser = users.find(u => u.id === post.userId);
                                if (authorUser) startChat(authorUser);
                              }}
                              className="text-slate-550 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-800/45 transition-all mr-8 cursor-pointer"
                              title={`Chat with @${post.username}`}
                            >
                              <MessageCircle className="h-4.5 w-4.5" />
                            </button>
                          )}
                        </div>

                        {/* Post Content */}
                        <div className="space-y-3">
                          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line text-left">
                            {post.content}
                          </p>
                          {post.mediaUrl && (
                            <div className="rounded-xl overflow-hidden border border-slate-800/50 bg-slate-950 max-h-80 flex items-center justify-center">
                              <img 
                                src={post.mediaUrl} 
                                alt="Post attachment" 
                                className="max-w-full max-h-80 object-contain"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Post Actions (Likes & Comments buttons) */}
                        <div className="flex items-center gap-6 border-t border-slate-800/40 pt-3">
                          {/* Like Button */}
                          <button 
                            onClick={() => handleToggleLike(post.id)}
                            className={`flex items-center gap-1.5 text-xs transition-colors py-1 cursor-pointer ${
                              post.hasLiked 
                                ? 'text-rose-500 font-semibold' 
                                : 'text-slate-400 hover:text-rose-450'
                            }`}
                          >
                            <Heart className={`h-4.5 w-4.5 ${post.hasLiked ? 'fill-rose-500' : ''}`} />
                            <span>{post.likesCount}</span>
                          </button>

                          {/* Comments Button */}
                          <button 
                            onClick={() => toggleComments(post.id)}
                            className={`flex items-center gap-1.5 text-xs transition-colors py-1 cursor-pointer ${
                              isCommentsExpanded 
                                ? 'text-indigo-400 font-semibold' 
                                : 'text-slate-400 hover:text-indigo-400'
                            }`}
                          >
                            <MessageSquare className="h-4.5 w-4.5" />
                            <span>{post.commentsCount}</span>
                          </button>
                        </div>

                        {/* Expandable Comments Drawer */}
                        {isCommentsExpanded && (
                          <div className="border-t border-slate-850 pt-4 mt-3 space-y-4 bg-slate-950/20 p-3 rounded-xl border border-slate-900/60">
                            
                            {/* Replying indicator */}
                            {replyingTo[post.id] && (
                              <div className="flex items-center justify-between bg-indigo-950/20 border border-indigo-900/30 rounded-xl px-3 py-1.5 text-[11px] text-indigo-300">
                                <span>Replying to <strong>@{replyingTo[post.id]?.username}</strong></span>
                                <button 
                                  onClick={() => setReplyingTo(prev => ({ ...prev, [post.id]: null }))}
                                  className="text-slate-500 hover:text-white p-0.5 cursor-pointer"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            )}

                            {/* Comment Input Form */}
                            <form onSubmit={(e) => handleCreateComment(post.id, e)} className="flex items-center gap-2">
                              <input
                                type="text"
                                required
                                placeholder={replyingTo[post.id] ? `Write a reply...` : "Write a comment..."}
                                value={newCommentText[post.id] || ''}
                                onChange={e => setNewCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                                className="flex-grow bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                              />
                              <button 
                                type="submit"
                                className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl transition-colors shrink-0 cursor-pointer"
                              >
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            </form>

                            {/* Comment Thread List (Rendered Hierarchically) */}
                            <div className="space-y-3.5 max-h-80 overflow-y-auto pr-1">
                              {nestedComments.length === 0 ? (
                                <p className="text-[11px] text-slate-500 text-center py-2">
                                  No comments yet.
                                </p>
                              ) : (
                                nestedComments.map(comment => (
                                  <CommentItem 
                                    key={comment.id} 
                                    comment={comment} 
                                    depth={0} 
                                    postId={post.id} 
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          ) : activeTab === 'messages' && !showNotifications ? (
            /* DIRECT MESSAGES VIEW */
            <div className="flex-grow flex flex-col md:flex-row overflow-hidden h-[calc(100vh-65px)]">
              {/* User Selection column (Hidden on mobile when chat open) */}
              <div className={`w-full md:w-64 border-r border-slate-900/60 flex flex-col shrink-0 md:bg-slate-950/20 ${
                chatRecipient && showChatMobile ? 'hidden md:flex' : 'flex'
              }`}>
                <div className="p-3 border-b border-slate-900 bg-slate-950/50">
                  <h3 className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4 text-indigo-400" />
                    Chat Threads
                  </h3>
                </div>
                <div className="flex-grow overflow-y-auto p-2 space-y-1">
                  {users
                    .filter(u => u.id !== currentUser.id)
                    .map(u => {
                      const isOnline = onlineUserIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => startChat(u)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left cursor-pointer ${
                            chatRecipient?.id === u.id 
                              ? 'bg-slate-900 text-white border border-slate-800' 
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs uppercase text-slate-300">
                              {u.username[0]}
                            </div>
                            {isOnline && (
                              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-slate-950" />
                            )}
                          </div>
                          <div className="min-w-0 flex-grow">
                            <p className="text-xs font-semibold truncate flex items-center gap-1">
                              @{u.username}
                              {u.role === 'admin' && <Shield className="h-3.5 w-3.5 text-amber-500" />}
                            </p>
                            <p className="text-[9px] text-slate-500">
                              {isOnline ? 'Online' : 'Offline'}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Chat Conversation Column (Hidden on mobile when threads list is active) */}
              <div className={`flex-grow flex flex-col min-w-0 bg-slate-900/10 ${
                !chatRecipient || !showChatMobile ? 'hidden md:flex' : 'flex'
              }`}>
                {chatRecipient ? (
                  <>
                    {/* Chat Header */}
                    <div className="p-4 border-b border-slate-900/60 bg-slate-950/60 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2.5">
                        {/* Mobile Back Button */}
                        <button 
                          onClick={() => {
                            setShowChatMobile(false);
                            setChatRecipient(null); // Deselect so they can click other chats
                          }}
                          className="p-1 text-slate-400 hover:text-white md:hidden mr-1 cursor-pointer"
                          title="Back to threads"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>

                        <div className="relative shrink-0">
                          <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs uppercase text-indigo-400">
                            {chatRecipient.username[0]}
                          </div>
                          {onlineUserIds.includes(chatRecipient.id) && (
                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-slate-950" />
                          )}
                        </div>
                        <div className="text-left">
                          <h4 className="text-xs font-bold text-slate-200">@{chatRecipient.username}</h4>
                          <p className="text-[9px] text-slate-500">
                            {onlineUserIds.includes(chatRecipient.id) ? 'Online now' : 'Offline'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Messages Body */}
                    <div className="flex-grow overflow-y-auto p-4 space-y-3">
                      {chatMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-1.5 py-12">
                          <MessageCircle className="h-8 w-8 text-slate-700" />
                          <span>No messages in this chat. Start typing below!</span>
                        </div>
                      ) : (
                        chatMessages.map(msg => {
                          const isMe = msg.senderId === currentUser.id;
                          return (
                            <div 
                              key={msg.id} 
                              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                            >
                              <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                                isMe 
                                  ? 'bg-indigo-600 text-white rounded-br-none text-right' 
                                  : 'bg-slate-900 text-slate-100 rounded-bl-none text-left border border-slate-800'
                              }`}>
                                <p className="leading-relaxed break-words">{msg.content}</p>
                                <span className={`text-[8px] mt-1 block ${isMe ? 'text-indigo-200' : 'text-slate-500'}`}>
                                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={chatBottomRef} />
                    </div>

                    {/* Chat Input */}
                    <form onSubmit={handleSendDM} className="p-3 bg-slate-950/60 border-t border-slate-900/60 flex items-center gap-2 shrink-0">
                      <input
                        type="text"
                        required
                        placeholder={`Message @${chatRecipient.username}...`}
                        value={newMsgText}
                        onChange={e => setNewMsgText(e.target.value)}
                        className="flex-grow bg-slate-900 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                      <button 
                        type="submit"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl transition-colors shadow-lg shadow-indigo-600/10 shrink-0 cursor-pointer"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="flex-grow flex flex-col items-center justify-center p-6 text-slate-500 text-sm gap-2">
                    <MessageSquare className="h-10 w-10 text-slate-700" />
                    <span>Select a user from the sidebar thread list to begin chatting.</span>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'admin' && !showNotifications ? (
            /* ADMIN DASHBOARD VIEW */
            <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-6">
              
              <div className="flex items-center gap-3 border-b border-slate-850 pb-4">
                <div className="h-10 w-10 bg-amber-600/10 border border-amber-600/20 text-amber-500 flex items-center justify-center rounded-xl">
                  <Shield className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <h2 className="text-lg font-bold text-white">Admin Dashboard</h2>
                  <p className="text-xs text-slate-400">Moderator metrics and platform user administration</p>
                </div>
              </div>

              {adminData ? (
                <>
                  {/* Stats Cards Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-left shadow-sm">
                      <p className="text-xs text-slate-550 font-semibold uppercase">Total Users</p>
                      <p className="text-2xl font-bold text-white mt-1.5">{adminData.stats.users}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-left shadow-sm">
                      <p className="text-xs text-slate-550 font-semibold uppercase">Total Posts</p>
                      <p className="text-2xl font-bold text-indigo-400 mt-1.5">{adminData.stats.posts}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-left shadow-sm">
                      <p className="text-xs text-slate-550 font-semibold uppercase">Comments</p>
                      <p className="text-2xl font-bold text-emerald-400 mt-1.5">{adminData.stats.comments}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-left shadow-sm">
                      <p className="text-xs text-slate-550 font-semibold uppercase">DMs Sent</p>
                      <p className="text-2xl font-bold text-violet-400 mt-1.5">{adminData.stats.messages}</p>
                    </div>
                  </div>

                  {/* Users Admin Table */}
                  <div className="bg-slate-900 border border-slate-900/60 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-850 bg-slate-950/20 text-left">
                      <h3 className="text-xs font-bold text-slate-350 flex items-center gap-1.5">
                        <Users className="h-4.5 w-4.5 text-indigo-400" />
                        Registered Accounts
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left text-slate-300">
                        <thead className="bg-slate-950/30 text-slate-500 border-b border-slate-900">
                          <tr>
                            <th className="p-3">User ID</th>
                            <th className="p-3">Username</th>
                            <th className="p-3">Role</th>
                            <th className="p-3">Created Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {adminData.users.map(u => (
                            <tr key={u.id} className="hover:bg-slate-850/40">
                              <td className="p-3 font-mono text-slate-400">#{u.id}</td>
                              <td className="p-3 font-semibold text-slate-200">@{u.username}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  u.role === 'admin' 
                                    ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' 
                                    : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="p-3 text-slate-500">
                                {new Date(u.createdAt).toLocaleDateString()} {new Date(u.createdAt).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Loading Admin Panel statistics...
                </div>
              )}
            </div>
          ) : (
            /* MOBILE NOTIFICATION OVERLAY DRAWER VIEW */
            <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 py-2 divide-y divide-slate-800/50 overflow-y-auto">
              <div className="px-4 py-3 flex items-center justify-between bg-slate-950/40 border-b border-slate-800">
                <span className="text-sm font-bold text-slate-300">Notifications</span>
                <div className="flex items-center gap-2">
                  {unreadNotifsCount > 0 && (
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2.5 py-0.5 rounded-full font-semibold">
                      {unreadNotifsCount} Unread
                    </span>
                  )}
                  <button 
                    onClick={() => setShowNotifications(false)}
                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              {notifications.length === 0 ? (
                <div className="px-4 py-12 text-center text-xs text-slate-500 flex-grow flex items-center justify-center">
                  No notifications yet.
                </div>
              ) : (
                <div className="flex-grow divide-y divide-slate-800/50 overflow-y-auto">
                  {notifications.map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => {
                        handleMarkNotifRead(n.id);
                        setShowNotifications(false);
                        if (n.type === 'message') {
                          const sender = users.find(u => u.id === n.senderId);
                          if (sender) startChat(sender);
                        } else {
                          setActiveTab('feed');
                        }
                      }}
                      className={`px-4 py-4 flex gap-3 cursor-pointer transition-colors ${
                        n.read ? 'hover:bg-slate-800/50' : 'bg-indigo-950/15 hover:bg-indigo-950/25'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {n.type === 'like' && <Heart className="h-4.5 w-4.5 text-rose-500 fill-rose-500" />}
                        {n.type === 'comment' && <MessageSquare className="h-4.5 w-4.5 text-indigo-400" />}
                        {n.type === 'message' && <MessageCircle className="h-4.5 w-4.5 text-emerald-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${n.read ? 'text-slate-300' : 'text-white font-medium'} text-left leading-relaxed`}>
                          {n.content}
                        </p>
                        <span className="text-[10px] text-slate-500 mt-1 block text-left">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {!n.read && (
                        <div className="h-2 w-2 rounded-full bg-indigo-500 self-center shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Toast Notification Container (Live toasting for non-focused tabs) */}
          <div className="fixed bottom-16 md:bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
              <div 
                key={t.id} 
                className="bg-slate-900/90 text-white border border-slate-800 rounded-xl p-3.5 shadow-2xl flex items-center gap-3 animate-pulse-ring max-w-sm pointer-events-auto backdrop-blur-md"
              >
                <div className="shrink-0">
                  {t.type === 'like' && (
                    <div className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                      <Heart className="h-4.5 w-4.5 fill-rose-500 text-rose-500" />
                    </div>
                  )}
                  {t.type === 'comment' && (
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                      <MessageSquare className="h-4.5 w-4.5" />
                    </div>
                  )}
                  {t.type === 'message' && (
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                      <MessageCircle className="h-4.5 w-4.5" />
                    </div>
                  )}
                  {t.type === 'system' && (
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                      <Sparkles className="h-4.5 w-4.5" />
                    </div>
                  )}
                </div>
                <div className="flex-grow text-left">
                  <p className="text-xs font-semibold">Real-Time Event</p>
                  <p className="text-[11px] text-slate-350 mt-0.5 leading-relaxed">{t.content}</p>
                </div>
              </div>
            ))}
          </div>

        </section>

      </main>

      {/* Floating Bottom Nav (For mobile screens only) */}
      {currentUser && (
        <nav className="sticky bottom-0 z-30 md:hidden bg-slate-900 border-t border-slate-800 p-2 flex items-center justify-around shrink-0 select-none">
          <button
            onClick={() => {
              setActiveTab('feed');
              setShowNotifications(false);
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'feed' && !showNotifications ? 'text-indigo-400' : 'text-slate-550'
            }`}
          >
            <Compass className="h-5 w-5" />
            <span className="text-[9px]">Feed</span>
          </button>
          
          <button
            onClick={() => {
              setShowNotifications(true);
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl relative transition-all cursor-pointer ${
              showNotifications ? 'text-indigo-400' : 'text-slate-550'
            }`}
          >
            <Bell className="h-5 w-5" />
            {unreadNotifsCount > 0 && (
              <span className="absolute top-1.5 right-3.5 bg-rose-500 text-white text-[8px] font-bold h-4.5 w-4.5 rounded-full flex items-center justify-center animate-pulse-ring">
                {unreadNotifsCount}
              </span>
            )}
            <span className="text-[9px]">Alerts</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('messages');
              setShowNotifications(false);
              if (chatRecipient) {
                setShowChatMobile(true);
              } else if (users.length > 0) {
                const firstOther = users.find(u => u.id !== currentUser.id);
                if (firstOther) startChat(firstOther);
              }
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'messages' && !showNotifications ? 'text-indigo-400' : 'text-slate-550'
            }`}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-[9px]">Messages</span>
          </button>

          {currentUser.role === 'admin' && (
            <button
              onClick={() => {
                setActiveTab('admin');
                setShowNotifications(false);
              }}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'admin' && !showNotifications ? 'text-amber-500' : 'text-amber-500/50'
              }`}
            >
              <Shield className="h-5 w-5" />
              <span className="text-[9px]">Admin</span>
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
