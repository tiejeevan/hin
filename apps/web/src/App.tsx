import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BroadcastDelivery,
  ContentReport,
  ReportListPage,
  ReportReason,
  ReportTargetType,
  Comment,
  FollowRequest,
  Message,
  Notification,
  Poll,
  PostsPage,
  SystemBroadcast,
  User as UserType,
  UserSettings,
  DEFAULT_USER_SETTINGS,
  shouldShowNotificationToast,
  shouldShowChatIcon,
  notificationPostTarget,
} from '@hin/types';
import { API_URL, WS_URL } from './config';
import { Toast, AdminData, ActiveTab, ChatRecipient, CommentNode, FeedMode } from './types/ui';
import type { CreatePostSubmitPayload } from './components/feed/CreatePostForm';
import { mergePollFromBroadcast } from './utils/pollVisibility';
import { parseLocation, syncUrl, postPermalinkUrl, profilePermalinkUrl } from './lib/appRoutes';
import { AppShell } from './components/layout/AppShell';
import { AppHeader } from './components/layout/AppHeader';
import { GuestHeader } from './components/layout/GuestHeader';
import { ImpersonationBanner } from './components/layout/ImpersonationBanner';
import { AuthForm } from './components/auth/AuthForm';
import { FeedView } from './components/feed/FeedView';
import { PostView } from './components/feed/PostView';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { ProfileView } from './components/profile/ProfileView';
import { MessagesPanel } from './components/messages/MessagesPanel';
import { ToastContainer } from './components/ui/ToastContainer';
import { FloatingActionStack } from './components/ui/FloatingActionStack';
import { FollowersModal } from './components/profile/FollowersModal';
import { ReportModal } from './components/moderation/ReportModal';

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('hin_token'));
  const [currentUser, setCurrentUser] = useState<UserType | null>(() => {
    const saved = localStorage.getItem('hin_user');
    return saved ? JSON.parse(saved) : null;
  });
  // Removed global users state
  const [posts, setPosts] = useState<import('@hin/types').Post[]>([]);
  const [feedNextCursor, setFeedNextCursor] = useState<number | string | null>(null);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false);
  const [feedMode, setFeedMode] = useState<FeedMode>('all');
  const [followedUserIds, setFollowedUserIds] = useState<Set<number>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<number>>(new Set());
  const [mutedUserIds, setMutedUserIds] = useState<Set<number>>(new Set());
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [followBusy, setFollowBusy] = useState(false);
  const [profilePostsError, setProfilePostsError] = useState<string | null>(null);
  const [followersModal, setFollowersModal] = useState<'followers' | 'following' | null>(null);
  const [highlightFollowRequests, setHighlightFollowRequests] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const feedModeRef = useRef<FeedMode>('all');
  const followedUserIdsRef = useRef<Set<number>>(new Set());
  const blockedUserIdsRef = useRef<Set<number>>(new Set());
  const mutedUserIdsRef = useRef<Set<number>>(new Set());
  // Removed usersRef
  const feedLoadingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');

  const FEED_PAGE_SIZE = 10;

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
  const [broadcastHistory, setBroadcastHistory] = useState<SystemBroadcast[] | null>(null);
  const [adminReports, setAdminReports] = useState<ContentReport[] | null>(null);

  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: number } | null>(null);

  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [profileUser, setProfileUser] = useState<UserType | null>(null);
  const [profilePosts, setProfilePosts] = useState<import('@hin/types').Post[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const userSettingsRef = useRef<UserSettings | null>(null);

  useEffect(() => {
    userSettingsRef.current = userSettings;
  }, [userSettings]);

  const [postViewId, setPostViewId] = useState<number | null>(null);
  const [postViewPost, setPostViewPost] = useState<import('@hin/types').Post | null>(null);
  const [postViewLoading, setPostViewLoading] = useState(false);
  const [postViewError, setPostViewError] = useState<{ status: number; message: string } | null>(null);
  const [highlightCommentId, setHighlightCommentId] = useState<number | null>(null);
  const [showGuestAuth, setShowGuestAuth] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef(false);
  const processedNotifIdsRef = useRef<Set<number>>(new Set());
  /** Sync dedupe for comment create/delete (HTTP + WS). setState updaters are async in React 18. */
  const appliedCommentCreatesRef = useRef(new Set<number>());
  const appliedCommentDeletesRef = useRef(new Set<number>());
  const showMessagesDropdownRef = useRef(showMessagesDropdown);
  const chatRecipientRef = useRef(chatRecipient);

  useEffect(() => {
    showMessagesDropdownRef.current = showMessagesDropdown;
  }, [showMessagesDropdown]);

  useEffect(() => {
    chatRecipientRef.current = chatRecipient;
  }, [chatRecipient]);

  useEffect(() => {
    feedModeRef.current = feedMode;
  }, [feedMode]);

  useEffect(() => {
    followedUserIdsRef.current = followedUserIds;
  }, [followedUserIds]);

  useEffect(() => {
    blockedUserIdsRef.current = blockedUserIds;
  }, [blockedUserIds]);

  useEffect(() => {
    mutedUserIdsRef.current = mutedUserIds;
  }, [mutedUserIds]);

  // Removed usersRef effect

  const addFollowRequest = useCallback((request: FollowRequest) => {
    setFollowRequests(prev => {
      if (prev.some(r => r.requesterId === request.requesterId)) return prev;
      return [request, ...prev];
    });
  }, []);

  const shouldShowPostInFeed = useCallback((post: import('@hin/types').Post, viewerId: number) => {
    const mode = feedModeRef.current;
    const followed = followedUserIdsRef.current;
    const blocked = blockedUserIdsRef.current;
    const muted = mutedUserIdsRef.current;
    const visibility = post.visibility ?? 'public';

    if (blocked.has(post.userId) || muted.has(post.userId)) return false;
    if (post.userId === viewerId) return mode !== 'bookmarks';
    if (mode === 'bookmarks') return false;
    if (mode === 'following') {
      return followed.has(post.userId) && visibility !== 'only_me';
    }
    return visibility === 'public';
  }, []);

  const getHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const addToast = (
    content: string,
    type: Toast['type'],
    target?: { postId?: number; commentId?: number },
    opts?: { skipPrefCheck?: boolean },
  ) => {
    const settings = userSettingsRef.current;
    if (!opts?.skipPrefCheck && settings && !shouldShowNotificationToast(settings, type)) {
      return;
    }
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, content, type, ...target }]);
    const duration = type === 'system' ? 7000 : 4000;
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  };

  const goHome = (opts?: { skipUrlSync?: boolean }) => {
    setActiveTab('feed');
    setProfileUserId(null);
    setProfileUser(null);
    setProfilePosts([]);
    setProfileError(null);
    setIsProfileEditing(false);
    setPostViewId(null);
    setPostViewPost(null);
    setPostViewError(null);
    setHighlightCommentId(null);
    setShowGuestAuth(false);
    setShowNotifications(false);
    setShowMessagesDropdown(false);
    setMessagesPanelExpanded(false);
    setChatRecipient(null);
    if (!opts?.skipUrlSync) {
      syncUrl({ view: 'home' }, true);
    }
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

  const fetchFollowedIds = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/follows/following-ids`, { headers: getHeaders() });
      if (res.ok) {
        const data: { ids: number[] } = await res.json();
        setFollowedUserIds(new Set(data.ids));
      }
    } catch (e) {
      console.error('Error fetching followed ids:', e);
    }
  };

  const fetchBlockedIds = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/blocks/ids`, { headers: getHeaders() });
      if (res.ok) {
        const data: { ids: number[] } = await res.json();
        setBlockedUserIds(new Set(data.ids));
      }
    } catch (e) {
      console.error('Error fetching blocked ids:', e);
    }
  };

  const fetchMutedIds = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/mutes/ids`, { headers: getHeaders() });
      if (res.ok) {
        const data: { ids: number[] } = await res.json();
        setMutedUserIds(new Set(data.ids));
      }
    } catch (e) {
      console.error('Error fetching muted ids:', e);
    }
  };

  const fetchFollowRequests = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/follows/requests`, { headers: getHeaders() });
      if (res.ok) setFollowRequests(await res.json());
    } catch (e) {
      console.error('Error fetching follow requests:', e);
    }
  };

  const fetchUserSettings = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/users/me/settings`, { headers: getHeaders() });
      if (res.ok) {
        setUserSettings(await res.json());
      }
    } catch (e) {
      console.error('Error fetching user settings:', e);
    }
  };

  const handleSettingsChange = (settings: UserSettings) => {
    setUserSettings(settings);
    if (currentUser) {
      const updatedUser = { ...currentUser, isPrivate: settings.isPrivate };
      setCurrentUser(updatedUser);
      localStorage.setItem('hin_user', JSON.stringify(updatedUser));
      setProfileUser(prev => (prev?.id === currentUser.id ? { ...prev, isPrivate: settings.isPrivate } : prev));
    }
  };

  const fetchProfile = async (userId: number): Promise<UserType | null> => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const res = await fetch(`${API_URL}/api/users/${userId}`, { headers: getHeaders() });
      if (res.ok) {
        const user: UserType = await res.json();
        setProfileUser(user);
        return user;
      }
      const data = await res.json().catch(() => ({}));
      setProfileError(data.error || 'Failed to load profile');
      setProfileUser(null);
      return null;
    } catch {
      setProfileError('Failed to load profile');
      setProfileUser(null);
      return null;
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchProfilePosts = async (userId: number) => {
    setProfilePostsError(null);
    try {
      const res = await fetch(`${API_URL}/api/posts?userId=${userId}&limit=50`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data: PostsPage = await res.json();
        setProfilePosts(data.posts);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openProfile = async (
    userId: number,
    opts?: { highlightFollowRequests?: boolean; username?: string; skipUrlSync?: boolean; replace?: boolean },
  ) => {
    setProfileUserId(userId);
    setActiveTab('profile');
    setIsProfileEditing(false);
    setIsProfileSettingsOpen(!!opts?.highlightFollowRequests && userId === currentUser?.id);
    setShowNotifications(false);
    setShowMessagesDropdown(false);
    setMessagesPanelExpanded(false);
    setChatRecipient(null);
    setProfilePostsError(null);
    setHighlightFollowRequests(!!opts?.highlightFollowRequests);
    setShowGuestAuth(false);
    if (!opts?.skipUrlSync && opts?.username) {
      syncUrl({ view: 'profile', username: opts.username }, opts?.replace);
    }
    const user = await fetchProfile(userId);
    fetchProfilePosts(userId);
    if (userId === currentUser?.id) fetchFollowRequests();
    if (!opts?.skipUrlSync && !opts?.username && user?.username) {
      syncUrl({ view: 'profile', username: user.username }, opts?.replace);
    }
  };

  const openProfileByUsername = async (
    username: string,
    opts?: { skipUrlSync?: boolean; replace?: boolean },
  ) => {
    setActiveTab('profile');
    setProfileLoading(true);
    setProfileError(null);
    setProfileUser(null);
    setProfilePosts([]);
    setIsProfileEditing(false);
    setIsProfileSettingsOpen(false);
    setShowNotifications(false);
    setShowMessagesDropdown(false);
    setMessagesPanelExpanded(false);
    setChatRecipient(null);
    setProfilePostsError(null);
    setHighlightFollowRequests(false);
    setShowGuestAuth(false);
    if (!opts?.skipUrlSync) {
      syncUrl({ view: 'profile', username }, opts?.replace);
    }
    try {
      const res = await fetch(`${API_URL}/api/users/username/${encodeURIComponent(username)}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const user: UserType = await res.json();
        setProfileUserId(user.id);
        setProfileUser(user);
        setProfileLoading(false);
        setProfileError(null);
        fetchProfilePosts(user.id);
        if (user.id === currentUser?.id) fetchFollowRequests();
      } else {
        setProfileUserId(null);
        setProfileUser(null);
        setProfileLoading(false);
        const data = await res.json().catch(() => ({}));
        setProfileError(data.error || `User @${username} not found`);
        if (!currentUser) {
          addToast(`User @${username} not found`, 'system', undefined, { skipPrefCheck: true });
        }
      }
    } catch (e) {
      console.error('Error opening profile by username:', e);
      setProfileError('Failed to load profile');
    }
  };

  const handleViewProfile = (idOrUsername: number | string) => {
    if (typeof idOrUsername === 'number') {
      openProfile(idOrUsername);
    } else {
      openProfileByUsername(idOrUsername);
    }
  };

  const handleProfileSaved = (updated: UserType) => {
    setProfileUser(updated);
    if (currentUser?.id === updated.id) {
      setCurrentUser(updated);
      localStorage.setItem('hin_user', JSON.stringify(updated));
    }
    addToast('Profile updated successfully', 'system', undefined, { skipPrefCheck: true });
  };

  const openAdmin = () => {
    setActiveTab('admin');
    setProfileUserId(null);
    setIsProfileEditing(false);
    setShowNotifications(false);
  };

  // Removed fetchUsers

  const fetchPosts = async (opts?: { cursor?: number | string | null; append?: boolean; mode?: FeedMode }) => {
    const append = opts?.append ?? false;
    const cursor = opts?.cursor ?? null;
    const mode = opts?.mode ?? feedModeRef.current;
    if (append) {
      if (feedLoadingRef.current || cursor === null) return;
      feedLoadingRef.current = true;
      setIsLoadingMorePosts(true);
    }
    try {
      const params = new URLSearchParams({ limit: String(FEED_PAGE_SIZE) });
      if (cursor !== null) params.set('cursor', String(cursor));
      const url =
        mode === 'bookmarks'
          ? `${API_URL}/api/posts/bookmarks?${params}`
          : `${API_URL}/api/posts?${params}${mode === 'following' ? '&following=true' : ''}`;
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const data: PostsPage = await res.json();
        setPosts(prev => {
          if (!append) return data.posts;
          const seen = new Set(prev.map(p => p.id));
          const merged = [...prev];
          for (const post of data.posts) {
            if (!seen.has(post.id)) merged.push(post);
          }
          return merged;
        });
        setFeedNextCursor(data.nextCursor);
      }
    } catch (e) {
      console.error('Error fetching posts:', e);
    } finally {
      feedLoadingRef.current = false;
      setIsLoadingMorePosts(false);
    }
  };

  const loadMorePosts = useCallback(() => {
    if (feedNextCursor === null || feedLoadingRef.current) return;
    fetchPosts({ cursor: feedNextCursor, append: true, mode: feedMode });
  }, [feedNextCursor, token, feedMode]);

  const handleFeedModeChange = (mode: FeedMode) => {
    if (mode === feedMode) return;
    setFeedMode(mode);
    setPosts([]);
    setFeedNextCursor(null);
    fetchPosts({ mode });
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

  const fetchPost = async (postId: number) => {
    setPostViewLoading(true);
    setPostViewError(null);
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}`, { headers: getHeaders() });
      if (res.ok) {
        const post = await res.json();
        setPostViewPost(post);
        setExpandedComments(prev => ({ ...prev, [postId]: true }));
        fetchComments(postId);
      } else {
        const data = await res.json().catch(() => ({}));
        setPostViewPost(null);
        setPostViewError({
          status: res.status,
          message: data.error || 'Failed to load post',
        });
      }
    } catch {
      setPostViewPost(null);
      setPostViewError({ status: 0, message: 'Failed to load post' });
    } finally {
      setPostViewLoading(false);
    }
  };

  const openPost = (
    postId: number,
    opts?: { commentId?: number; replace?: boolean; skipUrlSync?: boolean },
  ) => {
    setActiveTab('post');
    setPostViewId(postId);
    setHighlightCommentId(opts?.commentId ?? null);
    setPostViewPost(null);
    setPostViewError(null);
    setShowNotifications(false);
    setShowMessagesDropdown(false);
    setMessagesPanelExpanded(false);
    setChatRecipient(null);
    setShowGuestAuth(false);
    if (!opts?.skipUrlSync) {
      syncUrl({ view: 'post', postId, commentId: opts?.commentId }, opts?.replace);
    }
    fetchPost(postId);
  };

  const handleCopyPostPermalink = (postId: number) => {
    const url = postPermalinkUrl(postId);
    navigator.clipboard.writeText(url).then(
      () => addToast('Link copied to clipboard', 'system', undefined, { skipPrefCheck: true }),
      () => addToast('Could not copy link', 'system', undefined, { skipPrefCheck: true }),
    );
  };

  const handleCopyProfilePermalink = (username: string) => {
    const url = profilePermalinkUrl(username);
    navigator.clipboard.writeText(url).then(
      () => addToast('Profile link copied', 'system', undefined, { skipPrefCheck: true }),
      () => addToast('Could not copy link', 'system', undefined, { skipPrefCheck: true }),
    );
  };

  const handleOpenReport = (type: ReportTargetType, id: number) => {
    if (!currentUser || !token) {
      handleGuestSignIn();
      return;
    }
    setReportTarget({ type, id });
  };

  const handleSubmitReport = async (reason: ReportReason, details?: string) => {
    if (!reportTarget || !token) return { success: false, error: 'Not signed in' };
    try {
      const res = await fetch(`${API_URL}/api/reports`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          targetType: reportTarget.type,
          targetId: reportTarget.id,
          reason,
          details,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setReportTarget(null);
        addToast('Report submitted', 'system', undefined, { skipPrefCheck: true });
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to submit report' };
    } catch {
      return { success: false, error: 'Failed to submit report' };
    }
  };

  const fetchAdminReports = async () => {
    if (!currentUser || currentUser.role !== 'admin' || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/reports?status=pending`, { headers: getHeaders() });
      if (res.ok) {
        const data: ReportListPage = await res.json();
        setAdminReports(data.reports);
      }
    } catch (e) {
      console.error('Error fetching reports:', e);
    }
  };

  const handleReviewReport = async (reportId: number, action: 'dismiss' | 'delete_content' | 'delete_user') => {
    if (!currentUser || currentUser.role !== 'admin' || !token) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setAdminReports(prev => prev?.filter(r => r.id !== reportId) ?? null);
        if (adminData) fetchAdminStats();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to review report' };
    } catch {
      return { success: false, error: 'Failed to review report' };
    }
  };

  const handleToastClick = (toast: Toast) => {
    if (toast.postId) {
      openPost(toast.postId, { commentId: toast.commentId });
    }
  };

  const handleGuestSignIn = () => {
    setShowGuestAuth(true);
    sessionStorage.setItem('hin_return_url', window.location.pathname + window.location.hash);
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

  const fetchBroadcastHistory = async () => {
    if (!currentUser || currentUser.role !== 'admin' || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/broadcasts`, { headers: getHeaders() });
      if (res.ok) setBroadcastHistory(await res.json());
    } catch (e) {
      console.error('Error fetching broadcast history:', e);
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
      fetchPosts();
      fetchNotifications();
      fetchThreads();
      fetchFollowedIds();
      fetchBlockedIds();
      fetchMutedIds();
      fetchFollowRequests();
      fetchUserSettings();
    } else {
      setPosts([]);
      setFeedNextCursor(null);
      setNotifications([]);
      setThreads([]);
      setAdminData(null);
      setBroadcastHistory(null);
      setFollowedUserIds(new Set());
      setBlockedUserIds(new Set());
      setMutedUserIds(new Set());
      setFollowRequests([]);
      setUserSettings(null);
    }
  }, [token]);

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
              const settings = userSettingsRef.current;
              const showToast = (type: Toast['type']) =>
                !settings || shouldShowNotificationToast(settings, type);
              if (notif.type === 'like' && showToast('like')) {
                const target = notificationPostTarget(notif);
                addToast(notif.content, 'like', target ? { postId: target.postId, commentId: target.commentId } : undefined, { skipPrefCheck: true });
              } else if (notif.type === 'comment' && showToast('comment')) {
                const target = notificationPostTarget(notif);
                addToast(notif.content, 'comment', target ? { postId: target.postId, commentId: target.commentId } : undefined, { skipPrefCheck: true });
              } else if (notif.type === 'mention' && showToast('mention')) {
                const target = notificationPostTarget(notif);
                addToast(notif.content, 'mention', target ? { postId: target.postId, commentId: target.commentId } : undefined, { skipPrefCheck: true });
              } else if (
                (notif.type === 'follow' || notif.type === 'follow_request' || notif.type === 'follow_accepted') &&
                showToast(notif.type)
              ) {
                addToast(notif.content, notif.type, undefined, { skipPrefCheck: true });
              }
              if (notif.type === 'follow_request' && notif.userId === currentUser!.id) {
                fetchFollowRequests();
              }
              if (notif.type === 'follow_accepted') {
                const targetUserId = notif.senderId;
                setFollowedUserIds(prev => new Set([...prev, targetUserId]));
                setProfileUser(prev =>
                  prev?.id === targetUserId
                    ? { ...prev, followStatus: 'following', canViewPosts: true }
                    : prev,
                );
              }
              // System notifications stay in the inbox; toasts are sent separately when requested.
              break;
            }
            case 'follow_request_received': {
              const { request } = message.payload as { request: FollowRequest };
              addFollowRequest(request);
              break;
            }
            case 'follow_approved': {
              const { targetUserId } = message.payload as { targetUserId: number };
              setFollowedUserIds(prev => new Set([...prev, targetUserId]));
              setProfileUser(prev =>
                prev?.id === targetUserId
                  ? { ...prev, followStatus: 'following', canViewPosts: true }
                  : prev,
              );
              break;
            }
            case 'system_toast': {
              const settings = userSettingsRef.current;
              if (!settings || shouldShowNotificationToast(settings, 'system')) {
                addToast(message.payload.content, 'system', undefined, { skipPrefCheck: true });
              }
              break;
            }
            case 'post_created': {
              const { post } = message.payload;
              if (!shouldShowPostInFeed(post, currentUser!.id)) break;
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
              if (postViewId === postId) {
                setPostViewPost(null);
                setPostViewError({ status: 404, message: 'Post not found' });
              }
              break;
            }
            case 'post_updated': {
              const { post } = message.payload;
              setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, ...post } : p)));
              setProfilePosts(prev => prev.map(p => (p.id === post.id ? { ...p, ...post } : p)));
              setPostViewPost(prev => (prev?.id === post.id ? { ...prev, ...post } : prev));
              break;
            }
            case 'poll_vote_update':
            case 'poll_closed': {
              const { postId, poll } = message.payload;
              const mergePoll = (p: import('@hin/types').Post) => {
                if (p.id !== postId || !p.poll) return p;
                return {
                  ...p,
                  poll: mergePollFromBroadcast(
                    p.poll,
                    poll,
                    p.userId === currentUser!.id,
                  ),
                };
              };
              setPosts(prev => prev.map(mergePoll));
              setProfilePosts(prev => prev.map(mergePoll));
              setPostViewPost(prev => (prev ? mergePoll(prev) : prev));
              break;
            }
            case 'like_update': {
              const { postId, likesCount, userId, liked } = message.payload;
              const mergeLike = (p: import('@hin/types').Post) =>
                p.id === postId
                  ? { ...p, likesCount, hasLiked: userId === currentUser!.id ? liked : p.hasLiked }
                  : p;
              setPosts(prev => prev.map(mergeLike));
              setProfilePosts(prev => prev.map(mergeLike));
              setPostViewPost(prev => (prev ? mergeLike(prev) : prev));
              break;
            }
            case 'comment_like_update': {
              const { commentId, postId, likesCount, userId, liked } = message.payload;
              setPostComments(prev => ({
                ...prev,
                [postId]: (prev[postId] || []).map(c =>
                  c.id === commentId
                    ? {
                        ...c,
                        likesCount,
                        hasLiked: userId === currentUser!.id ? liked : c.hasLiked,
                      }
                    : c
                ),
              }));
              break;
            }
            case 'comment_created': {
              const { comment } = message.payload;
              if (appliedCommentCreatesRef.current.has(comment.id)) break;
              appliedCommentCreatesRef.current.add(comment.id);
              setPostComments(prev => {
                const list = prev[comment.postId] || [];
                if (list.some(c => c.id === comment.id)) return prev;
                return { ...prev, [comment.postId]: [comment, ...list] };
              });
              setPosts(prev =>
                prev.map(p => (p.id === comment.postId ? { ...p, commentsCount: p.commentsCount + 1 } : p))
              );
              setProfilePosts(prev =>
                prev.map(p => (p.id === comment.postId ? { ...p, commentsCount: p.commentsCount + 1 } : p))
              );
              setPostViewPost(prev => {
                if (!prev || prev.id !== comment.postId) return prev;
                return { ...prev, commentsCount: prev.commentsCount + 1 };
              });
              break;
            }
            case 'comment_deleted': {
              const { commentId, postId } = message.payload;
              if (appliedCommentDeletesRef.current.has(commentId)) break;
              appliedCommentDeletesRef.current.add(commentId);
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
              setProfilePosts(prev =>
                prev.map(p => (p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p))
              );
              setPostViewPost(prev => {
                if (!prev || prev.id !== postId) return prev;
                return { ...prev, commentsCount: Math.max(0, prev.commentsCount - 1) };
              });
              break;
            }
            case 'comment_updated': {
              const { comment } = message.payload;
              setPostComments(prev => ({
                ...prev,
                [comment.postId]: (prev[comment.postId] || []).map(c =>
                  c.id === comment.id
                    ? {
                        ...c,
                        ...comment,
                        likesCount: comment.likesCount ?? c.likesCount ?? 0,
                        hasLiked: comment.hasLiked ?? c.hasLiked,
                      }
                    : c
                ),
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
        setShowGuestAuth(false);
        const route = parseLocation(window.location.pathname, window.location.hash);
        if (route.view === 'post') {
          openPost(route.postId, { commentId: route.commentId, skipUrlSync: true });
        } else if (route.view === 'profile') {
          openProfileByUsername(route.username, { skipUrlSync: true });
        }
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

  const applyPollUpdate = (postId: number, poll: Poll) => {
    const merge = (p: import('@hin/types').Post) =>
      p.id === postId ? { ...p, poll } : p;
    setPosts(prev => prev.map(merge));
    setProfilePosts(prev => prev.map(merge));
    setPostViewPost(prev => (prev?.id === postId ? merge(prev) : prev));
  };

  const handleCreatePost = async (_e: React.FormEvent, payload: CreatePostSubmitPayload) => {
    if (!currentUser) return;
    if (payload.kind === 'text' && !newPostContent.trim()) return;
    if (payload.kind === 'poll' && !payload.poll.question.trim()) return;

    const body =
      payload.kind === 'poll'
        ? {
            type: 'poll' as const,
            content: newPostContent.trim(),
            mediaUrls: payload.mediaUrls.length ? payload.mediaUrls : undefined,
            visibility: payload.visibility,
            ...payload.poll,
          }
        : {
            content: newPostContent,
            mediaUrls: payload.mediaUrls.length ? payload.mediaUrls : undefined,
            visibility: payload.visibility,
          };

    const res = await fetch(`${API_URL}/api/posts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
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

  const handleVotePoll = async (postId: number, optionIds: number[]) => {
    const res = await fetch(`${API_URL}/api/posts/${postId}/poll/vote`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ optionIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to vote');
    }
    const { poll } = await res.json();
    applyPollUpdate(postId, poll);
  };

  const handleRetractPollVote = async (postId: number) => {
    const res = await fetch(`${API_URL}/api/posts/${postId}/poll/vote`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to retract vote');
    }
    const { poll } = await res.json();
    applyPollUpdate(postId, poll);
  };

  const handleClosePoll = async (postId: number) => {
    const res = await fetch(`${API_URL}/api/posts/${postId}/poll/close`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to close poll');
    }
    const { poll } = await res.json();
    applyPollUpdate(postId, poll);
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
        addToast('Post updated successfully', 'system', undefined, { skipPrefCheck: true });
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
        addToast('Post deleted successfully', 'system', undefined, { skipPrefCheck: true });
        if (currentUser.role === 'admin' && adminData) fetchAdminStats();
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
        setPostViewPost(prev =>
          prev?.id === postId ? { ...prev, hasLiked: data.liked, likesCount: data.likesCount } : prev
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleBookmark = async (postId: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/bookmark`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setPostViewPost(prev =>
          prev?.id === postId
            ? { ...prev, hasBookmarked: data.bookmarked, bookmarksCount: data.bookmarksCount }
            : prev
        );
        if (feedModeRef.current === 'bookmarks' && !data.bookmarked) {
          setPosts(prev => prev.filter(p => p.id !== postId));
        }
        addToast(data.bookmarked ? 'Post bookmarked' : 'Bookmark removed', 'system', undefined, { skipPrefCheck: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSharePost = async (postId: number) => {
    const post = postViewPost?.id === postId ? postViewPost : null;
    if (!post) return;
    const url = postPermalinkUrl(postId);
    const shareText = post.content.trim().slice(0, 200) || `Post by ${post.username}`;

    if (currentUser) {
      try {
        const res = await fetch(`${API_URL}/api/posts/${postId}/share`, {
          method: 'POST',
          headers: getHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setPostViewPost(prev =>
            prev?.id === postId ? { ...prev, sharesCount: data.sharesCount } : prev
          );
        }
      } catch (e) {
        console.error(e);
      }
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${post.username} on Hin`,
          text: shareText,
          url,
        });
        return;
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
    }

    handleCopyPostPermalink(postId);
  };

  const handleToggleCommentLike = async (postId: number, commentId: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/api/comments/${commentId}/like`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setPostComments(prev => ({
          ...prev,
          [postId]: (prev[postId] || []).map(c =>
            c.id === commentId ? { ...c, hasLiked: data.liked, likesCount: data.likesCount } : c
          ),
        }));
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
        // Realtime may have already applied this comment; avoid duplicates.
        if (!appliedCommentCreatesRef.current.has(newComment.id)) {
          appliedCommentCreatesRef.current.add(newComment.id);
          setPostComments(prev => {
            const list = prev[postId] || [];
            if (list.some(c => c.id === newComment.id)) return prev;
            return { ...prev, [postId]: [newComment, ...list] };
          });
          setPosts(prev =>
            prev.map(p => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p))
          );
          setProfilePosts(prev =>
            prev.map(p => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p))
          );
        }
        setNewCommentText(prev => ({ ...prev, [postId]: '' }));
        setReplyingTo(prev => ({ ...prev, [postId]: null }));
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
        addToast('Comment updated successfully', 'system', undefined, { skipPrefCheck: true });
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
        // Realtime may have already applied this delete; avoid double-decrement.
        if (!appliedCommentDeletesRef.current.has(commentId)) {
          appliedCommentDeletesRef.current.add(commentId);
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
          setProfilePosts(prev =>
            prev.map(p => (p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p))
          );
        }
        addToast('Comment deleted', 'system', undefined, { skipPrefCheck: true });
        if (currentUser.role === 'admin' && adminData) fetchAdminStats();
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

  const handleMarkAllNotifsRead = async () => {
    if (!currentUser || unreadNotifsCount === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => (n.read ? n : { ...n, read: true })));
        setUnreadNotifsCount(0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    handleMarkNotifRead(n.id);
    setShowNotifications(false);
    if (n.type === 'system') return;
    if (n.type === 'message') {
      try {
        const res = await fetch(`${API_URL}/api/users/${n.senderId}`, { headers: getHeaders() });
        if (res.ok) {
          const sender = await res.json();
          startChat(sender);
        }
      } catch (e) {
        console.error('Error fetching sender profile:', e);
      }
    } else if (n.type === 'follow_request') {
      openProfile(currentUser!.id, { highlightFollowRequests: true });
    } else if (n.type === 'follow' || n.type === 'follow_accepted') {
      openProfile(n.senderId);
    } else if (n.type === 'like' || n.type === 'comment' || n.type === 'mention') {
      const target = notificationPostTarget(n);
      if (target) openPost(target.postId, { commentId: target.commentId });
      else goHome();
    } else {
      goHome();
    }
  };

  const updateProfileFollowState = (userId: number, patch: Partial<UserType>) => {
    setProfileUser(prev => (prev?.id === userId ? { ...prev, ...patch } : prev));
  };

  const handleFollow = async (userId: number) => {
    if (!token || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/follows/${userId}`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to follow');
      updateProfileFollowState(userId, {
        followStatus: data.followStatus,
        followerCount: data.followerCount,
        followingCount: data.followingCount,
        canViewPosts: data.followStatus === 'following' ? true : profileUser?.canViewPosts,
      });
      if (data.followStatus === 'following') {
        setFollowedUserIds(prev => new Set([...prev, userId]));
        if (profileUserId === userId) fetchProfilePosts(userId);
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to follow', 'system', undefined, { skipPrefCheck: true });
    } finally {
      setFollowBusy(false);
    }
  };

  const handleUnfollow = async (userId: number) => {
    if (!token || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/follows/${userId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unfollow');
      updateProfileFollowState(userId, {
        followStatus: data.followStatus,
        followerCount: data.followerCount,
        canViewPosts: profileUser?.isPrivate ? false : profileUser?.canViewPosts,
      });
      setFollowedUserIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      if (profileUserId === userId && profileUser?.isPrivate) {
        setProfilePosts([]);
        fetchProfilePosts(userId);
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to unfollow', 'system', undefined, { skipPrefCheck: true });
    } finally {
      setFollowBusy(false);
    }
  };

  const handleCancelFollowRequest = async (userId: number) => {
    if (!token || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/follows/${userId}/request`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel request');
      updateProfileFollowState(userId, { followStatus: data.followStatus });
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to cancel request', 'system', undefined, { skipPrefCheck: true });
    } finally {
      setFollowBusy(false);
    }
  };

  const handleBlockUser = async (userId: number) => {
    if (!token || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/blocks/${userId}`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to block user');
      setBlockedUserIds(prev => new Set([...prev, userId]));
      setFollowedUserIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      setPosts(prev => prev.filter(p => p.userId !== userId));
      updateProfileFollowState(userId, {
        blockStatus: data.blockStatus,
        followStatus: 'none',
        canViewPosts: false,
      });
      if (profileUserId === userId) {
        setProfilePosts([]);
      }
      addToast('User blocked', 'system', undefined, { skipPrefCheck: true });
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to block user', 'system', undefined, { skipPrefCheck: true });
    } finally {
      setFollowBusy(false);
    }
  };

  const handleUnblockUser = async (userId: number) => {
    if (!token || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/blocks/${userId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unblock user');
      setBlockedUserIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      updateProfileFollowState(userId, {
        blockStatus: data.blockStatus,
        canViewPosts: true,
      });
      if (profileUserId === userId) fetchProfilePosts(userId);
      addToast('User unblocked', 'system', undefined, { skipPrefCheck: true });
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to unblock user', 'system', undefined, { skipPrefCheck: true });
    } finally {
      setFollowBusy(false);
    }
  };

  const handleMuteUser = async (userId: number) => {
    if (!token || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/mutes/${userId}`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mute user');
      setMutedUserIds(prev => new Set([...prev, userId]));
      setPosts(prev => prev.filter(p => p.userId !== userId));
      updateProfileFollowState(userId, { muteStatus: data.muteStatus });
      addToast('User muted', 'system', undefined, { skipPrefCheck: true });
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to mute user', 'system', undefined, { skipPrefCheck: true });
    } finally {
      setFollowBusy(false);
    }
  };

  const handleUnmuteUser = async (userId: number) => {
    if (!token || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/mutes/${userId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unmute user');
      setMutedUserIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      updateProfileFollowState(userId, { muteStatus: data.muteStatus });
      addToast('User unmuted', 'system', undefined, { skipPrefCheck: true });
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to unmute user', 'system', undefined, { skipPrefCheck: true });
    } finally {
      setFollowBusy(false);
    }
  };

  const handleApproveFollowRequest = async (requesterId: number) => {
    if (!token) return;
    const res = await fetch(`${API_URL}/api/follows/requests/${requesterId}/approve`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (res.ok) {
      setFollowRequests(prev => prev.filter(r => r.requesterId !== requesterId));
      addToast('Follow request approved', 'system', undefined, { skipPrefCheck: true });
      fetchFollowedIds();
    }
  };

  const handleRejectFollowRequest = async (requesterId: number) => {
    if (!token) return;
    const res = await fetch(`${API_URL}/api/follows/requests/${requesterId}/reject`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (res.ok) {
      setFollowRequests(prev => prev.filter(r => r.requesterId !== requesterId));
    }
  };

  useEffect(() => {
    if (!highlightFollowRequests) return;
    setIsProfileSettingsOpen(true);
    const t = setTimeout(() => {
      document.getElementById('follow-requests-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightFollowRequests(false);
    }, 300);
    return () => clearTimeout(t);
  }, [highlightFollowRequests, profileUserId]);

  useEffect(() => {
    const route = parseLocation(window.location.pathname, window.location.hash);
    if (route.view === 'post') {
      openPost(route.postId, { commentId: route.commentId, replace: true, skipUrlSync: true });
    } else if (route.view === 'profile') {
      openProfileByUsername(route.username, { replace: true, skipUrlSync: true });
    }

    const onPopState = () => {
      const r = parseLocation(window.location.pathname, window.location.hash);
      if (r.view === 'post') {
        openPost(r.postId, { commentId: r.commentId, skipUrlSync: true });
      } else if (r.view === 'profile') {
        openProfileByUsername(r.username, { skipUrlSync: true });
      } else {
        goHome({ skipUrlSync: true });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Removed auto-fetch users effect

  const handleSystemBroadcast = async (message: string, delivery: BroadcastDelivery) => {
    if (!currentUser || currentUser.role !== 'admin' || !token) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/broadcast`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ message, delivery }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to send broadcast' };
      }
      // Refresh audit log only if it was already loaded.
      if (broadcastHistory !== null) await fetchBroadcastHistory();
      return {
        success: true,
        notificationsCreated: data.notificationsCreated as number | undefined,
      };
    } catch (e) {
      console.error(e);
      return { success: false, error: 'Failed to send broadcast' };
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
        addToast(`Now acting as @${data.user.username}`, 'system', undefined, { skipPrefCheck: true });
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
      addToast('Returned to Admin session', 'system', undefined, { skipPrefCheck: true });
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
        addToast('User role updated successfully', 'system', undefined, { skipPrefCheck: true });
        if (adminData) fetchAdminStats();
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
        addToast(`Account @${targetUsername} has been soft-deleted`, 'system', undefined, { skipPrefCheck: true });
        if (adminData) fetchAdminStats();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isGuestPostView = !currentUser && activeTab === 'post';
  const isGuestProfileView = !currentUser && activeTab === 'profile';
  const showAuthOnly = !currentUser && !isGuestPostView && !isGuestProfileView;

  const effectiveSettings: UserSettings = userSettings ?? {
    ...DEFAULT_USER_SETTINGS,
    isPrivate: !!currentUser?.isPrivate,
    updatedAt: new Date(0).toISOString(),
  };
  const showChatIcon =
    !!currentUser && shouldShowChatIcon(effectiveSettings, activeTab);

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
        isGuestPostView || isGuestProfileView ? (
          <GuestHeader onSignIn={handleGuestSignIn} onGoHome={() => goHome()} />
        ) : currentUser ? (
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
            onMarkAllNotificationsRead={handleMarkAllNotifsRead}
            onOpenProfile={openProfile}
            onLogout={handleLogout}
          />
        ) : undefined
      }
    >
      <section className="flex-grow flex flex-col min-w-0 min-h-0 bg-bg-primary/40 relative">
        {showAuthOnly ? (
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
        ) : activeTab === 'post' ? (
          <PostView
            post={postViewPost}
            isLoading={postViewLoading}
            error={postViewError}
            currentUser={currentUser}
            readOnly={!currentUser}
            highlightCommentId={highlightCommentId}
            commentsList={postViewId ? (postComments[postViewId] ?? []) : []}
            isCommentsExpanded={postViewId ? !!expandedComments[postViewId] : false}
            newCommentText={postViewId ? (newCommentText[postViewId] ?? '') : ''}
            replyingTo={postViewId ? (replyingTo[postViewId] ?? null) : null}
            editingPostId={editingPostId}
            editingPostContent={editingPostContent}
            editingCommentId={editingCommentId}
            editingCommentContent={editingCommentContent}
            showGuestAuth={showGuestAuth}
            isRegisterMode={isRegisterMode}
            usernameInput={usernameInput}
            passwordInput={passwordInput}
            authError={authError}
            isAuthLoading={isAuthLoading}
            onBack={() => goHome()}
            onSignIn={handleGuestSignIn}
            onAuthSubmit={handleAuthSubmit}
            onUsernameChange={setUsernameInput}
            onPasswordChange={setPasswordInput}
            onToggleAuthMode={() => {
              setIsRegisterMode(!isRegisterMode);
              setAuthError(null);
            }}
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
            onCommentTextChange={(pid, text) => setNewCommentText(prev => ({ ...prev, [pid]: text }))}
            onCancelReply={pid => setReplyingTo(prev => ({ ...prev, [pid]: null }))}
            onDeleteComment={handleDeleteComment}
            onStartCommentEdit={(id, content) => {
              setEditingCommentId(id);
              setEditingCommentContent(content);
            }}
            onCancelCommentEdit={() => setEditingCommentId(null)}
            onSaveCommentEdit={handleSaveCommentEdit}
            onEditCommentContentChange={setEditingCommentContent}
            onReply={(pid, comment: CommentNode) => setReplyingTo(prev => ({ ...prev, [pid]: comment }))}
            onToggleCommentLike={handleToggleCommentLike}
            onViewProfile={idOrUsername => {
              if (!currentUser) {
                handleGuestSignIn();
                return;
              }
              handleViewProfile(idOrUsername);
            }}
            onVotePoll={handleVotePoll}
            onRetractPollVote={handleRetractPollVote}
            onClosePoll={handleClosePoll}
            onCopyPermalink={() => postViewId && handleCopyPostPermalink(postViewId)}
            onToggleBookmark={() => postViewId && handleToggleBookmark(postViewId)}
            onShare={() => postViewId && handleSharePost(postViewId)}
            onReportPost={(postId) => handleOpenReport('post', postId)}
            onReportComment={(commentId) => handleOpenReport('comment', commentId)}
          />
        ) : activeTab === 'profile' ? (
          <ProfileView
            profileUser={profileUser}
            profilePosts={profilePosts}
            followRequests={followRequests}
            isLoading={profileLoading}
            loadError={profileError}
            profilePostsError={profilePostsError}
            currentUser={currentUser ?? undefined}
            token={token ?? undefined}
            readOnly={!currentUser}
            userSettings={effectiveSettings}
            onSettingsChange={handleSettingsChange}
            isEditing={isProfileEditing}
            isSettingsOpen={isProfileSettingsOpen}
            highlightSettings={highlightFollowRequests}
            followBusy={followBusy}
            expandedComments={expandedComments}
            postComments={postComments}
            newCommentText={newCommentText}
            replyingTo={replyingTo}
            editingPostId={editingPostId}
            editingPostContent={editingPostContent}
            editingCommentId={editingCommentId}
            editingCommentContent={editingCommentContent}
            showGuestAuth={showGuestAuth}
            isRegisterMode={isRegisterMode}
            usernameInput={usernameInput}
            passwordInput={passwordInput}
            authError={authError}
            isAuthLoading={isAuthLoading}
            onBack={() => goHome()}
            onSignIn={handleGuestSignIn}
            onAuthSubmit={handleAuthSubmit}
            onUsernameChange={setUsernameInput}
            onPasswordChange={setPasswordInput}
            onToggleAuthMode={() => {
              setIsRegisterMode(!isRegisterMode);
              setAuthError(null);
            }}
            onStartEdit={() => setIsProfileEditing(true)}
            onCancelEdit={() => setIsProfileEditing(false)}
            onProfileSaved={handleProfileSaved}
            onStartChat={startChat}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onCancelFollowRequest={handleCancelFollowRequest}
            onBlockUser={handleBlockUser}
            onUnblockUser={handleUnblockUser}
            onMuteUser={handleMuteUser}
            onUnmuteUser={handleUnmuteUser}
            onApproveFollowRequest={handleApproveFollowRequest}
            onRejectFollowRequest={handleRejectFollowRequest}
            onShowFollowers={() => setFollowersModal('followers')}
            onShowFollowing={() => setFollowersModal('following')}
            onOpenSettings={() => {
              setIsProfileSettingsOpen(true);
              fetchFollowRequests();
            }}
            onCloseSettings={() => setIsProfileSettingsOpen(false)}
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
            onToggleCommentLike={handleToggleCommentLike}
            onViewProfile={handleViewProfile}
            onVotePoll={handleVotePoll}
            onRetractPollVote={handleRetractPollVote}
            onClosePoll={handleClosePoll}
            onOpenPost={openPost}
            onCopyPermalink={profileUser ? () => handleCopyProfilePermalink(profileUser.username) : undefined}
            onReport={profileUser && currentUser && profileUser.id !== currentUser.id
              ? () => handleOpenReport('user', profileUser.id)
              : undefined}
            onReportPost={(postId) => handleOpenReport('post', postId)}
            onReportComment={(commentId) => handleOpenReport('comment', commentId)}
          />
        ) : currentUser && activeTab === 'feed' ? (
          <FeedView
            posts={posts}
            currentUser={currentUser}
            showNewPostForm={showNewPostForm}
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
            isLoadingMore={isLoadingMorePosts}
            hasMorePosts={feedNextCursor !== null}
            feedMode={feedMode}
            onFeedModeChange={handleFeedModeChange}
            onLoadMore={loadMorePosts}
            onCloseCreatePost={() => setShowNewPostForm(false)}
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
            onViewProfile={handleViewProfile}
            onDeleteComment={handleDeleteComment}
            onStartCommentEdit={(id, content) => {
              setEditingCommentId(id);
              setEditingCommentContent(content);
            }}
            onCancelCommentEdit={() => setEditingCommentId(null)}
            onSaveCommentEdit={handleSaveCommentEdit}
            onEditCommentContentChange={setEditingCommentContent}
            onReply={(postId, comment: CommentNode) => setReplyingTo(prev => ({ ...prev, [postId]: comment }))}
            onToggleCommentLike={handleToggleCommentLike}
            onVotePoll={handleVotePoll}
            onRetractPollVote={handleRetractPollVote}
            onClosePoll={handleClosePoll}
            onOpenPost={openPost}
            onReportPost={(postId) => handleOpenReport('post', postId)}
            onReportComment={(commentId) => handleOpenReport('comment', commentId)}
          />
        ) : currentUser && activeTab === 'admin' ? (
          <AdminDashboard
            adminData={adminData}
            broadcastHistory={broadcastHistory}
            adminReports={adminReports}
            currentUser={currentUser}
            onImpersonateUser={handleImpersonateUser}
            onUpdateUserRole={handleUpdateUserRole}
            onDeleteUser={handleAdminDeleteUser}
            onLoadAdminData={fetchAdminStats}
            onLoadBroadcastHistory={fetchBroadcastHistory}
            onLoadReports={fetchAdminReports}
            onReviewReport={handleReviewReport}
            onBroadcast={handleSystemBroadcast}
            onOpenProfile={openProfileByUsername}
            onOpenPost={openPost}
          />
        ) : null}

        {currentUser && activeTab !== 'admin' && (
          <FloatingActionStack
            showNewPostForm={showNewPostForm}
            showCreatePost={activeTab === 'feed'}
            showChatIcon={showChatIcon}
            showMessagesDropdown={showMessagesDropdown}
            unreadMessagesCount={unreadMessagesCount}
            messageIconPulseAt={messageIconPulseAt}
            onOpenCreatePost={() => {
              setShowMessagesDropdown(false);
              if (activeTab !== 'feed') goHome();
              setShowNewPostForm(true);
            }}
            onToggleMessages={toggleMessagesDropdown}
          />
        )}

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

        <ToastContainer toasts={toasts} onToastClick={handleToastClick} />

        {profileUserId && followersModal && token && (
          <FollowersModal
            userId={profileUserId}
            mode={followersModal}
            token={token}
            onClose={() => setFollowersModal(null)}
            onViewProfile={handleViewProfile}
          />
        )}

        {reportTarget && (
          <ReportModal
            onClose={() => setReportTarget(null)}
            onSubmit={handleSubmitReport}
          />
        )}
      </section>
    </AppShell>
  );
}
