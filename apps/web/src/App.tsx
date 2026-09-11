import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BroadcastDelivery,
  ContentReport,
  ReportListPage,
  ReportReason,
  ReportTargetType,
  Comment,
  ItemComment,
  LinkPreview,
  FollowRequest,
  MeBootstrap,
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
  notificationItemTarget,
  resolveNotificationCategory,
  SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  validatePostLimits,
  type GamificationPublic,
  type GamificationRewardPayload,
  type GamificationSettings,
  isUnavailableRepostedPost,
} from '@hin/types';
import { API_URL, WS_URL } from './config';
import { Toast, AdminData, ActiveTab, ChatRecipient, CommentNode, FeedMode } from './types/ui';
import type { CreatePostSubmitPayload } from './components/feed/CreatePostForm';
import { getPostEngagementId } from './components/feed/PostCard';
import { mergePollFromBroadcast } from './utils/pollVisibility';
import { computeOptimisticPoll } from './utils/optimisticPoll';
import { parseLocation, syncUrl, postPermalinkUrl, profilePermalinkUrl, type AdminSection } from './lib/appRoutes';
import { randomId, uploadCompressedImage } from './lib/compressImage';
import {
  loadChatState,
  saveChatState,
  clearChatState,
  getDraftForRecipient,
  pruneDraftEntry,
  subscribeChatStorage,
  type DraftEntry,
} from './lib/chatStorage';
import {
  applyDelivered,
  applyMessagesRead,
  assertChatWasmVersionCompatible,
  extractFirstUrl,
  initChatWasmBridge,
  mergeAndSortMessages,
} from './lib/chatWasmBridge';
import {
  capMessageWindow,
  mergeAndSortMessagesExcludingDeleted,
} from './lib/chatMessages';
import { addTombstone, removeTombstone } from './lib/chatDeleteTombstones';
import {
  dequeueOutbox,
  enqueueOutbox,
  loadOutbox,
  type OutboxItem,
} from './lib/chatOutbox';
import { isAllowedChatImageFile } from './lib/chatMediaMime';
import {
  createChatHistoryController,
  getChatLayer,
} from './lib/chatHistoryLayer';
import {
  isWsAccountBlockErrorCode,
  isWsAuthFailureCloseCode,
  isWsAuthFailureMessage,
  shouldReconnectAfterClose,
} from './lib/wsReconnect';
import { AppShell } from './components/layout/AppShell';
import { AppHeader } from './components/layout/AppHeader';
import { GuestHeader } from './components/layout/GuestHeader';
import { ImpersonationBanner } from './components/layout/ImpersonationBanner';
import { AuthLanding } from './components/auth/AuthLanding';
import { UsernameSetupGate } from './components/auth/UsernameSetupGate';
import { EmailVerificationGate } from './components/auth/EmailVerificationGate';
import { FeedView } from './components/feed/FeedView';
import { PostView } from './components/feed/PostView';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { ProfileView } from './components/profile/ProfileView';
import { OlabidPage } from './pages/OlabidPage';
import { OlabidItemPage } from './pages/OlabidItemPage';
import { MessagesPanel } from './components/messages/MessagesPanel';
import { ToastContainer } from './components/ui/ToastContainer';
import { FloatingActionStack } from './components/ui/FloatingActionStack';
import { FollowersModal } from './components/profile/FollowersModal';
import { ReportModal } from './components/moderation/ReportModal';
import { applyGamificationReward } from './components/gamification/GamificationToast';
import { useSessionTick } from './hooks/useSessionTick';
import { useIntroWalkthrough } from './hooks/useIntroWalkthrough';
import { useProfileTour } from './hooks/useProfileTour';
import {
  IntroWalkthrough,
  INTRO_WALKTHROUGH_STEPS,
} from './components/walkthrough/IntroWalkthrough';
import { CoachTooltip, PROFILE_TOUR_STEPS } from './components/walkthrough/CoachTooltip';
import { SearchOverlay } from './components/feed/SearchOverlay';

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
  const [feedInitialLoading, setFeedInitialLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [feedMode, setFeedMode] = useState<FeedMode>('all');
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const activeHashtagRef = useRef<string | null>(null);
  const [followedUserIds, setFollowedUserIds] = useState<Set<number>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<number>>(new Set());
  const [mutedUserIds, setMutedUserIds] = useState<Set<number>>(new Set());
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [followBusy, setFollowBusy] = useState(false);
  const [profilePostsError, setProfilePostsError] = useState<string | null>(null);
  const [followersModal, setFollowersModal] = useState<'followers' | 'following' | null>(null);
  const [highlightFollowRequests, setHighlightFollowRequests] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [settingsTourSection, setSettingsTourSection] = useState<'privacy' | 'notifications' | null>(null);
  const feedModeRef = useRef<FeedMode>('all');
  const profileUserIdRef = useRef<number | null>(null);
  const followedUserIdsRef = useRef<Set<number>>(new Set());
  const blockedUserIdsRef = useRef<Set<number>>(new Set());
  const mutedUserIdsRef = useRef<Set<number>>(new Set());
  // Removed usersRef
  const feedLoadingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');
  const [adminSection, setAdminSection] = useState<AdminSection>('dashboard');
  const [olabidItemId, setOlabidItemId] = useState<number | null>(null);

  const FEED_PAGE_SIZE = 10;

  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('hin_admin_token'));
  const [adminUser, setAdminUser] = useState<UserType | null>(() => {
    const saved = localStorage.getItem('hin_admin_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [newPostContent, setNewPostContent] = useState('');
  const [postSeedPreview, setPostSeedPreview] = useState<LinkPreview | null>(null);
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

  // Olabid item discussion — keyed by external Olabid item id.
  const [itemComments, setItemComments] = useState<Record<number, ItemComment[]>>({});
  const [newItemCommentText, setNewItemCommentText] = useState<Record<number, string>>({});
  const [replyingToItemComment, setReplyingToItemComment] = useState<Record<number, ItemComment | null>>({});
  const [editingItemCommentId, setEditingItemCommentId] = useState<number | null>(null);
  const [editingItemCommentContent, setEditingItemCommentContent] = useState('');

  const [chatRecipient, setChatRecipient] = useState<ChatRecipient | null>(() => {
    if (!localStorage.getItem('hin_token')) return null;
    return loadChatState().recipient;
  });
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatDrafts, setChatDrafts] = useState<Record<number, DraftEntry>>(() => {
    if (!localStorage.getItem('hin_token')) return {};
    return loadChatState().drafts;
  });
  const [newMsgText, setNewMsgText] = useState(() => {
    if (!localStorage.getItem('hin_token')) return '';
    const state = loadChatState();
    if (!state.recipient) return '';
    return getDraftForRecipient(state.drafts, state.recipient.id).text;
  });
  const [draftLinkPreview, setDraftLinkPreview] = useState<LinkPreview | null>(() => {
    if (!localStorage.getItem('hin_token')) return null;
    const state = loadChatState();
    if (!state.recipient) return null;
    return getDraftForRecipient(state.drafts, state.recipient.id).preview;
  });
  const [pendingChatMedia, setPendingChatMedia] = useState<{ file: File; previewUrl: string } | null>(null);
  const [sendingChatMedia, setSendingChatMedia] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatDraftsRef = useRef(chatDrafts);
  const chatMessagesRef = useRef<Message[]>([]);
  const connectWSRef = useRef<(() => void) | null>(null);
  const pendingDeletedIdsRef = useRef<Set<number>>(new Set());
  const pendingDeleteSnapshotsRef = useRef<Map<number, Message>>(new Map());
  const pendingDeleteTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const optimisticIdRef = useRef(-1);
  const pendingChatMediaRef = useRef(pendingChatMedia);
  const flushOutboxRef = useRef<(() => void) | null>(null);

  const nextOptimisticId = () => {
    const id = optimisticIdRef.current;
    optimisticIdRef.current -= 1;
    return id;
  };

  const [threads, setThreads] = useState<import('@hin/types').ChatThread[]>([]);
  const threadsRef = useRef(threads);
  const [typingUsers, setTypingUsers] = useState<Record<number, boolean>>({});
  const [lastSeenByUserId, setLastSeenByUserId] = useState<Record<number, string>>({});
  const typingTimeoutRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const typingClearTimeoutRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastTypingSentRef = useRef<Record<number, number>>({});

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showMessagesDropdown, setShowMessagesDropdown] = useState(() => {
    if (!localStorage.getItem('hin_token')) return false;
    return loadChatState().isOpen;
  });
  const [messagesPanelExpanded, setMessagesPanelExpanded] = useState(() => {
    if (!localStorage.getItem('hin_token')) return false;
    return loadChatState().isExpanded;
  });
  const [messageIconPulseAt, setMessageIconPulseAt] = useState(0);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

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
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  /** False until /api/settings/public (or bootstrap) reports the Olabid flag — keeps public /olabid shut until then. */
  const [olabidFlagKnown, setOlabidFlagKnown] = useState(false);
  const olabidFlagKnownRef = useRef(false);
  const olabidEnabledRef = useRef(false);
  const presenceEnabledRef = useRef(false);
  const [gamificationEnabled, setGamificationEnabled] = useState(false);
  const [introWalkthroughCompleted, setIntroWalkthroughCompleted] = useState<boolean | null>(null);
  const [myGamification, setMyGamification] = useState<GamificationPublic | null>(null);
  const [profileGamification, setProfileGamification] = useState<GamificationPublic | null>(null);
  const userSettingsRef = useRef<UserSettings | null>(null);

  useSessionTick(token, gamificationEnabled);

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
  const tokenRef = useRef(token);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedNotifIdsRef = useRef<Set<number>>(new Set());
  /** Sync dedupe for comment create/delete (HTTP + WS). setState updaters are async in React 18. */
  const appliedCommentCreatesRef = useRef(new Set<number>());
  const appliedCommentDeletesRef = useRef(new Set<number>());
  const appliedItemCommentCreatesRef = useRef(new Set<number>());
  const appliedItemCommentDeletesRef = useRef(new Set<number>());
  /** Dedupe unread badge bumps for the same incoming message (WS retries / StrictMode). */
  const appliedIncomingUnreadRef = useRef(new Set<number>());
  const retryHandlersRef = useRef(new Map<string, () => void>());
  const pendingPostBodiesRef = useRef(new Map<string, Record<string, unknown>>());
  const showMessagesDropdownRef = useRef(showMessagesDropdown);
  const chatRecipientRef = useRef(chatRecipient);
  const chatHistoryRef = useRef(createChatHistoryController());
  const backToMessagesListUiRef = useRef<() => void>(() => {});
  const closeMessagesPanelUiRef = useRef<() => void>(() => {});
  const handleSessionExpiredRef = useRef<() => void>(() => {});
  /** Prevents duplicate toasts when multiple in-flight requests (or StrictMode double-fetch) return 401. */
  const sessionExpiredHandledRef = useRef(false);

  const clearWsReconnectTimer = useCallback(() => {
    if (wsReconnectTimerRef.current != null) {
      clearTimeout(wsReconnectTimerRef.current);
      wsReconnectTimerRef.current = null;
    }
  }, []);

  /** Disarm handlers + cancel reconnect so logout/unmount cannot ghost-rejoin. */
  const disconnectWS = useCallback(() => {
    clearWsReconnectTimer();
    wsReadyRef.current = false;
    const socket = ws.current;
    if (!socket) return;
    socket.onclose = null;
    socket.onmessage = null;
    socket.onopen = null;
    socket.onerror = null;
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    } catch (_) {}
    ws.current = null;
  }, [clearWsReconnectTimer]);

  useEffect(() => {
    showMessagesDropdownRef.current = showMessagesDropdown;
  }, [showMessagesDropdown]);

  useEffect(() => {
    chatRecipientRef.current = chatRecipient;
  }, [chatRecipient]);

  useEffect(() => {
    chatDraftsRef.current = chatDrafts;
  }, [chatDrafts]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    pendingChatMediaRef.current = pendingChatMedia;
  }, [pendingChatMedia]);

  // PF-013: revoke pending media object URL on unmount
  useEffect(() => {
    return () => {
      const pending = pendingChatMediaRef.current;
      if (pending) URL.revokeObjectURL(pending.previewUrl);
    };
  }, []);

  // Keep per-conversation draft map in sync with the active composer.
  useEffect(() => {
    if (!chatRecipient) return;
    const id = chatRecipient.id;
    const mediaDraft = pendingChatMedia
      ? {
          fileName: pendingChatMedia.file.name,
          fileType: pendingChatMedia.file.type,
          fileSize: pendingChatMedia.file.size,
        }
      : null;
    setChatDrafts(prev => {
      const current = prev[id];
      const next = pruneDraftEntry({
        text: newMsgText,
        preview: draftLinkPreview,
        dismissedPreviewUrl: current?.dismissedPreviewUrl,
        mediaDraft,
      });
      if (!next) {
        if (!current) return prev;
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      if (
        current?.text === next.text &&
        current?.preview === next.preview &&
        current?.dismissedPreviewUrl === next.dismissedPreviewUrl &&
        JSON.stringify(current?.mediaDraft ?? null) === JSON.stringify(next.mediaDraft ?? null)
      ) {
        return prev;
      }
      return { ...prev, [id]: next };
    });
  }, [chatRecipient, newMsgText, draftLinkPreview, pendingChatMedia]);

  // Persist chat UI state so drafts + open conversation survive refresh / navigation.
  useEffect(() => {
    if (!token) {
      clearChatState();
      return;
    }
    let drafts = chatDrafts;
    if (chatRecipient) {
      drafts = { ...chatDrafts };
      const mediaDraft = pendingChatMedia
        ? {
            fileName: pendingChatMedia.file.name,
            fileType: pendingChatMedia.file.type,
            fileSize: pendingChatMedia.file.size,
          }
        : chatDrafts[chatRecipient.id]?.mediaDraft ?? null;
      const entry = pruneDraftEntry({
        text: newMsgText,
        preview: draftLinkPreview,
        dismissedPreviewUrl: chatDrafts[chatRecipient.id]?.dismissedPreviewUrl,
        mediaDraft,
      });
      if (entry) drafts[chatRecipient.id] = entry;
      else delete drafts[chatRecipient.id];
    }
    saveChatState({
      isOpen: showMessagesDropdown,
      isExpanded: messagesPanelExpanded,
      recipient: chatRecipient,
      drafts,
    });
  }, [
    token,
    showMessagesDropdown,
    messagesPanelExpanded,
    chatRecipient,
    chatDrafts,
    newMsgText,
    draftLinkPreview,
    pendingChatMedia,
  ]);

  // SC-026: sync drafts from other tabs
  useEffect(() => {
    if (!token) return;
    return subscribeChatStorage(state => {
      setChatDrafts(state.drafts);
      if (!chatRecipientRef.current) return;
      const draft = getDraftForRecipient(state.drafts, chatRecipientRef.current.id);
      setNewMsgText(draft.text);
      setDraftLinkPreview(draft.preview);
    });
  }, [token]);

  // After reload, rehydrate the open conversation's messages.
  useEffect(() => {
    if (!token || !chatRecipient) return;
    fetchMessages(chatRecipient.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once when session is ready
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void initChatWasmBridge().then(() => {
      assertChatWasmVersionCompatible();
    });
  }, [token]);

  useEffect(() => {
    feedModeRef.current = feedMode;
  }, [feedMode]);

  useEffect(() => {
    activeHashtagRef.current = activeHashtag;
  }, [activeHashtag]);

  useEffect(() => {
    profileUserIdRef.current = profileUserId;
  }, [profileUserId]);

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
    // Explore is filtered by hashtag server-side; skip live-append rather than re-parsing content client-side.
    if (mode === 'explore') return false;
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
    target?: { postId?: number; commentId?: number; olabidItemId?: number; retryKey?: string },
    opts?: { skipPrefCheck?: boolean },
  ) => {
    const settings = userSettingsRef.current;
    if (!opts?.skipPrefCheck && settings && !shouldShowNotificationToast(settings, type)) {
      return;
    }
    const id = Math.random().toString(36).substring(2, 9);
    const duration = type === 'system' ? 7000 : 4000;
    setToasts(prev => [...prev, { id, content, type, duration, ...target }]);
  };

  const showRetryToast = (message: string, retryFn: () => void) => {
    const retryKey = Math.random().toString(36).substring(2, 11);
    retryHandlersRef.current.set(retryKey, () => {
      retryHandlersRef.current.delete(retryKey);
      retryFn();
    });
    addToast(message, 'system', { retryKey }, { skipPrefCheck: true });
  };

  /** Close messages UI without touching history (history already popped or dismissing). */
  const closeMessagesPanelUi = () => {
    showMessagesDropdownRef.current = false;
    setShowMessagesDropdown(false);
    setMessagesPanelExpanded(false);
    // Preserve recipient + draft text/preview in state (and localStorage).
  };

  /** Dismiss chat history layers, then optionally run navigation that push/replaceStates. */
  const ensureMessagesClosed = (after?: () => void) => {
    closeMessagesPanelUi();
    chatHistoryRef.current.dismiss({ onSettled: after });
  };

  const goHome = (opts?: { skipUrlSync?: boolean }) => {
    const apply = () => {
      setActiveTab('feed');
      setIsSearchOpen(false);
      setProfileUserId(null);
      setProfileUser(null);
      setProfilePosts([]);
      setProfileError(null);
      setIsProfileEditing(false);
      setPostViewId(null);
      setPostViewPost(null);
      setPostViewError(null);
      setHighlightCommentId(null);
      setOlabidItemId(null);
      setShowGuestAuth(false);
      setShowNotifications(false);
      showMessagesDropdownRef.current = false;
      setShowMessagesDropdown(false);
      setMessagesPanelExpanded(false);
      // Keep chat recipient + draft so the conversation restores from localStorage.
      if (!opts?.skipUrlSync) {
        syncUrl({ view: 'home' }, true);
      }
    };
    if (showMessagesDropdownRef.current || chatHistoryRef.current.getDepth() > 0) {
      ensureMessagesClosed(apply);
    } else {
      apply();
    }
  };

  const openSearch = (opts?: { skipUrlSync?: boolean; replace?: boolean }) => {
    const apply = () => {
      setShowNotifications(false);
      showMessagesDropdownRef.current = false;
      setShowMessagesDropdown(false);
      setMessagesPanelExpanded(false);
      setIsSearchOpen(true);
      if (!opts?.skipUrlSync) {
        syncUrl({ view: 'search' }, opts?.replace);
      }
    };
    if (showMessagesDropdownRef.current || chatHistoryRef.current.getDepth() > 0) {
      ensureMessagesClosed(apply);
    } else {
      apply();
    }
  };

  const closeSearch = (opts?: { skipUrlSync?: boolean }) => {
    setIsSearchOpen(false);
    if (opts?.skipUrlSync) return;
    const route = parseLocation(window.location.pathname, window.location.hash);
    if (route.view !== 'search') return;
    if (window.history.length > 1) {
      window.history.back();
    } else {
      syncUrl({ view: 'home' }, true);
    }
  };

  const closeMessagesPanel = () => {
    ensureMessagesClosed();
  };

  const openChatInPanel = (recipient: ChatRecipient, opts?: { draft?: DraftEntry }) => {
    const draft = opts?.draft ?? getDraftForRecipient(chatDraftsRef.current, recipient.id);
    if (opts?.draft) {
      const pruned = pruneDraftEntry(opts.draft);
      setChatDrafts(prev => {
        if (!pruned) {
          if (!prev[recipient.id]) return prev;
          const { [recipient.id]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [recipient.id]: pruned };
      });
    }
    setPendingChatMedia(prev => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    chatHistoryRef.current.ensureOpenToThread();
    setChatRecipient(recipient);
    setReplyingToMessage(null);
    setNewMsgText(draft.text);
    setDraftLinkPreview(draft.preview);
    setChatMessages([]);
    fetchMessages(recipient.id);
    setThreads(prev => {
      const thread = prev.find(t => t.id === recipient.id);
      const cleared = thread?.unreadCount ?? 0;
      if (cleared > 0) {
        setUnreadMessagesCount(count => Math.max(0, count - cleared));
      }
      return prev.map(t => (t.id === recipient.id ? { ...t, unreadCount: 0 } : t));
    });
  };

  /** UI-only return to thread list (used by popstate). */
  const backToMessagesListUi = () => {
    // Drafts stay in chatDrafts (and localStorage); only clear the active composer view.
    setPendingChatMedia(prev => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setChatRecipient(null);
    setChatMessages([]);
    setReplyingToMessage(null);
    setNewMsgText('');
    setDraftLinkPreview(null);
  };

  /** Chevron Back — prefer history.back so native Back and chevron stay in sync. */
  const backToMessagesList = () => {
    const layer = getChatLayer(window.history.state);
    if (layer === 'thread' && chatHistoryRef.current.getDepth() >= 2) {
      window.history.back();
      return;
    }
    // Hydrate / shallow stack: update UI and retag without leaving the page.
    backToMessagesListUi();
    if (showMessagesDropdownRef.current) {
      chatHistoryRef.current.replaceLayer('list');
    }
  };

  backToMessagesListUiRef.current = backToMessagesListUi;
  closeMessagesPanelUiRef.current = closeMessagesPanelUi;

  const dismissDraftLinkPreview = () => {
    if (!chatRecipient || !draftLinkPreview) return;
    const dismissedUrl = draftLinkPreview.url;
    setDraftLinkPreview(null);
    setChatDrafts(prev => {
      const current = prev[chatRecipient.id] ?? { text: newMsgText, preview: null };
      return {
        ...prev,
        [chatRecipient.id]: {
          ...current,
          text: newMsgText,
          preview: null,
          dismissedPreviewUrl: dismissedUrl,
        },
      };
    });
  };

  const pickChatImage = (file: File) => {
    // Empty MIME allowed from some camera/gallery pickers; otherwise require jpeg/png/webp.
    if (file.type && !isAllowedChatImageFile(file)) {
      addToast('Please choose a JPEG, PNG, or WebP image.', 'system', undefined, {
        skipPrefCheck: true,
      });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      addToast('Image is too large (max 8MB).', 'system', undefined, { skipPrefCheck: true });
      return;
    }
    setPendingChatMedia(prev => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  };

  const clearDraftMedia = () => {
    setPendingChatMedia(prev => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const toggleMessagesDropdown = () => {
    setShowMessagesDropdown(prev => {
      const next = !prev;
      showMessagesDropdownRef.current = next;
      if (next) {
        setShowNotifications(false);
        fetchThreads();
        if (chatRecipientRef.current) {
          chatHistoryRef.current.ensureOpenToThread();
          fetchMessages(chatRecipientRef.current.id);
        } else {
          chatHistoryRef.current.ensureOpenToList();
        }
      } else {
        setMessagesPanelExpanded(false);
        chatHistoryRef.current.dismiss();
      }
      return next;
    });
  };

  const fetchMyGamification = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/me/gamification`, { headers: getHeaders() });
      if (res.ok) {
        const g: GamificationPublic = await res.json();
        setMyGamification(g);
        if (profileUserId === currentUser?.id) setProfileGamification(g);
      }
    } catch (e) {
      console.error('Error fetching gamification:', e);
    }
  };

  const fetchProfileGamification = async (userId: number) => {
    if (!token) {
      setProfileGamification(null);
      return;
    }
    const isSelf = userId === currentUser?.id;
    const url = isSelf
      ? `${API_URL}/api/me/gamification`
      : `${API_URL}/api/users/${userId}/gamification`;
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const g: GamificationPublic = await res.json();
        setProfileGamification(g);
        if (isSelf) setMyGamification(g);
      } else {
        setProfileGamification(null);
      }
    } catch {
      setProfileGamification(null);
    }
  };

  const handleToggleEquipBadge = async (badgeId: number) => {
    if (!token) return;
    const current = profileGamification?.equippedBadges ?? myGamification?.equippedBadges ?? [];
    const currentIds = current.map(b => b.id);
    const nextIds = currentIds.includes(badgeId)
      ? currentIds.filter(id => id !== badgeId)
      : [...currentIds, badgeId];

    try {
      const res = await fetch(`${API_URL}/api/me/gamification/equipped`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ badgeIds: nextIds }),
      });
      if (res.ok) {
        const g: GamificationPublic = await res.json();
        setMyGamification(g);
        setProfileGamification(g);
      }
    } catch (e) {
      console.error('Error updating equipped badges:', e);
    }
  };

  const shouldShowGamification = (g: GamificationPublic | null | undefined) => {
    if (gamificationEnabled) return true;
    if (!g) return false;
    return g.badges.length > 0 || (g.totalPoints ?? 0) > 0 || (g.level ?? 1) > 1;
  };

  const fetchBootstrap = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/me/bootstrap`, { headers: getHeaders() });
      if (res.status === 401) {
        handleSessionExpiredRef.current();
        return;
      }
      if (res.ok) {
        const data: MeBootstrap = await res.json();
        setFollowedUserIds(new Set(data.followingIds));
        setBlockedUserIds(new Set(data.blockedIds));
        setMutedUserIds(new Set(data.mutedIds));
        setUserSettings(data.userSettings);
        setSystemSettings(data.systemSettings);
        setOlabidFlagKnown(true);
        setUnreadNotifsCount(data.counts.unreadNotifications);
        setUnreadMessagesCount(data.counts.unreadMessages);
        setGamificationEnabled(!!data.gamificationEnabled);
        setMyGamification(data.g ?? null);
        setIntroWalkthroughCompleted(!!data.introWalkthroughCompleted);
        if (data.needsUsernameSetup !== undefined || data.needsEmailVerification !== undefined) {
          setCurrentUser((prev) => {
            if (!prev) return prev;
            const updatedUser = {
              ...prev,
              ...(data.needsUsernameSetup !== undefined
                ? { needsUsernameSetup: data.needsUsernameSetup }
                : {}),
              ...(data.needsEmailVerification !== undefined
                ? { needsEmailVerification: data.needsEmailVerification }
                : {}),
            };
            localStorage.setItem('hin_user', JSON.stringify(updatedUser));
            return updatedUser;
          });
        }
      }
    } catch (e) {
      console.error('Error fetching bootstrap:', e);
    }
  };

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

  const fetchFollowRequests = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/follows/requests`, { headers: getHeaders() });
      if (res.ok) setFollowRequests(await res.json());
    } catch (e) {
      console.error('Error fetching follow requests:', e);
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
    const apply = async () => {
      setIsSearchOpen(false);
      setProfileUserId(userId);
      setActiveTab('profile');
      setIsProfileEditing(false);
      setIsProfileSettingsOpen(!!opts?.highlightFollowRequests && userId === currentUser?.id);
      setShowNotifications(false);
      setShowMessagesDropdown(false);
      setMessagesPanelExpanded(false);
      setProfilePostsError(null);
      setHighlightFollowRequests(!!opts?.highlightFollowRequests);
      setShowGuestAuth(false);
      if (!opts?.skipUrlSync && opts?.username) {
        syncUrl({ view: 'profile', username: opts.username }, opts?.replace);
      }
      const user = await fetchProfile(userId);
      fetchProfilePosts(userId);
      void fetchProfileGamification(userId);
      if (userId === currentUser?.id) fetchFollowRequests();
      if (!opts?.skipUrlSync && !opts?.username && user?.username) {
        syncUrl({ view: 'profile', username: user.username }, opts?.replace);
      }
    };
    if (showMessagesDropdownRef.current || chatHistoryRef.current.getDepth() > 0) {
      ensureMessagesClosed(() => {
        void apply();
      });
    } else {
      await apply();
    }
  };

  const openProfileByUsername = async (
    username: string,
    opts?: { skipUrlSync?: boolean; replace?: boolean },
  ) => {
    const apply = async () => {
      setIsSearchOpen(false);
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
          void fetchProfileGamification(user.id);
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
    if (showMessagesDropdownRef.current || chatHistoryRef.current.getDepth() > 0) {
      ensureMessagesClosed(() => {
        void apply();
      });
    } else {
      await apply();
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

  // Treat as OFF until the public/bootstrap flag is known so /olabid never fetches early.
  const olabidEnabled = olabidFlagKnown && systemSettings?.olabidEnabled === true;
  const presenceEnabled = systemSettings?.presenceEnabled === true;
  const emailVerificationRequired = systemSettings?.emailVerificationRequired ?? true;
  const showEmailVerificationGate =
    !!currentUser?.needsEmailVerification && emailVerificationRequired;
  olabidFlagKnownRef.current = olabidFlagKnown;
  olabidEnabledRef.current = olabidEnabled;
  presenceEnabledRef.current = presenceEnabled;
  tokenRef.current = token;

  useEffect(() => {
    if (!presenceEnabled) setOnlineUserIds(new Set());
  }, [presenceEnabled]);

  const openOlabid = (opts?: { skipUrlSync?: boolean; replace?: boolean }) => {
    if (!olabidEnabled) {
      // Always leave /olabid URLs when the feature is off or still loading.
      if (olabidFlagKnown) goHome();
      return;
    }
    const apply = () => {
      setIsSearchOpen(false);
      setActiveTab('olabid');
      setOlabidItemId(null);
      setShowNotifications(false);
      setShowMessagesDropdown(false);
      setProfileUserId(null);
      if (!opts?.skipUrlSync) {
        syncUrl({ view: 'olabid' }, opts?.replace);
      }
    };
    if (showMessagesDropdownRef.current || chatHistoryRef.current.getDepth() > 0) {
      ensureMessagesClosed(apply);
    } else {
      apply();
    }
  };

  const openOlabidItem = (
    itemId: number,
    opts?: { skipUrlSync?: boolean; replace?: boolean },
  ) => {
    if (!olabidEnabled) {
      if (olabidFlagKnown) goHome();
      return;
    }
    const apply = () => {
      setIsSearchOpen(false);
      setActiveTab('olabid');
      setOlabidItemId(itemId);
      setShowNotifications(false);
      setShowMessagesDropdown(false);
      setProfileUserId(null);
      if (!opts?.skipUrlSync) {
        syncUrl({ view: 'olabid', itemId }, opts?.replace);
      }
    };
    if (showMessagesDropdownRef.current || chatHistoryRef.current.getDepth() > 0) {
      ensureMessagesClosed(apply);
    } else {
      apply();
    }
  };

  const openAdmin = (
    section: AdminSection = 'dashboard',
    opts?: { skipUrlSync?: boolean; replace?: boolean },
  ) => {
    setIsSearchOpen(false);
    setActiveTab('admin');
    setAdminSection(section);
    setProfileUserId(null);
    setIsProfileEditing(false);
    setShowNotifications(false);
    if (!opts?.skipUrlSync) {
      syncUrl({ view: 'admin', section }, opts?.replace);
    }
  };

  // Removed fetchUsers

  const fetchPosts = async (opts?: { cursor?: number | string | null; append?: boolean; mode?: FeedMode; hashtag?: string | null }) => {
    const append = opts?.append ?? false;
    const cursor = opts?.cursor ?? null;
    const mode = opts?.mode ?? feedModeRef.current;
    const hashtag = opts?.hashtag !== undefined ? opts.hashtag : activeHashtagRef.current;
    if (mode === 'explore' && !hashtag) return;
    if (append) {
      if (feedLoadingRef.current || cursor === null) return;
      feedLoadingRef.current = true;
      setIsLoadingMorePosts(true);
    } else {
      setFeedInitialLoading(true);
    }
    try {
      const params = new URLSearchParams({ limit: String(FEED_PAGE_SIZE) });
      if (cursor !== null) params.set('cursor', String(cursor));
      if (mode === 'explore' && hashtag) params.set('hashtag', hashtag);
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
      if (!append) setFeedInitialLoading(false);
    }
  };

  const loadMorePosts = useCallback(() => {
    if (feedNextCursor === null || feedLoadingRef.current) return;
    fetchPosts({ cursor: feedNextCursor, append: true, mode: feedMode, hashtag: activeHashtag });
  }, [feedNextCursor, token, feedMode, activeHashtag]);

  const handleFeedModeChange = (mode: FeedMode) => {
    if (!token && mode !== 'all' && mode !== 'explore') {
      handleGuestSignIn();
      return;
    }
    if (mode === feedMode) return;
    setFeedMode(mode);
    setPosts([]);
    setFeedNextCursor(null);
    setActiveHashtag(null);
    if (mode === 'explore') return; // ExploreHashtags picks a trending tag and calls handleSelectHashtag.
    fetchPosts({ mode, hashtag: null });
  };

  /** Switch to (or stay on) the Explore feed filtered to a specific hashtag. */
  const handleSelectHashtag = (tag: string) => {
    setFeedMode('explore');
    setActiveHashtag(tag);
    setPosts([]);
    setFeedNextCursor(null);
    fetchPosts({ mode: 'explore', hashtag: tag });
  };

  /** Navigate to the Explore feed for a hashtag clicked inside post/comment content, from any tab. */
  const handleViewHashtag = (tag: string) => {
    const apply = () => {
      setActiveTab('feed');
      setShowNotifications(false);
      setShowMessagesDropdown(false);
      handleSelectHashtag(tag);
    };
    if (showMessagesDropdownRef.current || chatHistoryRef.current.getDepth() > 0) {
      ensureMessagesClosed(apply);
    } else {
      apply();
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

  const fetchItemComments = async (olabidItemId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/olabid/items/${olabidItemId}/comments`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setItemComments(prev => ({ ...prev, [olabidItemId]: data }));
      }
    } catch (e) {
      console.error('Error fetching item comments:', e);
    }
  };

  // Draft link preview while composing a DM (debounced URL detection).
  useEffect(() => {
    const url = extractFirstUrl(newMsgText);
    const recipientIdAtStart = chatRecipient?.id ?? null;
    if (!url || !token) {
      setDraftLinkPreview(null);
      return;
    }

    const dismissedUrl = chatRecipient
      ? chatDraftsRef.current[chatRecipient.id]?.dismissedPreviewUrl ?? null
      : null;

    if (dismissedUrl && url === dismissedUrl) {
      setDraftLinkPreview(null);
      return;
    }

    // URL changed away from a previously dismissed one — allow preview again.
    if (chatRecipient && dismissedUrl && url !== dismissedUrl) {
      setChatDrafts(prev => {
        const current = prev[chatRecipient.id];
        if (!current?.dismissedPreviewUrl) return prev;
        return {
          ...prev,
          [chatRecipient.id]: { ...current, dismissedPreviewUrl: null },
        };
      });
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/link-preview?url=${encodeURIComponent(url)}`, {
          headers: getHeaders(),
        });
        // #424: ignore stale fetches after thread switch
        if (cancelled || chatRecipientRef.current?.id !== recipientIdAtStart) return;
        if (res.ok) {
          setDraftLinkPreview(await res.json());
        }
        // Keep any seeded preview on failure so share-from-item stays visible.
      } catch {
        // Keep existing draft preview
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [newMsgText, token, chatRecipient]);

  const fetchPost = async (postId: number) => {
    setPostViewLoading(true);
    setPostViewError(null);
    try {
      const postRes = await fetch(`${API_URL}/api/posts/${postId}`, { headers: getHeaders() });
      if (postRes.ok) {
        const post = await postRes.json();
        setPostViewPost(post);
        setExpandedComments(prev => ({ ...prev, [postId]: true }));
        fetchComments(postId);
      } else {
        const data = await postRes.json().catch(() => ({}));
        setPostViewPost(null);
        setPostViewError({
          status: postRes.status,
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
    const apply = () => {
      setIsSearchOpen(false);
      setActiveTab('post');
      setPostViewId(postId);
      setHighlightCommentId(opts?.commentId ?? null);
      setPostViewPost(null);
      setPostViewError(null);
      setShowNotifications(false);
      setShowMessagesDropdown(false);
      setMessagesPanelExpanded(false);
      setShowGuestAuth(false);
      if (!opts?.skipUrlSync) {
        syncUrl({ view: 'post', postId, commentId: opts?.commentId }, opts?.replace);
      }
      fetchPost(postId);
    };
    if (showMessagesDropdownRef.current || chatHistoryRef.current.getDepth() > 0) {
      ensureMessagesClosed(apply);
    } else {
      apply();
    }
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
    if (toast.retryKey) {
      const handler = retryHandlersRef.current.get(toast.retryKey);
      if (handler) handler();
      return;
    }
    if (toast.olabidItemId) {
      if (olabidEnabled) openOlabidItem(toast.olabidItemId);
      return;
    }
    if (toast.postId) {
      openPost(toast.postId, { commentId: toast.commentId });
    }
  };

  const handleGuestSignIn = (opts?: { register?: boolean }) => {
    setShowGuestAuth(true);
    if (opts?.register) setIsRegisterMode(true);
    else setIsRegisterMode(false);
    if (activeTab !== 'feed') {
      setActiveTab('feed');
      syncUrl({ view: 'home' }, true);
    }
    sessionStorage.setItem('hin_return_url', window.location.pathname + window.location.hash);
  };

  const fetchNotifications = async () => {
    if (!currentUser || !token) return;
    setNotificationsLoading(true);
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
    } finally {
      setNotificationsLoading(false);
    }
  };

  const fetchMessages = async (
    otherUserId: number,
    opts?: { sinceId?: number; markRead?: boolean; merge?: boolean },
  ) => {
    if (!currentUser || !token) return;
    const isDeltaFetch = !!(opts?.sinceId && opts.sinceId > 0);
    if (!isDeltaFetch) setMessagesLoading(true);
    try {
      const params = new URLSearchParams();
      if (opts?.sinceId && opts.sinceId > 0) params.set('sinceId', String(opts.sinceId));
      if (opts?.markRead === false) params.set('markRead', '0');
      const qs = params.toString();
      const res = await fetch(
        `${API_URL}/api/messages/${otherUserId}${qs ? `?${qs}` : ''}`,
        { headers: getHeaders() },
      );
      if (!res.ok) return;
      const data: Message[] = await res.json();
      // Always preserve in-flight optimistic / failed bubbles across full and delta fetches.
      setChatMessages(prev => {
        const pending = prev.filter(
          m => m.id < 0 || m.status === 'sending' || m.status === 'failed',
        );
        return capMessageWindow(
          mergeAndSortMessagesExcludingDeleted(data, pending, pendingDeletedIdsRef.current),
        );
      });

      // Ack delivery for incoming undelivered messages (extra safety beyond REST deliver-on-fetch).
      const undeliveredIds = data
        .filter(m => m.receiverId === currentUser.id && m.status === 'sent' && !m.deliveredAt)
        .map(m => m.id);
      if (
        undeliveredIds.length > 0 &&
        ws.current?.readyState === WebSocket.OPEN &&
        wsReadyRef.current
      ) {
        ws.current.send(JSON.stringify({ type: 'ack_delivered', payload: { messageIds: undeliveredIds } }));
      }
    } catch (e) {
      console.error('Error fetching messages:', e);
    } finally {
      if (!isDeltaFetch) setMessagesLoading(false);
    }
  };

  const fetchThreads = async () => {
    if (!token) return;
    setThreadsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/messages/threads`, { headers: getHeaders() });
      if (res.ok) {
        const data: import('@hin/types').ChatThread[] = await res.json();
        setThreads(data);
        setUnreadMessagesCount(data.reduce((sum, t) => sum + t.unreadCount, 0));
        setLastSeenByUserId(prev => {
          const next = { ...prev };
          for (const t of data) {
            if (t.lastSeenAt) next[t.id] = t.lastSeenAt;
          }
          return next;
        });
      }
    } catch (e) {
      console.error('Error fetching threads:', e);
    } finally {
      setThreadsLoading(false);
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
    // PR-019: do not send typing to blocked users
    if (blockedUserIdsRef.current.has(recipientId)) return;
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

  // Public feature flags (no auth) — guests + logged-out users; also blocks public /olabid until known.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/settings/public`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { olabidEnabled?: boolean; presenceEnabled?: boolean };
        if (cancelled) return;
        setSystemSettings(prev => ({
          ...(prev ?? DEFAULT_SYSTEM_SETTINGS),
          olabidEnabled: data.olabidEnabled === true,
          presenceEnabled: data.presenceEnabled === true,
        }));
        setOlabidFlagKnown(true);
      } catch {
        // If the flag can't be loaded, keep Olabid shut (no public API traffic).
        if (!cancelled) {
          setSystemSettings(prev => ({
            ...(prev ?? DEFAULT_SYSTEM_SETTINGS),
            olabidEnabled: false,
            presenceEnabled: false,
          }));
          setOlabidFlagKnown(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When the flag becomes known (or flips off), resolve any /olabid deep link — open or leave.
  useEffect(() => {
    if (!olabidFlagKnown) return;
    const route = parseLocation(window.location.pathname, window.location.hash);
    if (route.view !== 'olabid') {
      if (!olabidEnabled && activeTab === 'olabid') goHome();
      return;
    }
    if (!olabidEnabled) {
      goHome();
      return;
    }
    if (route.itemId) openOlabidItem(route.itemId, { skipUrlSync: true, replace: true });
    else openOlabid({ skipUrlSync: true, replace: true });
  }, [olabidFlagKnown, olabidEnabled]);

  useEffect(() => {
    if (token) {
      fetchPosts();
      fetchBootstrap();
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
      setSystemSettings(prev => ({
        ...DEFAULT_SYSTEM_SETTINGS,
        olabidEnabled: prev?.olabidEnabled ?? DEFAULT_SYSTEM_SETTINGS.olabidEnabled,
        presenceEnabled: prev?.presenceEnabled ?? DEFAULT_SYSTEM_SETTINGS.presenceEnabled,
      }));
      setOnlineUserIds(new Set());
      setUnreadNotifsCount(0);
      setUnreadMessagesCount(0);
      appliedIncomingUnreadRef.current.clear();
      setIntroWalkthroughCompleted(null);
    }
  }, [token]);

  useEffect(() => {
    if (token || activeTab !== 'feed' || showGuestAuth) return;
    fetchPosts({ mode: feedMode, hashtag: activeHashtag });
  }, [token, activeTab, showGuestAuth]);

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
      disconnectWS();
      return;
    }
    if (currentUser.needsUsernameSetup) {
      disconnectWS();
      return;
    }
    if (showEmailVerificationGate) {
      disconnectWS();
      return;
    }

    const appendChatMessage = (msg: Message) => {
      setChatMessages(prev =>
        capMessageWindow(
          mergeAndSortMessagesExcludingDeleted(prev, [msg], pendingDeletedIdsRef.current),
        ),
      );
    };

    const markSendingFailed = () => {
      setChatMessages(prev =>
        prev.map(m => (m.status === 'sending' ? { ...m, status: 'failed' as const } : m)),
      );
    };

    const syncAfterReconnect = () => {
      void fetchThreads();
      const recipient = chatRecipientRef.current;
      if (!recipient || !showMessagesDropdownRef.current) return;
      const maxId = chatMessagesRef.current.reduce(
        (max, m) => (m.id > max ? m.id : max),
        0,
      );
      if (maxId > 0) {
        void fetchMessages(recipient.id, { sinceId: maxId, markRead: false, merge: true });
      } else {
        void fetchMessages(recipient.id);
      }
    };

    const connectWS = () => {
      clearWsReconnectTimer();
      if (ws.current) {
        const prev = ws.current;
        prev.onclose = null;
        prev.onmessage = null;
        prev.onopen = null;
        prev.onerror = null;
        if (prev.readyState === WebSocket.OPEN || prev.readyState === WebSocket.CONNECTING) {
          try {
            prev.close();
          } catch (_) {}
        }
      }
      wsReadyRef.current = false;
      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        const liveToken = tokenRef.current;
        if (!liveToken) {
          disconnectWS();
          return;
        }
        socket.send(JSON.stringify({ type: 'join', payload: { token: liveToken } }));
      };

      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          switch (message.type) {
            case 'joined':
              wsReadyRef.current = true;
              sendActiveChat();
              syncAfterReconnect();
              flushOutboxRef.current?.();
              break;
            case 'error': {
              if (isWsAccountBlockErrorCode(message.payload?.code)) {
                break;
              }
              if (isWsAuthFailureMessage(message.payload?.message)) {
                handleSessionExpiredRef.current();
              }
              break;
            }
            case 'presence_snapshot': {
              if (!presenceEnabledRef.current) break;
              const ids: number[] = message.payload.onlineUserIds || [];
              setOnlineUserIds(new Set(ids));
              break;
            }
            case 'user_online':
              if (!presenceEnabledRef.current) break;
              setOnlineUserIds(prev => {
                const next = new Set(prev);
                next.add(message.payload.userId);
                return next;
              });
              break;
            case 'user_offline':
              if (!presenceEnabledRef.current) break;
              setOnlineUserIds(prev => {
                const next = new Set(prev);
                next.delete(message.payload.userId);
                return next;
              });
              if (typeof message.payload.lastSeenAt === 'string') {
                const uid = message.payload.userId as number;
                const lastSeenAt = message.payload.lastSeenAt as string;
                setLastSeenByUserId(prev => ({ ...prev, [uid]: lastSeenAt }));
              }
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
                  setTypingUsers(prev => ({ ...prev, [msg.senderId]: false }));
                  if (typingClearTimeoutRef.current[msg.senderId]) {
                    clearTimeout(typingClearTimeoutRef.current[msg.senderId]);
                    delete typingClearTimeoutRef.current[msg.senderId];
                  }
                  fetch(`${API_URL}/api/messages/read/${partnerId}`, {
                    method: 'POST',
                    headers: getHeaders(),
                  });
                }
              }

              if (isIncoming && !isViewingChat) {
                // Dedupe by message id (duplicate WS / reconnect). Never call setState
                // setters as side effects inside another updater — Strict Mode re-runs
                // updaters and was double-counting the badge.
                const alreadyCounted =
                  msg.id > 0 && appliedIncomingUnreadRef.current.has(msg.id);
                if (msg.id > 0) appliedIncomingUnreadRef.current.add(msg.id);

                const lastMessage = {
                  id: msg.id,
                  content: msg.content.trim() ? msg.content : msg.mediaUrl ? 'Photo' : '',
                  createdAt: msg.createdAt,
                  senderId: msg.senderId,
                  read: false as const,
                  status: msg.status,
                };

                if (alreadyCounted) {
                  setThreads(prev =>
                    prev.map(t => (t.id === partnerId ? { ...t, lastMessage } : t)),
                  );
                } else {
                  setMessageIconPulseAt(Date.now());
                  const hasThread = threadsRef.current.some(t => t.id === partnerId);
                  if (!hasThread) {
                    void fetchThreads();
                  } else {
                    setUnreadMessagesCount(count => count + 1);
                    setThreads(prev =>
                      prev.map(t =>
                        t.id === partnerId
                          ? { ...t, unreadCount: t.unreadCount + 1, lastMessage }
                          : t,
                      ),
                    );
                  }
                }
              } else {
                setThreads(prev => {
                  const idx = prev.findIndex(t => t.id === partnerId);
                  if (idx === -1) return prev;
                  return prev.map(t =>
                    t.id === partnerId
                      ? {
                          ...t,
                          lastMessage: {
                            id: msg.id,
                            content: msg.content.trim()
                              ? msg.content
                              : msg.mediaUrl
                                ? 'Photo'
                                : '',
                            createdAt: msg.createdAt,
                            senderId: msg.senderId,
                            read: msg.read,
                            status: msg.status,
                          },
                        }
                      : t,
                  );
                });
              }

              break;
            }
            case 'message_updated': {
              const msg: Message = message.payload;
              const partnerId = msg.senderId === currentUser!.id ? msg.receiverId : msg.senderId;
              if (chatRecipientRef.current?.id === partnerId) {
                setChatMessages(prev =>
                  capMessageWindow(
                    mergeAndSortMessagesExcludingDeleted(prev, [msg], pendingDeletedIdsRef.current),
                  ),
                );
              }
              break;
            }
            case 'message_delivered': {
              const { messageIds, deliveredAt } = message.payload as {
                messageIds: number[];
                deliveredAt: string;
              };
              const idSet = new Set(messageIds);
              setChatMessages(prev => applyDelivered(prev, messageIds, deliveredAt));
              setThreads(prev =>
                prev.map(t => {
                  if (!t.lastMessage?.id || !idSet.has(t.lastMessage.id)) return t;
                  if (t.lastMessage.status === 'read' || t.lastMessage.read) return t;
                  return {
                    ...t,
                    lastMessage: { ...t.lastMessage, status: 'delivered' as const },
                  };
                }),
              );
              break;
            }
            case 'message_deleted': {
              const { messageId, conversationPeerId } = message.payload as {
                messageId: number;
                conversationPeerId: number;
              };
              const timer = pendingDeleteTimersRef.current.get(messageId);
              if (timer) {
                clearTimeout(timer);
                pendingDeleteTimersRef.current.delete(messageId);
              }
              pendingDeleteSnapshotsRef.current.delete(messageId);
              pendingDeletedIdsRef.current = addTombstone(pendingDeletedIdsRef.current, messageId);
              setChatMessages(prev => prev.filter(m => m.id !== messageId));
              setReplyingToMessage(prev => (prev?.id === messageId ? null : prev));
              setThreads(prev => {
                const hit = prev.find(t => t.id === conversationPeerId);
                if (!hit?.lastMessage || hit.lastMessage.id !== messageId) return prev;
                void fetchThreads();
                return prev;
              });
              break;
            }
            case 'messages_read': {
              const { senderId, receiverId, readAt } = message.payload as {
                senderId: number;
                receiverId: number;
                readAt?: string;
              };
              const readAtIso = readAt || new Date().toISOString();
              if (currentUser!.id === senderId) {
                setChatMessages(prev =>
                  applyMessagesRead(prev, { senderId, receiverId, readAt: readAtIso }),
                );
              }
              setThreads(prev =>
                prev.map(t => {
                  if (t.id !== receiverId || !t.lastMessage || t.lastMessage.senderId !== senderId) return t;
                  return {
                    ...t,
                    lastMessage: { ...t.lastMessage, read: true, status: 'read' as const },
                  };
                }),
              );
              break;
            }
            case 'typing': {
              const senderId = message.payload.senderId as number;
              const isTyping = !!message.payload.isTyping;
              setTypingUsers(prev => ({ ...prev, [senderId]: isTyping }));
              if (typingClearTimeoutRef.current[senderId]) {
                clearTimeout(typingClearTimeoutRef.current[senderId]);
                delete typingClearTimeoutRef.current[senderId];
              }
              if (isTyping) {
                typingClearTimeoutRef.current[senderId] = setTimeout(() => {
                  setTypingUsers(prev => ({ ...prev, [senderId]: false }));
                  delete typingClearTimeoutRef.current[senderId];
                }, 3000);
              }
              break;
            }
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
                const itemTarget = notificationItemTarget(notif);
                const postTarget = notificationPostTarget(notif);
                addToast(
                  notif.content,
                  'like',
                  itemTarget
                    ? { olabidItemId: itemTarget.olabidItemId, commentId: itemTarget.commentId }
                    : postTarget
                      ? { postId: postTarget.postId, commentId: postTarget.commentId }
                      : undefined,
                  { skipPrefCheck: true },
                );
              } else if (notif.type === 'comment' && showToast('comment')) {
                const itemTarget = notificationItemTarget(notif);
                const postTarget = notificationPostTarget(notif);
                addToast(
                  notif.content,
                  'comment',
                  itemTarget
                    ? { olabidItemId: itemTarget.olabidItemId, commentId: itemTarget.commentId }
                    : postTarget
                      ? { postId: postTarget.postId, commentId: postTarget.commentId }
                      : undefined,
                  { skipPrefCheck: true },
                );
              } else if (notif.type === 'mention' && showToast('mention')) {
                const target = notificationPostTarget(notif);
                addToast(notif.content, 'mention', target ? { postId: target.postId, commentId: target.commentId } : undefined, { skipPrefCheck: true });
              } else if (
                (notif.type === 'follow' || notif.type === 'follow_request' || notif.type === 'follow_accepted') &&
                showToast(notif.type)
              ) {
                addToast(notif.content, notif.type, undefined, { skipPrefCheck: true });
              } else if (notif.type === 'badge_award' && showToast('badge_award')) {
                addToast(notif.content, 'badge_award', undefined, { skipPrefCheck: true });
                void fetchMyGamification();
              } else if (notif.type === 'level_up' && showToast('level_up')) {
                addToast(notif.content, 'level_up', undefined, { skipPrefCheck: true });
                void fetchMyGamification();
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
            case 'gamification_reward': {
              applyGamificationReward(message.payload as GamificationRewardPayload, {
                addToast,
                onRefresh: () => { void fetchMyGamification(); },
              });
              break;
            }
            case 'gamification_settings_changed': {
              const { settings } = message.payload as { settings: GamificationSettings };
              setGamificationEnabled(settings.gamificationEnabled);
              if (settings.gamificationEnabled) {
                void fetchBootstrap();
                void fetchPosts();
                const pid = profileUserIdRef.current;
                if (pid != null) {
                  void fetchProfileGamification(pid);
                  void fetchProfilePosts(pid);
                }
              } else {
                setMyGamification(null);
                setProfileGamification(null);
              }
              break;
            }
            case 'system_settings_changed': {
              const { settings } = message.payload as { settings: SystemSettings };
              setSystemSettings(settings);
              setOlabidFlagKnown(true);
              if (settings.presenceEnabled !== true) {
                setOnlineUserIds(new Set());
              }
              break;
            }
            case 'post_created': {
              const { post } = message.payload;
              if (!shouldShowPostInFeed(post, currentUser!.id)) break;
              setPosts(prev => {
                if (prev.some(p => p.id === post.id)) return prev;
                // Reconcile optimistic create: swap own pending row instead of duplicating.
                const pendingIdx = prev.findIndex(
                  p =>
                    (p.isPending || p.isError) &&
                    p.userId === post.userId &&
                    p.userId === currentUser!.id,
                );
                if (pendingIdx >= 0) {
                  const next = [...prev];
                  next[pendingIdx] = {
                    ...post,
                    isPending: false,
                    isError: false,
                    clientPostKey: undefined,
                  };
                  return next;
                }
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
            case 'repost_count_update': {
              const { postId, repostsCount, userId, reposted } = message.payload;
              const mergeRepost = (p: import('@hin/types').Post): import('@hin/types').Post => {
                let next = p;
                if (p.id === postId) {
                  next = {
                    ...p,
                    repostsCount,
                    hasReposted: userId === currentUser!.id ? reposted : p.hasReposted,
                  };
                }
                if (
                  p.repostedPost &&
                  !isUnavailableRepostedPost(p.repostedPost) &&
                  p.repostedPost.id === postId
                ) {
                  next = {
                    ...next,
                    repostedPost: {
                      ...p.repostedPost,
                      repostsCount,
                      hasReposted:
                        userId === currentUser!.id ? reposted : p.repostedPost.hasReposted,
                    },
                  };
                }
                return next;
              };
              setPosts(prev => prev.map(mergeRepost));
              setProfilePosts(prev => prev.map(mergeRepost));
              setPostViewPost(prev => (prev ? mergeRepost(prev) : prev));
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
            case 'item_comment_like_update': {
              const { commentId, olabidItemId, likesCount, userId, liked } = message.payload;
              setItemComments(prev => ({
                ...prev,
                [olabidItemId]: (prev[olabidItemId] || []).map(c =>
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
            case 'item_comment_created': {
              const { comment } = message.payload;
              if (appliedItemCommentCreatesRef.current.has(comment.id)) break;
              appliedItemCommentCreatesRef.current.add(comment.id);
              setItemComments(prev => {
                const list = prev[comment.olabidItemId] || [];
                if (list.some(c => c.id === comment.id)) return prev;
                return { ...prev, [comment.olabidItemId]: [comment, ...list] };
              });
              break;
            }
            case 'item_comment_deleted': {
              const { commentId, olabidItemId } = message.payload;
              if (appliedItemCommentDeletesRef.current.has(commentId)) break;
              appliedItemCommentDeletesRef.current.add(commentId);
              setItemComments(prev => ({
                ...prev,
                [olabidItemId]: (prev[olabidItemId] || []).map(c =>
                  c.id === commentId
                    ? { ...c, deletedAt: new Date().toISOString(), username: 'deleted', content: '[Comment deleted]' }
                    : c
                ),
              }));
              break;
            }
            case 'item_comment_updated': {
              const { comment } = message.payload;
              setItemComments(prev => ({
                ...prev,
                [comment.olabidItemId]: (prev[comment.olabidItemId] || []).map(c =>
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

      socket.onclose = (event) => {
        wsReadyRef.current = false;
        markSendingFailed();
        if (isWsAuthFailureCloseCode(event.code)) {
          handleSessionExpiredRef.current();
          return;
        }
        if (!shouldReconnectAfterClose({ closeCode: event.code, hasToken: !!tokenRef.current })) {
          return;
        }
        clearWsReconnectTimer();
        wsReconnectTimerRef.current = setTimeout(() => {
          wsReconnectTimerRef.current = null;
          if (tokenRef.current) connectWS();
        }, 3000);
      };
    };

    connectWSRef.current = connectWS;
    connectWS();

    const onOnline = () => {
      const state = ws.current?.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
      connectWS();
    };
    window.addEventListener('online', onOnline);

    return () => {
      connectWSRef.current = null;
      window.removeEventListener('online', onOnline);
      disconnectWS();
    };
  }, [currentUser, token, showEmailVerificationGate, clearWsReconnectTimer, disconnectWS]);

  // Auto-scroll is owned by MessagesPanel (smart near-bottom + new-messages pill).

  const completeAuthSuccess = useCallback((data: { token: string; user: UserType }) => {
    sessionExpiredHandledRef.current = false;
    setToken(data.token);
    setCurrentUser(data.user);
    localStorage.setItem('hin_token', data.token);
    localStorage.setItem('hin_user', JSON.stringify(data.user));
    setUsernameInput('');
    setEmailInput('');
    setPasswordInput('');
    setAuthError(null);
    setShowGuestAuth(false);
    const route = parseLocation(window.location.pathname, window.location.hash);
    if (route.view === 'post') {
      openPost(route.postId, { commentId: route.commentId, skipUrlSync: true });
    } else if (route.view === 'profile') {
      openProfileByUsername(route.username, { skipUrlSync: true });
    } else if (route.view === 'search') {
      openSearch({ skipUrlSync: true });
    } else if (route.view === 'olabid') {
      // Deferred until olabidFlagKnown — see effect that resolves /olabid deep links.
    }
  }, []);

  const getOrCreateSessionId = () => {
    let sessionId = sessionStorage.getItem('hin_session_id');
    if (!sessionId) {
      sessionId = randomId();
      sessionStorage.setItem('hin_session_id', sessionId);
    }
    return sessionId;
  };

  const handleAuthSubmit = async (e: React.FormEvent, turnstileToken?: string) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput) {
      setAuthError('Please fill in all fields');
      return;
    }
    if (isRegisterMode && !emailInput.trim()) {
      setAuthError('Email is required');
      return;
    }
    setAuthError(null);
    setIsAuthLoading(true);
    const path = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    const sessionId = getOrCreateSessionId();

    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput.trim(),
          ...(isRegisterMode ? { email: emailInput.trim() } : {}),
          password: passwordInput,
          clientLocalTime: new Date().toISOString(),
          sessionId,
          turnstileToken,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        completeAuthSuccess(data);
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch {
      setAuthError('Error connecting to authentication service');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setAuthError(null);
    setIsAuthLoading(true);
    const sessionId = getOrCreateSessionId();

    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential,
          clientLocalTime: new Date().toISOString(),
          sessionId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        completeAuthSuccess(data);
      } else {
        setAuthError(data.error || 'Google sign-in failed');
      }
    } catch {
      setAuthError('Error connecting to authentication service');
    } finally {
      setIsAuthLoading(false);
    }
  };


  const handleLogout = () => {
    // Fire-and-forget logout audit event
    const sessionId = sessionStorage.getItem('hin_session_id');
    const userId = currentUser?.id;
    const logoutToken = token;
    if (logoutToken) {
      fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${logoutToken}` },
        body: JSON.stringify({
          userId,
          clientLocalTime: new Date().toISOString(),
          sessionId,
        }),
      }).catch(() => {}); // Never block logout on audit failure
      // Drop this device's push subscription so shared devices don't get ghost alerts.
      import('./lib/push-client')
        .then(({ unregisterPushSubscription }) => unregisterPushSubscription(logoutToken))
        .catch(() => {});
    }
    sessionStorage.removeItem('hin_session_id');
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem('hin_token');
    localStorage.removeItem('hin_user');
    localStorage.removeItem('hin_admin_token');
    localStorage.removeItem('hin_admin_user');
    clearChatState();
    setAdminToken(null);
    setAdminUser(null);
    setChatRecipient(null);
    setChatMessages([]);
    setChatDrafts({});
    setPendingChatMedia(prev => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setNewMsgText('');
    setDraftLinkPreview(null);
    closeMessagesPanelUi();
    chatHistoryRef.current.dismiss();
    setNotifications([]);
    setUnreadNotifsCount(0);
    setActiveTab('feed');
    processedNotifIdsRef.current.clear();
    setOnlineUserIds(new Set());
    disconnectWS();
  };

  /** Stale/invalid JWT — clear local session and prompt sign-in. */
  const handleSessionExpired = (opts?: { force?: boolean }) => {
    if (!opts?.force && sessionExpiredHandledRef.current) return;
    sessionExpiredHandledRef.current = true;
    addToast('Your session expired. Please sign in again.', 'system', undefined, { skipPrefCheck: true });
    handleLogout();
    handleGuestSignIn();
  };

  useEffect(() => {
    handleSessionExpiredRef.current = () => handleSessionExpired();
  });

  const applyPollUpdate = (postId: number, poll: Poll) => {
    const merge = (p: import('@hin/types').Post) =>
      p.id === postId ? { ...p, poll } : p;
    setPosts(prev => prev.map(merge));
    setProfilePosts(prev => prev.map(merge));
    setPostViewPost(prev => (prev?.id === postId ? merge(prev) : prev));
  };

  const replacePostByTempKey = (
    tempId: number,
    clientPostKey: string | undefined,
    serverPost: import('@hin/types').Post,
  ) => {
    const merge = (p: import('@hin/types').Post) =>
      p.id === tempId || (clientPostKey && p.clientPostKey === clientPostKey)
        ? { ...serverPost, isPending: false, isError: false, clientPostKey: undefined }
        : p;
    setPosts(prev => {
      if (prev.some(p => p.id === serverPost.id && p.id !== tempId)) {
        return prev.filter(p => p.id !== tempId && p.clientPostKey !== clientPostKey);
      }
      return prev.map(merge);
    });
    setProfilePosts(prev => {
      if (prev.some(p => p.id === serverPost.id && p.id !== tempId)) {
        return prev.filter(p => p.id !== tempId && p.clientPostKey !== clientPostKey);
      }
      return prev.map(merge);
    });
    setPostViewPost(prev => (prev ? merge(prev) : prev));
  };

  const removeTempPost = (tempId: number, clientPostKey?: string) => {
    const match = (p: import('@hin/types').Post) =>
      p.id === tempId || (!!clientPostKey && p.clientPostKey === clientPostKey);
    setPosts(prev => prev.filter(p => !match(p)));
    setProfilePosts(prev => prev.filter(p => !match(p)));
    setPostViewPost(prev => (prev && match(prev) ? null : prev));
  };

  const markTempPostError = (tempId: number, clientPostKey?: string) => {
    const mark = (p: import('@hin/types').Post) =>
      p.id === tempId || (clientPostKey && p.clientPostKey === clientPostKey)
        ? { ...p, isPending: false, isError: true }
        : p;
    setPosts(prev => prev.map(mark));
    setProfilePosts(prev => prev.map(mark));
    setPostViewPost(prev => (prev ? mark(prev) : prev));
  };

  const handleCreatePost = async (_e: React.FormEvent, payload: CreatePostSubmitPayload) => {
    if (!currentUser) return;
    if (payload.kind === 'text' && !newPostContent.trim()) return;
    if (payload.kind === 'poll' && !payload.poll.question.trim()) return;

    const content =
      payload.kind === 'poll' ? newPostContent.trim() : newPostContent;
    const body =
      payload.kind === 'poll'
        ? {
            type: 'poll' as const,
            content,
            mediaUrls: payload.mediaUrls.length ? payload.mediaUrls : undefined,
            visibility: payload.visibility,
            ...payload.poll,
          }
        : {
            content,
            mediaUrls: payload.mediaUrls.length ? payload.mediaUrls : undefined,
            visibility: payload.visibility,
          };

    const clientPostKey = randomId();
    const tempId = -Date.now();
    const optimisticPoll =
      payload.kind === 'poll'
        ? {
            id: tempId,
            postId: tempId,
            question: payload.poll.question,
            endsAt: payload.poll.endsAt ?? null,
            maxSelections: payload.poll.maxSelections,
            allowVoteChange: payload.poll.allowVoteChange,
            allowVoteRetraction: payload.poll.allowVoteRetraction,
            isAnonymous: payload.poll.isAnonymous,
            resultsVisibility: payload.poll.resultsVisibility,
            status: 'open' as const,
            totalVotes: 0,
            options: payload.poll.options.map((opt, i) => ({
              id: -(i + 1),
              position: i,
              label: opt.label,
              voteCount: 0,
              votePercent: 0,
            })),
            userVoteOptionIds: [] as number[],
            showResults: true,
            isExpired: false,
          }
        : undefined;

    const tempPost: import('@hin/types').Post = {
      id: tempId,
      userId: currentUser.id,
      username: currentUser.username,
      authorAvatarUrl: currentUser.avatarUrl,
      authorRole: currentUser.role,
      authorEquippedBadges: currentUser.equippedBadges,
      type: payload.kind === 'poll' ? 'poll' : 'text',
      content,
      mediaUrls: payload.mediaUrls,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      commentsCount: 0,
      hasLiked: false,
      hasBookmarked: false,
      visibility: payload.visibility,
      poll: optimisticPoll,
      linkPreview: postSeedPreview,
      isPending: true,
      clientPostKey,
    };

    setPosts(prev => [tempPost, ...prev]);
    if (profileUserId === currentUser.id) {
      setProfilePosts(prev => [tempPost, ...prev]);
      setProfileUser(prev => (prev ? { ...prev, postCount: (prev.postCount || 0) + 1 } : prev));
    }
    setNewPostContent('');
    setPostSeedPreview(null);
    setShowNewPostForm(false);
    pendingPostBodiesRef.current.set(clientPostKey, body as Record<string, unknown>);

    await persistOptimisticPost(tempId, clientPostKey, body as Record<string, unknown>);
  };

  const persistOptimisticPost = async (
    tempId: number,
    clientPostKey: string | undefined,
    body: Record<string, unknown>,
  ) => {
    if (!currentUser) return;
    const markPending = (p: import('@hin/types').Post) =>
      p.id === tempId || (clientPostKey && p.clientPostKey === clientPostKey)
        ? { ...p, isPending: true, isError: false }
        : p;
    setPosts(prev => prev.map(markPending));
    setProfilePosts(prev => prev.map(markPending));

    try {
      const res = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        markTempPostError(tempId, clientPostKey);
        showRetryToast((data.error as string) || 'Failed to send — Tap to retry', () => {
          void persistOptimisticPost(tempId, clientPostKey, body);
        });
        return;
      }
      const newPost = await res.json();
      if (clientPostKey) pendingPostBodiesRef.current.delete(clientPostKey);
      replacePostByTempKey(tempId, clientPostKey, newPost);
      setNewlyCreatedPostId(newPost.id);
      setTimeout(() => setNewlyCreatedPostId(null), 3000);
      if (newPost.g) {
        void fetchMyGamification();
        if ((newPost.g.pe ?? 0) > 0) {
          addToast(`+${newPost.g.pe} points earned!`, 'badge_award', undefined, {
            skipPrefCheck: true,
          });
        }
      }
    } catch (err) {
      console.error(err);
      markTempPostError(tempId, clientPostKey);
      showRetryToast('Failed to send — Tap to retry', () => {
        void persistOptimisticPost(tempId, clientPostKey, body);
      });
    }
  };

  const handleRetryPendingPost = (postId: number) => {
    const source =
      posts.find(p => p.id === postId) ||
      profilePosts.find(p => p.id === postId);
    if (!source?.isError || !source.clientPostKey) return;
    const body = pendingPostBodiesRef.current.get(source.clientPostKey);
    if (!body) {
      removeTempPost(postId, source.clientPostKey);
      if (profileUserId === currentUser?.id) {
        setProfileUser(prev =>
          prev ? { ...prev, postCount: Math.max(0, (prev.postCount || 0) - 1) } : prev,
        );
      }
      setNewPostContent(source.content);
      setShowNewPostForm(true);
      return;
    }
    void persistOptimisticPost(postId, source.clientPostKey, body);
  };

  const updatePostInState = (updated: import('@hin/types').Post) => {
    const merge = (p: import('@hin/types').Post) => (p.id === updated.id ? updated : p);
    setPosts(prev => prev.map(merge));
    setProfilePosts(prev => prev.map(merge));
    setPostViewPost(prev => (prev?.id === updated.id ? updated : prev));
  };

  const handlePinPost = async (postId: number) => {
    const source =
      posts.find(p => p.id === postId) ||
      profilePosts.find(p => p.id === postId) ||
      (postViewPost?.id === postId ? postViewPost : null);
    if (!source || source.isPending) return;
    const prevPinnedAt = source.pinnedAt ?? null;
    const optimistic = { ...source, pinnedAt: new Date().toISOString() };
    updatePostInState(optimistic);

    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/pin`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        updatePostInState({ ...source, pinnedAt: prevPinnedAt });
        showRetryToast(data.error || 'Failed to pin — Tap to retry', () => {
          void handlePinPost(postId);
        });
        return;
      }
      const updated = await res.json();
      updatePostInState(updated);
      if (profileUserId) fetchProfilePosts(profileUserId);
      addToast('Post pinned to profile', 'system', undefined, { skipPrefCheck: true });
    } catch (e) {
      console.error(e);
      updatePostInState({ ...source, pinnedAt: prevPinnedAt });
      showRetryToast('Failed to pin — Tap to retry', () => {
        void handlePinPost(postId);
      });
    }
  };

  const handleUnpinPost = async (postId: number) => {
    const source =
      posts.find(p => p.id === postId) ||
      profilePosts.find(p => p.id === postId) ||
      (postViewPost?.id === postId ? postViewPost : null);
    if (!source || source.isPending) return;
    const prevPinnedAt = source.pinnedAt ?? null;
    const optimistic = { ...source, pinnedAt: null };
    updatePostInState(optimistic);

    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/pin`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        updatePostInState({ ...source, pinnedAt: prevPinnedAt });
        showRetryToast(data.error || 'Failed to unpin — Tap to retry', () => {
          void handleUnpinPost(postId);
        });
        return;
      }
      const updated = await res.json();
      updatePostInState(updated);
      if (profileUserId) fetchProfilePosts(profileUserId);
      addToast('Post unpinned', 'system', undefined, { skipPrefCheck: true });
    } catch (e) {
      console.error(e);
      updatePostInState({ ...source, pinnedAt: prevPinnedAt });
      showRetryToast('Failed to unpin — Tap to retry', () => {
        void handleUnpinPost(postId);
      });
    }
  };

  const handleDeleteAccount = async (password: string) => {
    try {
      const res = await fetch(`${API_URL}/api/users/me`, {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to delete account' };
      }
      handleLogout();
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to delete account' };
    }
  };

  const handleVotePoll = async (postId: number, optionIds: number[]) => {
    if (postId <= 0 || optionIds.some(id => id <= 0)) return;
    const source =
      posts.find(p => p.id === postId) ||
      profilePosts.find(p => p.id === postId) ||
      (postViewPost?.id === postId ? postViewPost : null);
    const prevPoll = source?.poll;
    if (!prevPoll || source.isPending) return;

    const isAuthor = !!currentUser && source.userId === currentUser.id;
    applyPollUpdate(postId, computeOptimisticPoll(prevPoll, optionIds, 'vote', isAuthor));

    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/poll/vote`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ optionIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        applyPollUpdate(postId, prevPoll);
        showRetryToast(data.error || 'Failed to vote — Tap to retry', () => {
          void handleVotePoll(postId, optionIds);
        });
        throw new Error(data.error || 'Failed to vote');
      }
      const { poll } = await res.json();
      applyPollUpdate(postId, poll);
    } catch (e) {
      if (!(e instanceof Error) || e.name === 'TypeError') {
        applyPollUpdate(postId, prevPoll);
        showRetryToast('Failed to vote — Tap to retry', () => {
          void handleVotePoll(postId, optionIds);
        });
      }
      throw e instanceof Error ? e : new Error('Failed to vote');
    }
  };

  const handleRetractPollVote = async (postId: number) => {
    if (postId <= 0) return;
    const source =
      posts.find(p => p.id === postId) ||
      profilePosts.find(p => p.id === postId) ||
      (postViewPost?.id === postId ? postViewPost : null);
    const prevPoll = source?.poll;
    if (!prevPoll || source.isPending) return;

    const isAuthor = !!currentUser && source.userId === currentUser.id;
    applyPollUpdate(postId, computeOptimisticPoll(prevPoll, [], 'retract', isAuthor));

    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/poll/vote`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        applyPollUpdate(postId, prevPoll);
        showRetryToast(data.error || 'Failed to retract — Tap to retry', () => {
          void handleRetractPollVote(postId);
        });
        throw new Error(data.error || 'Failed to retract vote');
      }
      const { poll } = await res.json();
      applyPollUpdate(postId, poll);
    } catch (e) {
      if (!(e instanceof Error) || e.name === 'TypeError') {
        applyPollUpdate(postId, prevPoll);
        showRetryToast('Failed to retract — Tap to retry', () => {
          void handleRetractPollVote(postId);
        });
      }
      throw e instanceof Error ? e : new Error('Failed to retract vote');
    }
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
    const limits = systemSettings ?? DEFAULT_SYSTEM_SETTINGS;
    const limitError = validatePostLimits(editingPostContent.trim(), 0, limits);
    if (limitError) {
      addToast(limitError, 'system', undefined, { skipPrefCheck: true });
      return;
    }
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

  const findPost = (postId: number): import('@hin/types').Post | null => {
    const scan = (list: import('@hin/types').Post[]): import('@hin/types').Post | null => {
      for (const p of list) {
        if (p.id === postId) return p;
        const embedded = p.repostedPost;
        if (embedded && !isUnavailableRepostedPost(embedded) && embedded.id === postId) {
          return embedded;
        }
      }
      return null;
    };
    return (
      scan(posts) ||
      scan(profilePosts) ||
      (postViewPost ? scan([postViewPost]) : null)
    );
  };

  const handleToggleLike = async (postId: number) => {
    if (!currentUser) return;
    const source = findPost(postId);
    if (!source) return;

    const prevLiked = !!source.hasLiked;
    const prevCount = source.likesCount ?? 0;
    const nextLiked = !prevLiked;
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));

    const applyLike = (liked: boolean, likesCount: number) => {
      const merge = (p: import('@hin/types').Post): import('@hin/types').Post => {
        let next = p;
        if (p.id === postId) {
          next = { ...p, hasLiked: liked, likesCount };
        }
        if (
          p.repostedPost &&
          !isUnavailableRepostedPost(p.repostedPost) &&
          p.repostedPost.id === postId
        ) {
          next = {
            ...next,
            repostedPost: { ...p.repostedPost, hasLiked: liked, likesCount },
          };
        }
        return next;
      };
      setPosts(prev => prev.map(merge));
      setProfilePosts(prev => prev.map(merge));
      setPostViewPost(prev => (prev ? merge(prev) : prev));
    };

    applyLike(nextLiked, nextCount);
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/like`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        applyLike(data.liked, data.likesCount);
      } else {
        applyLike(prevLiked, prevCount);
      }
    } catch (e) {
      applyLike(prevLiked, prevCount);
      console.error(e);
    }
  };

  const handleToggleBookmark = async (postId: number) => {
    if (!currentUser) return;
    const source =
      (postViewPost?.id === postId ? postViewPost : null) ||
      posts.find((p) => p.id === postId) ||
      profilePosts.find((p) => p.id === postId);
    const prevBookmarked = !!source?.hasBookmarked;
    const prevCount = source?.bookmarksCount ?? 0;
    const nextBookmarked = !prevBookmarked;
    const nextCount = Math.max(0, prevCount + (nextBookmarked ? 1 : -1));
    const removedFromBookmarksFeed = feedModeRef.current === 'bookmarks' && prevBookmarked;
    const removedPost = removedFromBookmarksFeed ? posts.find((p) => p.id === postId) : null;

    const applyBookmark = (bookmarked: boolean, bookmarksCount: number) => {
      setPostViewPost((prev) =>
        prev?.id === postId ? { ...prev, hasBookmarked: bookmarked, bookmarksCount } : prev,
      );
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, hasBookmarked: bookmarked, bookmarksCount } : p)),
      );
      setProfilePosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, hasBookmarked: bookmarked, bookmarksCount } : p)),
      );
    };

    applyBookmark(nextBookmarked, nextCount);
    if (removedFromBookmarksFeed) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }

    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/bookmark`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        applyBookmark(data.bookmarked, data.bookmarksCount);
        if (feedModeRef.current === 'bookmarks' && !data.bookmarked) {
          setPosts((prev) => prev.filter((p) => p.id !== postId));
        } else if (removedFromBookmarksFeed && data.bookmarked && removedPost) {
          setPosts((prev) =>
            prev.some((p) => p.id === postId)
              ? prev
              : [{ ...removedPost, hasBookmarked: true, bookmarksCount: data.bookmarksCount }, ...prev],
          );
        }
        addToast(data.bookmarked ? 'Post bookmarked' : 'Bookmark removed', 'system', undefined, {
          skipPrefCheck: true,
        });
      } else {
        applyBookmark(prevBookmarked, prevCount);
        if (removedFromBookmarksFeed && removedPost) {
          setPosts((prev) => (prev.some((p) => p.id === postId) ? prev : [removedPost, ...prev]));
        }
      }
    } catch (e) {
      applyBookmark(prevBookmarked, prevCount);
      if (removedFromBookmarksFeed && removedPost) {
        setPosts((prev) => (prev.some((p) => p.id === postId) ? prev : [removedPost, ...prev]));
      }
      console.error(e);
    }
  };

  const applyRepostCount = (originalId: number, repostsCount: number, hasReposted: boolean) => {
    const merge = (p: import('@hin/types').Post): import('@hin/types').Post => {
      let next = p;
      if (p.id === originalId) {
        next = { ...p, repostsCount, hasReposted };
      }
      if (
        p.repostedPost &&
        !isUnavailableRepostedPost(p.repostedPost) &&
        p.repostedPost.id === originalId
      ) {
        next = {
          ...next,
          repostedPost: { ...p.repostedPost, repostsCount, hasReposted },
        };
      }
      return next;
    };
    setPosts(prev => prev.map(merge));
    setProfilePosts(prev => prev.map(merge));
    setPostViewPost(prev => (prev ? merge(prev) : prev));
  };

  const handleRepost = async (postId: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/repost`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      const repostRow = data as import('@hin/types').Post;
      const rootId = repostRow.repostOfPostId ?? postId;
      const repostsCount = (data.repostsCount as number) ?? 0;
      applyRepostCount(rootId, repostsCount, true);

      setPosts(prev => {
        if (prev.some(p => p.id === repostRow.id)) return prev;
        return [repostRow, ...prev];
      });
      if (profileUserId === currentUser.id) {
        setProfilePosts(prev => {
          if (prev.some(p => p.id === repostRow.id)) return prev;
          return [repostRow, ...prev];
        });
      }
      addToast('Reposted', 'system', undefined, { skipPrefCheck: true });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUndoRepost = async (postId: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/repost`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      const rootId = (data.postId as number) ?? postId;
      const repostsCount = data.repostsCount as number;
      applyRepostCount(rootId, repostsCount, false);

      const isViewerSilentRepost = (p: import('@hin/types').Post) =>
        p.repostOfPostId === rootId && !p.isQuote && p.userId === currentUser.id;
      setPosts(prev => prev.filter(p => !isViewerSilentRepost(p)));
      setProfilePosts(prev => prev.filter(p => !isViewerSilentRepost(p)));
      addToast('Removed repost', 'system', undefined, { skipPrefCheck: true });
    } catch (e) {
      console.error(e);
    }
  };

  const handleQuotePost = async (postId: number, content: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ content, quotePostId: postId }),
      });
      if (!res.ok) return;
      const newPost = (await res.json()) as import('@hin/types').Post;
      setPosts(prev => [newPost, ...prev]);
      if (profileUserId === currentUser.id) {
        setProfilePosts(prev => [newPost, ...prev]);
        setProfileUser(prev =>
          prev ? { ...prev, postCount: (prev.postCount || 0) + 1 } : prev,
        );
      }
      addToast('Quote posted', 'system', undefined, { skipPrefCheck: true });
    } catch (e) {
      console.error(e);
    }
  };

  const handleShareExternal = async (postId: number) => {
    const post = findPost(postId);
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
          const mergeShare = (p: import('@hin/types').Post) =>
            p.id === postId ? { ...p, sharesCount: data.sharesCount } : p;
          setPosts(prev => prev.map(mergeShare));
          setProfilePosts(prev => prev.map(mergeShare));
          setPostViewPost(prev =>
            prev?.id === postId ? { ...prev, sharesCount: data.sharesCount } : prev,
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
    const comment = (postComments[postId] || []).find((c) => c.id === commentId);
    if (!comment) return;

    const prevLiked = !!comment.hasLiked;
    const prevCount = comment.likesCount ?? 0;
    const nextLiked = !prevLiked;
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));

    const applyCommentLike = (liked: boolean, likesCount: number) => {
      setPostComments((prev) => ({
        ...prev,
        [postId]: (prev[postId] || []).map((c) =>
          c.id === commentId ? { ...c, hasLiked: liked, likesCount } : c,
        ),
      }));
    };

    applyCommentLike(nextLiked, nextCount);
    try {
      const res = await fetch(`${API_URL}/api/comments/${commentId}/like`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        applyCommentLike(data.liked, data.likesCount);
      } else {
        applyCommentLike(prevLiked, prevCount);
      }
    } catch (e) {
      applyCommentLike(prevLiked, prevCount);
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
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
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
        if (newComment.g) {
          // Toasts + bell entries are delivered over the realtime channel
          // (WS `notification` for badges/level-ups, `gamification_reward` for
          // points/event wins) to avoid duplicate toasts; just refresh here.
          void fetchMyGamification();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.error || 'Failed to post comment', 'system', undefined, { skipPrefCheck: true });
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

  const handleCreateItemComment = async (olabidItemId: number, e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const text = newItemCommentText[olabidItemId] || '';
    if (!text.trim()) return;
    const parent = replyingToItemComment[olabidItemId];
    try {
      const res = await fetch(`${API_URL}/api/olabid/items/${olabidItemId}/comments`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ content: text, parentId: parent ? parent.id : null }),
      });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (res.ok) {
        const newComment = await res.json();
        if (!appliedItemCommentCreatesRef.current.has(newComment.id)) {
          appliedItemCommentCreatesRef.current.add(newComment.id);
          setItemComments(prev => {
            const list = prev[olabidItemId] || [];
            if (list.some(c => c.id === newComment.id)) return prev;
            return { ...prev, [olabidItemId]: [newComment, ...list] };
          });
        }
        setNewItemCommentText(prev => ({ ...prev, [olabidItemId]: '' }));
        setReplyingToItemComment(prev => ({ ...prev, [olabidItemId]: null }));
        if (newComment.g) {
          void fetchMyGamification();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.error || 'Failed to post comment', 'system', undefined, { skipPrefCheck: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveItemCommentEdit = async (olabidItemId: number, commentId: number) => {
    if (!editingItemCommentContent.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/item-comments/${commentId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ content: editingItemCommentContent }),
      });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (res.ok) {
        const updatedComment = await res.json();
        setItemComments(prev => ({
          ...prev,
          [olabidItemId]: (prev[olabidItemId] || []).map(c => (c.id === commentId ? updatedComment : c)),
        }));
        setEditingItemCommentId(null);
        addToast('Comment updated successfully', 'system', undefined, { skipPrefCheck: true });
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.error || 'Failed to update comment', 'system', undefined, { skipPrefCheck: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteItemComment = async (olabidItemId: number, commentId: number) => {
    if (!currentUser || !confirm('Are you sure you want to delete this comment?')) return;
    try {
      const res = await fetch(`${API_URL}/api/item-comments/${commentId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (res.ok) {
        if (!appliedItemCommentDeletesRef.current.has(commentId)) {
          appliedItemCommentDeletesRef.current.add(commentId);
          setItemComments(prev => ({
            ...prev,
            [olabidItemId]: (prev[olabidItemId] || []).map(c =>
              c.id === commentId
                ? { ...c, deletedAt: new Date().toISOString(), username: 'deleted', content: '[Comment deleted]' }
                : c
            ),
          }));
        }
        addToast('Comment deleted', 'system', undefined, { skipPrefCheck: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleItemCommentLike = async (olabidItemId: number, commentId: number) => {
    if (!currentUser) return;
    const comment = (itemComments[olabidItemId] || []).find((c) => c.id === commentId);
    if (!comment) return;

    const prevLiked = !!comment.hasLiked;
    const prevCount = comment.likesCount ?? 0;
    const nextLiked = !prevLiked;
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));

    const applyItemCommentLike = (liked: boolean, likesCount: number) => {
      setItemComments((prev) => ({
        ...prev,
        [olabidItemId]: (prev[olabidItemId] || []).map((c) =>
          c.id === commentId ? { ...c, hasLiked: liked, likesCount } : c,
        ),
      }));
    };

    applyItemCommentLike(nextLiked, nextCount);
    try {
      const res = await fetch(`${API_URL}/api/item-comments/${commentId}/like`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.status === 401) {
        applyItemCommentLike(prevLiked, prevCount);
        handleSessionExpired();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        applyItemCommentLike(data.liked, data.likesCount);
      } else {
        applyItemCommentLike(prevLiked, prevCount);
      }
    } catch (e) {
      applyItemCommentLike(prevLiked, prevCount);
      console.error(e);
    }
  };

  const startChat = (user: UserType | ChatRecipient, opts?: { prefillText?: string; seedPreview?: LinkPreview | null }) => {
    const recipient: ChatRecipient = { id: user.id, username: user.username, role: user.role, avatarUrl: user.avatarUrl };
    setShowNotifications(false);
    showMessagesDropdownRef.current = true;
    setShowMessagesDropdown(true);
    setMessagesPanelExpanded(false);
    if (opts?.prefillText != null || opts?.seedPreview != null) {
      openChatInPanel(recipient, {
        draft: {
          text: opts.prefillText ?? '',
          preview: opts.seedPreview ?? null,
        },
      });
    } else {
      openChatInPanel(recipient);
    }
    fetchThreads();
  };

  const handlePostOlabidItem = (permalink: string, seedPreview: LinkPreview) => {
    ensureMessagesClosed(() => {
      goHome();
      setNewPostContent(permalink);
      setPostSeedPreview(seedPreview);
      setShowNewPostForm(true);
    });
  };

  const sendWsChatMessage = (payload: {
    receiverId: number;
    content: string;
    suppressLinkPreview?: boolean;
    mediaUrl?: string;
    mediaType?: string;
    clientMessageId: string;
    replyToMessageId?: number;
  }) => {
    if (!(ws.current?.readyState === WebSocket.OPEN && wsReadyRef.current)) return false;
    ws.current.send(JSON.stringify({ type: 'send_message', payload }));
    return true;
  };

  const flushChatOutbox = () => {
    if (!currentUser) return;
    if (!(ws.current?.readyState === WebSocket.OPEN && wsReadyRef.current)) return;
    const items = loadOutbox(currentUser.id);
    for (const item of items) {
      const ok = sendWsChatMessage({
        receiverId: item.recipientId,
        content: item.content,
        mediaUrl: item.mediaUrl,
        mediaType: item.mediaType,
        clientMessageId: item.clientMessageId,
        replyToMessageId: item.replyToMessageId,
      });
      if (ok) dequeueOutbox(currentUser.id, item.clientMessageId);
    }
  };
  flushOutboxRef.current = flushChatOutbox;

  const handleSendDM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !chatRecipient || sendingChatMedia) return;
    const content = newMsgText.trim();
    const pendingMedia = pendingChatMedia;
    if (!content && !pendingMedia) return;

    const dismissedUrl = chatDraftsRef.current[chatRecipient.id]?.dismissedPreviewUrl ?? null;
    const firstUrl = extractFirstUrl(content);
    const suppressLinkPreview = !!(dismissedUrl && firstUrl && dismissedUrl === firstUrl);
    const optimisticPreview = suppressLinkPreview ? null : draftLinkPreview;

    let mediaUrl: string | undefined;
    let mediaType: string | undefined;
    let optimisticMediaUrl: string | null = pendingMedia?.previewUrl ?? null;

    if (pendingMedia) {
      if (!token) return;
      setSendingChatMedia(true);
      try {
        const uploaded = await uploadCompressedImage(pendingMedia.file, 'chat', token, API_URL);
        mediaUrl = uploaded.url;
        mediaType = 'image/webp';
        optimisticMediaUrl = mediaUrl;
      } catch (err) {
        console.error(err);
        addToast(err instanceof Error ? err.message : 'Failed to upload image', 'system', undefined, {
          skipPrefCheck: true,
        });
        setSendingChatMedia(false);
        return;
      } finally {
        setSendingChatMedia(false);
      }
    }

    const clientMessageId = randomId();
    const replyParent = replyingToMessage;
    const optimisticMsg: Message = {
      id: nextOptimisticId(),
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      receiverId: chatRecipient.id,
      receiverUsername: chatRecipient.username,
      content,
      createdAt: new Date().toISOString(),
      read: false,
      status: 'sending',
      clientMessageId,
      linkPreview: optimisticPreview,
      mediaUrl: optimisticMediaUrl,
      mediaType: mediaType ?? null,
      replyToMessageId: replyParent && replyParent.id > 0 ? replyParent.id : null,
      replyTo: replyParent
        ? {
            id: replyParent.id,
            senderId: replyParent.senderId,
            senderUsername: replyParent.senderUsername,
            content: replyParent.content,
            mediaUrl: replyParent.mediaUrl ?? null,
            deleted: false,
          }
        : null,
    };

    setChatMessages(prev =>
      capMessageWindow(
        mergeAndSortMessagesExcludingDeleted(prev, [optimisticMsg], pendingDeletedIdsRef.current),
      ),
    );

    const wsPayload = {
      receiverId: chatRecipient.id,
      content,
      suppressLinkPreview: suppressLinkPreview || undefined,
      mediaUrl,
      mediaType,
      clientMessageId,
      replyToMessageId: replyParent && replyParent.id > 0 ? replyParent.id : undefined,
    };

    const sent = sendWsChatMessage(wsPayload);
    if (!sent) {
      // OF-002: queue for flush when WS reconnects
      const outboxItem: OutboxItem = {
        clientMessageId,
        recipientId: chatRecipient.id,
        content,
        mediaUrl,
        mediaType,
        replyToMessageId: wsPayload.replyToMessageId,
        createdAt: optimisticMsg.createdAt,
      };
      enqueueOutbox(currentUser.id, outboxItem);
      addToast('Message queued — will send when you reconnect.', 'system', undefined, {
        skipPrefCheck: true,
      });
    } else if (ws.current?.readyState === WebSocket.OPEN) {
      if (typingTimeoutRef.current[chatRecipient.id]) {
        clearTimeout(typingTimeoutRef.current[chatRecipient.id]);
      }
      ws.current.send(
        JSON.stringify({ type: 'typing', payload: { receiverId: chatRecipient.id, isTyping: false } }),
      );
      lastTypingSentRef.current[chatRecipient.id] = 0;
    }

    const sentToId = chatRecipient.id;
    setChatDrafts(prev => {
      if (!prev[sentToId]) return prev;
      const { [sentToId]: _removed, ...rest } = prev;
      return rest;
    });
    setPendingChatMedia(prev => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setNewMsgText('');
    setDraftLinkPreview(null);
    setReplyingToMessage(null);
  };

  const handleRetryFailedMessage = (failed: Message) => {
    if (!currentUser || !chatRecipient) return;
    const clientMessageId = failed.clientMessageId || randomId();
    const retryMsg: Message = {
      ...failed,
      id: failed.id < 0 ? failed.id : nextOptimisticId(),
      status: 'sending',
      clientMessageId,
      createdAt: failed.createdAt,
    };
    setChatMessages(prev =>
      mergeAndSortMessages(
        prev.filter(
          m =>
            !(
              m.id === failed.id ||
              (failed.clientMessageId && m.clientMessageId === failed.clientMessageId)
            ),
        ),
        [retryMsg],
      ),
    );

    const wsPayload = {
      receiverId: chatRecipient.id,
      content: failed.content,
      mediaUrl: failed.mediaUrl || undefined,
      mediaType: failed.mediaType || undefined,
      clientMessageId,
      suppressLinkPreview: !failed.linkPreview,
      replyToMessageId: failed.replyToMessageId || undefined,
    };

    const sent = sendWsChatMessage(wsPayload);
    if (!sent) {
      enqueueOutbox(currentUser.id, {
        clientMessageId,
        recipientId: chatRecipient.id,
        content: failed.content,
        mediaUrl: failed.mediaUrl || undefined,
        mediaType: failed.mediaType || undefined,
        replyToMessageId: failed.replyToMessageId || undefined,
        createdAt: failed.createdAt,
      });
      addToast('Retry queued — will send when you reconnect.', 'system', undefined, {
        skipPrefCheck: true,
      });
    }
  };

  const handleDeleteMessage = (msg: Message) => {
    if (!currentUser) return;
    if (msg.senderId !== currentUser.id) return;

    // Optimistic / failed local-only rows
    if (msg.id < 0 || msg.status === 'failed') {
      setChatMessages(prev =>
        prev.filter(
          m =>
            !(
              m.id === msg.id ||
              (msg.clientMessageId && m.clientMessageId === msg.clientMessageId)
            ),
        ),
      );
      setReplyingToMessage(prev => (prev?.id === msg.id ? null : prev));
      return;
    }

    if (!(ws.current?.readyState === WebSocket.OPEN && wsReadyRef.current)) {
      addToast('Real-time connection is not ready yet. Please wait a moment and try again.', 'system', undefined, {
        skipPrefCheck: true,
      });
      return;
    }

    // DL-008/014/015/022: tombstone + rollback timeout
    pendingDeletedIdsRef.current = addTombstone(pendingDeletedIdsRef.current, msg.id);
    pendingDeleteSnapshotsRef.current.set(msg.id, msg);
    setChatMessages(prev => prev.filter(m => m.id !== msg.id));
    setReplyingToMessage(prev => (prev?.id === msg.id ? null : prev));

    const existingTimer = pendingDeleteTimersRef.current.get(msg.id);
    if (existingTimer) clearTimeout(existingTimer);
    pendingDeleteTimersRef.current.set(
      msg.id,
      setTimeout(() => {
        pendingDeleteTimersRef.current.delete(msg.id);
        const snapshot = pendingDeleteSnapshotsRef.current.get(msg.id);
        pendingDeleteSnapshotsRef.current.delete(msg.id);
        pendingDeletedIdsRef.current = removeTombstone(pendingDeletedIdsRef.current, msg.id);
        if (snapshot) {
          setChatMessages(prev =>
            capMessageWindow(
              mergeAndSortMessagesExcludingDeleted(prev, [snapshot], pendingDeletedIdsRef.current),
            ),
          );
          addToast('Could not delete message. It was restored.', 'system', undefined, {
            skipPrefCheck: true,
          });
        }
      }, 8000),
    );

    ws.current.send(
      JSON.stringify({
        type: 'delete_message',
        payload: { messageId: msg.id },
      }),
    );
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

  const handleMarkAllNotifsRead = async (category?: 'social' | 'gamification') => {
    if (!currentUser || unreadNotifsCount === 0) return;
    try {
      const query = category ? `?category=${category}` : '';
      const res = await fetch(`${API_URL}/api/notifications/read-all${query}`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        setNotifications(prev => {
          const next = prev.map(n => {
            if (n.read) return n;
            if (category && resolveNotificationCategory(n) !== category) return n;
            return { ...n, read: true };
          });
          setUnreadNotifsCount(next.filter(n => !n.read && n.type !== 'message').length);
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    handleMarkNotifRead(n.id);
    setShowNotifications(false);
    if (n.type === 'system') return;
    if (n.type === 'badge_award' || n.type === 'level_up' || n.type === 'event_win') {
      openProfile(currentUser!.id);
      return;
    }
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
      const itemTarget = notificationItemTarget(n);
      if (itemTarget) {
        if (olabidEnabled) openOlabidItem(itemTarget.olabidItemId);
        return;
      }
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
    if (!token) return;
    const viewing = profileUser?.id === userId ? profileUser : null;
    const prevStatus = viewing?.followStatus ?? 'none';
    const prevFollowerCount = viewing?.followerCount ?? 0;
    const prevFollowingCount = viewing?.followingCount;
    const prevCanViewPosts = viewing?.canViewPosts;
    const prevInSet = followedUserIds.has(userId);
    const isPrivate = !!viewing?.isPrivate;
    const optimisticStatus = isPrivate ? 'requested' : 'following';
    const optimisticFollowerCount = isPrivate ? prevFollowerCount : prevFollowerCount + 1;

    updateProfileFollowState(userId, {
      followStatus: optimisticStatus,
      followerCount: optimisticFollowerCount,
      canViewPosts: optimisticStatus === 'following' ? true : prevCanViewPosts,
    });
    if (optimisticStatus === 'following') {
      setFollowedUserIds(prev => new Set([...prev, userId]));
    }

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
      } else {
        setFollowedUserIds(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    } catch (e) {
      updateProfileFollowState(userId, {
        followStatus: prevStatus,
        followerCount: prevFollowerCount,
        followingCount: prevFollowingCount,
        canViewPosts: prevCanViewPosts,
      });
      setFollowedUserIds(prev => {
        const next = new Set(prev);
        if (prevInSet) next.add(userId);
        else next.delete(userId);
        return next;
      });
      showRetryToast('Failed to follow — Tap to retry', () => {
        void handleFollow(userId);
      });
      console.error(e);
    }
  };

  const handleUnfollow = async (userId: number) => {
    if (!token) return;
    const viewing = profileUser?.id === userId ? profileUser : null;
    const prevStatus = viewing?.followStatus ?? 'following';
    const prevFollowerCount = viewing?.followerCount ?? 0;
    const prevCanViewPosts = viewing?.canViewPosts;
    const prevInSet = followedUserIds.has(userId);
    const prevProfilePosts = profilePosts;
    const wasPrivate = !!viewing?.isPrivate;

    updateProfileFollowState(userId, {
      followStatus: 'none',
      followerCount: Math.max(0, prevFollowerCount - 1),
      canViewPosts: wasPrivate ? false : prevCanViewPosts,
    });
    setFollowedUserIds(prev => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    if (profileUserId === userId && wasPrivate) {
      setProfilePosts([]);
    }

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
        canViewPosts: wasPrivate ? false : profileUser?.canViewPosts,
      });
      setFollowedUserIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      if (profileUserId === userId && wasPrivate) {
        fetchProfilePosts(userId);
      }
    } catch (e) {
      updateProfileFollowState(userId, {
        followStatus: prevStatus,
        followerCount: prevFollowerCount,
        canViewPosts: prevCanViewPosts,
      });
      setFollowedUserIds(prev => {
        const next = new Set(prev);
        if (prevInSet) next.add(userId);
        else next.delete(userId);
        return next;
      });
      if (profileUserId === userId && wasPrivate) {
        setProfilePosts(prevProfilePosts);
      }
      showRetryToast('Failed to unfollow — Tap to retry', () => {
        void handleUnfollow(userId);
      });
      console.error(e);
    }
  };

  const handleCancelFollowRequest = async (userId: number) => {
    if (!token) return;
    const viewing = profileUser?.id === userId ? profileUser : null;
    const prevStatus = viewing?.followStatus ?? 'requested';

    updateProfileFollowState(userId, { followStatus: 'none' });

    try {
      const res = await fetch(`${API_URL}/api/follows/${userId}/request`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel request');
      updateProfileFollowState(userId, { followStatus: data.followStatus });
    } catch (e) {
      updateProfileFollowState(userId, { followStatus: prevStatus });
      showRetryToast('Failed to cancel request — Tap to retry', () => {
        void handleCancelFollowRequest(userId);
      });
      console.error(e);
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
    } else if (route.view === 'search') {
      openSearch({ replace: true, skipUrlSync: true });
    } else if (route.view === 'olabid') {
      // Deferred until olabidFlagKnown — see effect that resolves /olabid deep links.
    } else if (route.view === 'admin') {
      if (currentUser?.role === 'admin') {
        openAdmin(route.section, { replace: true, skipUrlSync: true });
      } else {
        syncUrl({ view: 'home' }, true);
      }
    }

    const onPopState = (event: PopStateEvent) => {
      if (chatHistoryRef.current.consumeSuppressedPop()) {
        return;
      }

      const chatLayer = getChatLayer(event.state);
      if (showMessagesDropdownRef.current || chatHistoryRef.current.getDepth() > 0) {
        if (chatLayer === 'list') {
          backToMessagesListUiRef.current();
          chatHistoryRef.current.notePopped();
          return;
        }
        if (chatLayer === 'thread') {
          showMessagesDropdownRef.current = true;
          setShowMessagesDropdown(true);
          return;
        }
        // Left chat overlay entries — URL unchanged for chat-only pops.
        closeMessagesPanelUiRef.current();
        chatHistoryRef.current.resetDepth();
        return;
      }

      const r = parseLocation(window.location.pathname, window.location.hash);
      if (r.view === 'post') {
        openPost(r.postId, { commentId: r.commentId, skipUrlSync: true });
      } else if (r.view === 'profile') {
        openProfileByUsername(r.username, { skipUrlSync: true });
      } else if (r.view === 'search') {
        openSearch({ skipUrlSync: true });
      } else if (r.view === 'olabid') {
        if (!olabidFlagKnownRef.current) return;
        if (!olabidEnabledRef.current) {
          goHome();
          return;
        }
        if (r.itemId) openOlabidItem(r.itemId, { skipUrlSync: true });
        else openOlabid({ skipUrlSync: true });
      } else if (r.view === 'admin' && currentUser?.role === 'admin') {
        openAdmin(r.section, { skipUrlSync: true });
      } else {
        setIsSearchOpen(false);
        goHome({ skipUrlSync: true });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Tag restored chat UI on the current history entry (no extra stack depth).
  useEffect(() => {
    if (!showMessagesDropdown) return;
    chatHistoryRef.current.replaceLayer(chatRecipient ? 'thread' : 'list');
    // Cold restore only — in-session opens push their own layers.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount hydrate
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
      setChatMessages([]);
      setChatDrafts({});
      setNewMsgText('');
      setDraftLinkPreview(null);
      closeMessagesPanelUi();
      chatHistoryRef.current.dismiss();
      clearChatState();
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

  const handleAdminReinstateUser = async (userId: number, targetUsername: string) => {
    if (!currentUser || currentUser.role !== 'admin' || !token) return;
    if (!confirm(`Reinstate @${targetUsername} and restore their deleted content?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/reinstate`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        addToast(`Account @${targetUsername} has been reinstated`, 'system', undefined, { skipPrefCheck: true });
        fetchAdminStats();
      } else {
        addToast(data.error || 'Failed to reinstate user', 'system', undefined, { skipPrefCheck: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetDataComplete = async () => {
    setPosts([]);
    setFeedNextCursor(null);
    setActiveHashtag(null);
    activeHashtagRef.current = null;
    setFollowedUserIds(new Set());
    followedUserIdsRef.current = new Set();
    setBlockedUserIds(new Set());
    blockedUserIdsRef.current = new Set();
    setMutedUserIds(new Set());
    mutedUserIdsRef.current = new Set();
    setFollowRequests([]);
    setExpandedComments({});
    setPostComments({});
    setNewCommentText({});
    setReplyingTo({});
    setEditingPostId(null);
    setEditingPostContent('');
    setEditingCommentId(null);
    setEditingCommentContent('');
    setItemComments({});
    setNewItemCommentText({});
    setReplyingToItemComment({});
    setEditingItemCommentId(null);
    setEditingItemCommentContent('');
    setChatRecipient(null);
    setChatMessages([]);
    setChatDrafts({});
    setNewMsgText('');
    setDraftLinkPreview(null);
    setPendingChatMedia(null);
    setThreads([]);
    setTypingUsers({});
    setNotifications([]);
    setUnreadNotifsCount(0);
    setUnreadMessagesCount(0);
    setShowNotifications(false);
    closeMessagesPanelUi();
    chatHistoryRef.current.dismiss();
    setAdminData(null);
    setBroadcastHistory(null);
    setAdminReports(null);
    setReportTarget(null);
    setProfileUserId(null);
    profileUserIdRef.current = null;
    setProfileUser(null);
    setProfilePosts([]);
    setProfilePostsError(null);
    setProfileGamification(null);
    setPostViewId(null);
    setPostViewPost(null);
    setPostViewError(null);
    setHighlightCommentId(null);
    setMyGamification(null);
    setIntroWalkthroughCompleted(false);
    clearChatState();
    await fetchAdminStats();
    addToast('Data reset complete. Admin accounts remain.', 'system', undefined, { skipPrefCheck: true });
  };

  const showGuestAuthPage = !currentUser && showGuestAuth && activeTab === 'feed';

  const effectiveSettings: UserSettings = userSettings ?? {
    ...DEFAULT_USER_SETTINGS,
    isPrivate: !!currentUser?.isPrivate,
    updatedAt: new Date(0).toISOString(),
  };
  const showChatIcon =
    !!currentUser && shouldShowChatIcon(effectiveSettings, activeTab);
  const postLimits = systemSettings ?? DEFAULT_SYSTEM_SETTINGS;

  const handleWalkthroughStepChange = useCallback(() => {
    setShowNotifications(false);
    closeMessagesPanelUiRef.current();
    chatHistoryRef.current.dismiss();
    setShowNewPostForm(false);
  }, []);

  const walkthrough = useIntroWalkthrough({
    enabled: !!currentUser && activeTab === 'feed' && !showGuestAuthPage,
    token,
    serverCompleted: introWalkthroughCompleted,
    getHeaders,
    onStepChange: handleWalkthroughStepChange,
  });

  const openProfileSettings = useCallback(() => {
    setIsProfileSettingsOpen(true);
    void fetchFollowRequests();
  }, []);

  const closeProfileSettings = useCallback(() => {
    setIsProfileSettingsOpen(false);
    setSettingsTourSection(null);
  }, []);

  const profileTour = useProfileTour({
    autoStartEnabled:
      !!currentUser &&
      activeTab === 'profile' &&
      profileUser?.id === currentUser.id &&
      !profileLoading &&
      !currentUser.profileCompletedAt &&
      !showGuestAuthPage,
    feedIntroActive: walkthrough.isActive,
    isProfileEditing,
    setIsProfileEditing,
    openSettings: openProfileSettings,
    closeSettings: closeProfileSettings,
    setSettingsTourSection,
  });

  useEffect(() => {
    if (walkthrough.isActive || profileTour.isActive) {
      handleWalkthroughStepChange();
    }
  }, [walkthrough.isActive, profileTour.isActive, handleWalkthroughStepChange]);

  return (
    <AppShell
      overlay={
        currentUser?.needsUsernameSetup && token ? (
          <UsernameSetupGate
            token={token}
            onComplete={(data) => completeAuthSuccess(data)}
          />
        ) : showEmailVerificationGate && token ? (
          <EmailVerificationGate
            token={token}
            user={currentUser}
            onComplete={(user) => {
              setCurrentUser(user);
              localStorage.setItem('hin_user', JSON.stringify(user));
            }}
            onBack={handleLogout}
          />
        ) : walkthrough.isActive ? (
          <IntroWalkthrough
            steps={INTRO_WALKTHROUGH_STEPS}
            stepIndex={walkthrough.stepIndex}
            onNext={walkthrough.next}
            onComplete={() => {
              setIntroWalkthroughCompleted(true);
              walkthrough.complete();
            }}
          />
        ) : profileTour.isActive ? (
          <CoachTooltip
            steps={PROFILE_TOUR_STEPS}
            stepIndex={profileTour.stepIndex}
            onNext={profileTour.next}
            onComplete={profileTour.complete}
            onSkip={profileTour.skip}
            completionMessage="You can revisit this tour anytime from Settings."
          />
        ) : isSearchOpen ? (
          <SearchOverlay
            token={token!}
            currentUser={currentUser}
            onClose={() => closeSearch()}
            onOpenPost={(postId) => {
              setIsSearchOpen(false);
              openPost(postId);
            }}
            onOpenOlabidItem={olabidEnabled ? (itemId) => {
              setIsSearchOpen(false);
              openOlabidItem(itemId);
            } : undefined}
            onViewProfile={(idOrUsername) => {
              setIsSearchOpen(false);
              handleViewProfile(idOrUsername);
            }}
            onViewHashtag={(tag) => {
              setIsSearchOpen(false);
              handleViewHashtag(tag);
            }}
            commentsList={postComments}
            expandedComments={expandedComments}
            editingPostId={editingPostId}
            editingPostContent={editingPostContent}
            newCommentText={newCommentText}
            replyingTo={replyingTo}
            editingCommentId={editingCommentId}
            editingCommentContent={editingCommentContent}
            gamificationEnabled={gamificationEnabled}
            highlightCommentId={highlightCommentId}
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
            onReply={(pid, comment) => setReplyingTo(prev => ({ ...prev, [pid]: comment }))}
            onToggleCommentLike={handleToggleCommentLike}
            onVotePoll={handleVotePoll}
            onRetractPollVote={handleRetractPollVote}
            onClosePoll={handleClosePoll}
            onCopyPermalink={handleCopyPostPermalink}
            onToggleBookmark={handleToggleBookmark}
            onRepost={handleRepost}
            onUndoRepost={handleUndoRepost}
            onQuotePost={handleQuotePost}
            onShareExternal={handleShareExternal}
            onReportPost={(postId) => handleOpenReport('post', postId)}
            onReportComment={(commentId) => handleOpenReport('comment', commentId)}
            onPinPost={handlePinPost}
            onUnpinPost={handleUnpinPost}
            onRetryPendingPost={handleRetryPendingPost}
          />
        ) : undefined
      }
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
        !currentUser ? (
          <GuestHeader
            onSignIn={() => handleGuestSignIn()}
            onRegister={() => handleGuestSignIn({ register: true })}
            onGoHome={() => goHome()}
          />
        ) : currentUser ? (
          <AppHeader
            currentUser={currentUser}
            showNotifications={showNotifications}
            unreadNotifsCount={unreadNotifsCount}
            notifications={notifications}
            notificationsLoading={notificationsLoading}
            onlineCount={presenceEnabled ? onlineUserIds.size : undefined}
            isAdminTab={activeTab === 'admin'}
            isOlabidTab={activeTab === 'olabid'}
            onGoHome={goHome}
            onOpenAdmin={currentUser?.role === 'admin' ? () => openAdmin('dashboard') : undefined}
            onOpenOlabid={olabidEnabled ? openOlabid : undefined}
            onToggleNotifications={() => {
              setShowNotifications(prev => {
                const next = !prev;
                if (next) {
                  ensureMessagesClosed();
                  fetchNotifications();
                }
                return next;
              });
            }}
            onCloseNotifications={() => setShowNotifications(false)}
            onNotificationClick={handleNotificationClick}
            onMarkAllNotificationsRead={handleMarkAllNotifsRead}
            onOpenProfile={openProfile}
            onLogout={handleLogout}
            onOpenSearch={() => openSearch()}
            gamification={myGamification}
            showGamification={shouldShowGamification(myGamification)}
            gamificationEnabled={gamificationEnabled}
          />
        ) : undefined
      }
    >
      <section className="flex-grow flex flex-col min-w-0 min-h-0 bg-bg-primary/40 relative">
        {showGuestAuthPage ? (
          <AuthLanding
            isRegisterMode={isRegisterMode}
            usernameInput={usernameInput}
            emailInput={emailInput}
            passwordInput={passwordInput}
            authError={authError}
            isAuthLoading={isAuthLoading}
            onSubmit={handleAuthSubmit}
            onUsernameChange={setUsernameInput}
            onEmailChange={setEmailInput}
            onPasswordChange={setPasswordInput}
            onToggleMode={() => {
              setIsRegisterMode(!isRegisterMode);
              setAuthError(null);
            }}
            onGoogleCredential={handleGoogleCredential}
          />
        ) : activeTab === 'post' ? (
          <PostView
            post={postViewPost}
            isLoading={postViewLoading}
            error={postViewError}
            currentUser={currentUser}
            readOnly={!currentUser}
            gamificationEnabled={gamificationEnabled}
            highlightCommentId={highlightCommentId}
            commentsList={
              postViewPost
                ? (postComments[getPostEngagementId(postViewPost)] ?? [])
                : []
            }
            isCommentsExpanded={
              postViewPost ? !!expandedComments[getPostEngagementId(postViewPost)] : false
            }
            newCommentText={
              postViewPost ? (newCommentText[getPostEngagementId(postViewPost)] ?? '') : ''
            }
            replyingTo={
              postViewPost ? (replyingTo[getPostEngagementId(postViewPost)] ?? null) : null
            }
            editingPostId={editingPostId}
            editingPostContent={editingPostContent}
            editingCommentId={editingCommentId}
            editingCommentContent={editingCommentContent}
            showGuestAuth={showGuestAuth}
            isRegisterMode={isRegisterMode}
            usernameInput={usernameInput}
            emailInput={emailInput}
            passwordInput={passwordInput}
            authError={authError}
            isAuthLoading={isAuthLoading}
            onBack={() => goHome()}
            onSignIn={handleGuestSignIn}
            onAuthSubmit={handleAuthSubmit}
            onUsernameChange={setUsernameInput}
            onEmailChange={setEmailInput}
            onPasswordChange={setPasswordInput}
            onToggleAuthMode={() => {
              setIsRegisterMode(!isRegisterMode);
              setAuthError(null);
            }}
            onGoogleCredential={handleGoogleCredential}
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
            onViewHashtag={tag => {
              if (!currentUser) {
                handleGuestSignIn();
                return;
              }
              handleViewHashtag(tag);
            }}
            onVotePoll={handleVotePoll}
            onRetractPollVote={handleRetractPollVote}
            onClosePoll={handleClosePoll}
            onCopyPermalink={() => postViewId && handleCopyPostPermalink(postViewId)}
            onOpenOlabidItem={olabidEnabled ? openOlabidItem : undefined}
            onToggleBookmark={() =>
              postViewPost && handleToggleBookmark(getPostEngagementId(postViewPost))
            }
            onRepost={handleRepost}
            onUndoRepost={handleUndoRepost}
            onQuotePost={handleQuotePost}
            onShareExternal={handleShareExternal}
            onReportPost={(postId) => handleOpenReport('post', postId)}
            onReportComment={(commentId) => handleOpenReport('comment', commentId)}
            onPinPost={handlePinPost}
            onUnpinPost={handleUnpinPost}
            onRetryPendingPost={handleRetryPendingPost}
            postLimits={postLimits}
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
            settingsTourSection={settingsTourSection}
            showProfileSetupNudge={
              !!currentUser &&
              !currentUser.profileCompletedAt &&
              profileTour.showReminderBanner
            }
            onContinueProfileSetup={() => profileTour.start(0)}
            onDismissProfileSetup={profileTour.snoozeFromBanner}
            onStartProfileTour={() => profileTour.start(0)}
            onResetProfileTour={async () => {
              if (!token) return;
              try {
                const res = await fetch(`${API_URL}/api/me/profile-setup/reset`, {
                  method: 'POST',
                  headers: getHeaders(),
                });
                if (res.ok) {
                  const data = await res.json() as { user?: UserType };
                  if (data.user) {
                    setCurrentUser(data.user);
                    localStorage.setItem('hin_user', JSON.stringify(data.user));
                    setProfileUser(prev => (prev?.id === data.user!.id ? { ...prev, ...data.user } : prev));
                  }
                } else {
                  // Client-only fallback so the tour is still testable if the API is down.
                  setCurrentUser(prev => prev ? { ...prev, profileCompletedAt: null } : prev);
                  const saved = localStorage.getItem('hin_user');
                  if (saved) {
                    const parsed = JSON.parse(saved) as UserType;
                    localStorage.setItem('hin_user', JSON.stringify({ ...parsed, profileCompletedAt: null }));
                  }
                }
              } catch {
                setCurrentUser(prev => prev ? { ...prev, profileCompletedAt: null } : prev);
              }
              profileTour.resetAndStart();
            }}
            onResetFeedIntro={async () => {
              if (!token) return;
              try {
                await fetch(`${API_URL}/api/me/intro-walkthrough/reset`, {
                  method: 'POST',
                  headers: getHeaders(),
                });
              } catch {
                // Still reset locally so the tour is testable offline.
              }
              setIntroWalkthroughCompleted(false);
              setIsProfileSettingsOpen(false);
              goHome();
              walkthrough.resetAndStart();
            }}
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
            emailInput={emailInput}
            passwordInput={passwordInput}
            authError={authError}
            isAuthLoading={isAuthLoading}
            onBack={() => goHome()}
            onSignIn={handleGuestSignIn}
            onAuthSubmit={handleAuthSubmit}
            onUsernameChange={setUsernameInput}
            onEmailChange={setEmailInput}
            onPasswordChange={setPasswordInput}
            onToggleAuthMode={() => {
              setIsRegisterMode(!isRegisterMode);
              setAuthError(null);
            }}
            onGoogleCredential={handleGoogleCredential}
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
            onOpenSettings={openProfileSettings}
            onCloseSettings={closeProfileSettings}
            onToggleLike={handleToggleLike}
            onRepost={handleRepost}
            onUndoRepost={handleUndoRepost}
            onQuotePost={handleQuotePost}
            onShareExternal={handleShareExternal}
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
            onViewHashtag={tag => {
              if (!currentUser) {
                handleGuestSignIn();
                return;
              }
              handleViewHashtag(tag);
            }}
            onVotePoll={handleVotePoll}
            onRetractPollVote={handleRetractPollVote}
            onClosePoll={handleClosePoll}
            onOpenPost={openPost}
            onOpenOlabidItem={olabidEnabled ? openOlabidItem : undefined}
            onCopyPermalink={profileUser ? () => handleCopyProfilePermalink(profileUser.username) : undefined}
            onReport={profileUser && currentUser && profileUser.id !== currentUser.id
              ? () => handleOpenReport('user', profileUser.id)
              : undefined}
            onReportPost={(postId) => handleOpenReport('post', postId)}
            onReportComment={(commentId) => handleOpenReport('comment', commentId)}
            onPinPost={handlePinPost}
            onUnpinPost={handleUnpinPost}
            onRetryPendingPost={handleRetryPendingPost}
            onDeleteAccount={handleDeleteAccount}
            onSimulateSessionExpired={() => handleSessionExpired({ force: true })}
            postLimits={postLimits}
            profileGamification={profileGamification}
            showGamification={shouldShowGamification(profileGamification)}
            gamificationEnabled={gamificationEnabled}
            onToggleEquipBadge={gamificationEnabled ? handleToggleEquipBadge : undefined}
          />
        ) : activeTab === 'feed' ? (
          <FeedView
            posts={posts}
            currentUser={currentUser}
            readOnly={!currentUser}
            onSignInRequired={() => handleGuestSignIn()}
            showNewPostForm={showNewPostForm}
            newPostContent={newPostContent}
            postSeedPreview={postSeedPreview}
            token={token}
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
            isInitialLoading={feedInitialLoading}
            hasMorePosts={feedNextCursor !== null}
            feedMode={feedMode}
            onFeedModeChange={handleFeedModeChange}
            activeHashtag={activeHashtag}
            onSelectHashtag={handleSelectHashtag}
            onLoadMore={loadMorePosts}
            onCloseCreatePost={() => {
              setShowNewPostForm(false);
              setPostSeedPreview(null);
            }}
            onNewPostContentChange={setNewPostContent}
            onCreatePost={handleCreatePost}
            onToggleLike={handleToggleLike}
            onRepost={handleRepost}
            onUndoRepost={handleUndoRepost}
            onQuotePost={handleQuotePost}
            onShareExternal={handleShareExternal}
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
            onViewHashtag={handleViewHashtag}
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
            onOpenOlabidItem={olabidEnabled ? openOlabidItem : undefined}
            onReportPost={(postId) => handleOpenReport('post', postId)}
            onReportComment={(commentId) => handleOpenReport('comment', commentId)}
            onPinPost={handlePinPost}
            onUnpinPost={handleUnpinPost}
            onRetryPendingPost={handleRetryPendingPost}
            postLimits={postLimits}
            gamificationEnabled={gamificationEnabled}
            onGamificationRefresh={() => { void fetchMyGamification(); }}
          />
        ) : activeTab === 'olabid' && olabidEnabled ? (
          olabidItemId ? (
            <OlabidItemPage
              itemId={olabidItemId}
              onBack={() => openOlabid()}
              currentUser={currentUser}
              gamificationEnabled={gamificationEnabled}
              threads={threads}
              token={token}
              comments={itemComments[olabidItemId] || []}
              newCommentText={newItemCommentText[olabidItemId] || ''}
              replyingTo={replyingToItemComment[olabidItemId] || null}
              editingCommentId={editingItemCommentId}
              editingCommentContent={editingItemCommentContent}
              onFetchComments={fetchItemComments}
              onCommentTextChange={text => setNewItemCommentText(prev => ({ ...prev, [olabidItemId]: text }))}
              onCreateComment={e => handleCreateItemComment(olabidItemId, e)}
              onCancelReply={() => setReplyingToItemComment(prev => ({ ...prev, [olabidItemId]: null }))}
              onReply={(id, comment) => setReplyingToItemComment(prev => ({ ...prev, [id]: comment }))}
              onDeleteComment={handleDeleteItemComment}
              onStartEdit={(commentId, content) => {
                setEditingItemCommentId(commentId);
                setEditingItemCommentContent(content);
              }}
              onCancelEdit={() => setEditingItemCommentId(null)}
              onSaveEdit={handleSaveItemCommentEdit}
              onEditContentChange={setEditingItemCommentContent}
              onToggleCommentLike={handleToggleItemCommentLike}
              onViewProfile={handleViewProfile}
              onViewHashtag={handleViewHashtag}
              onSignInRequired={handleGuestSignIn}
              onShareToChat={(recipient, prefillText, seedPreview) =>
                startChat(recipient, { prefillText, seedPreview })
              }
              onPostItem={handlePostOlabidItem}
            />
          ) : (
            <OlabidPage
              onOpenItem={(id) => openOlabidItem(id)}
              currentUser={currentUser}
              threads={threads}
              token={token}
              onShareToChat={(recipient, prefillText, seedPreview) =>
                startChat(recipient, { prefillText, seedPreview })
              }
              onPostItem={handlePostOlabidItem}
              onSignInRequired={handleGuestSignIn}
            />
          )
        ) : currentUser && activeTab === 'admin' ? (
          <AdminDashboard
            section={adminSection}
            onNavigateSection={(section) => openAdmin(section)}
            adminData={adminData}
            broadcastHistory={broadcastHistory}
            adminReports={adminReports}
            currentUser={currentUser}
            token={token!}
            onImpersonateUser={handleImpersonateUser}
            onUpdateUserRole={handleUpdateUserRole}
            onDeleteUser={handleAdminDeleteUser}
            onReinstateUser={handleAdminReinstateUser}
            onLoadAdminData={fetchAdminStats}
            onLoadBroadcastHistory={fetchBroadcastHistory}
            onLoadReports={fetchAdminReports}
            onResetDataComplete={handleResetDataComplete}
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
              ensureMessagesClosed(() => {
                if (activeTab !== 'feed') goHome();
                setPostSeedPreview(null);
                setShowNewPostForm(true);
              });
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
            threadsLoading={threadsLoading}
            messagesLoading={messagesLoading}
            currentUser={currentUser}
            chatRecipient={chatRecipient}
            chatMessages={chatMessages}
            newMsgText={newMsgText}
            draftLinkPreview={draftLinkPreview}
            draftMediaPreviewUrl={pendingChatMedia?.previewUrl ?? null}
            sendingMedia={sendingChatMedia}
            typingUsers={typingUsers}
            onlineUserIds={onlineUserIds}
            lastSeenByUserId={lastSeenByUserId}
            chatBottomRef={chatBottomRef}
            onClose={closeMessagesPanel}
            onSelectThread={openChatInPanel}
            onBackToList={backToMessagesList}
            onNewMsgTextChange={setNewMsgText}
            onSendDM={handleSendDM}
            onRetryFailedMessage={handleRetryFailedMessage}
            replyingToMessage={replyingToMessage}
            onReplyToMessage={setReplyingToMessage}
            onClearReply={() => setReplyingToMessage(null)}
            onDeleteMessage={handleDeleteMessage}
            onTyping={handleUserTyping}
            onOpenProfile={openProfile}
            onOpenOlabidItem={olabidEnabled ? openOlabidItem : undefined}
            onDismissDraftPreview={dismissDraftLinkPreview}
            onPickChatImage={pickChatImage}
            onClearDraftMedia={clearDraftMedia}
            olabidEnabled={olabidEnabled}
            presenceEnabled={presenceEnabled}
          />
        )}

        <ToastContainer
          toasts={toasts}
          onToastClick={handleToastClick}
          onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))}
        />

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
