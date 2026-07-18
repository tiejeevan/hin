import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X, Shield, SquarePen, ChevronLeft, Maximize2, Minimize2, Send, MessageCircle, ImagePlus, Camera, Loader2 } from 'lucide-react';
import { ChatThread, LinkPreview, Message, User as UserType } from '@hin/types';
import { ChatRecipient } from '../../types/ui';
import { UserAvatar } from '../profile/UserAvatar';
import { EquippedBadgesInline } from '../gamification/EquippedBadgesInline';
import { useOverscrollBounce } from '../../hooks/useOverscrollBounce';
import { LinkPreviewCard } from '../feed/LinkPreviewCard';
import { getOlabidItemIdFromUrl } from '../../lib/appRoutes';

const TEXTAREA_MAX_HEIGHT_PX = 120;

function prefersTouchComposer(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

interface MessagesPanelProps {
  isOpen: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  threads: ChatThread[];
  currentUser: UserType;
  chatRecipient: ChatRecipient | null;
  chatMessages: Message[];
  newMsgText: string;
  draftLinkPreview?: LinkPreview | null;
  draftMediaPreviewUrl?: string | null;
  sendingMedia?: boolean;
  typingUsers: Record<number, boolean>;
  onlineUserIds: Set<number>;
  chatBottomRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onSelectThread: (thread: ChatRecipient) => void;
  onBackToList: () => void;
  onNewMsgTextChange: (text: string) => void;
  onSendDM: (e: React.FormEvent) => void;
  onTyping: (recipientId: number) => void;
  onOpenProfile: (userId: number, opts?: { username?: string }) => void;
  onOpenOlabidItem?: (itemId: number) => void;
  onDismissDraftPreview?: () => void;
  onPickChatImage?: (file: File) => void;
  onClearDraftMedia?: () => void;
  olabidEnabled?: boolean;
  /** When false, hide all online/offline indicators (no presence feature). */
  presenceEnabled?: boolean;
}

export function MessagesPanel({
  isOpen,
  isExpanded,
  onToggleExpand,
  threads,
  currentUser,
  chatRecipient,
  chatMessages,
  newMsgText,
  draftLinkPreview = null,
  draftMediaPreviewUrl = null,
  sendingMedia = false,
  typingUsers,
  onlineUserIds,
  chatBottomRef,
  onClose,
  onSelectThread,
  onBackToList,
  onNewMsgTextChange,
  onSendDM,
  onTyping,
  onOpenProfile,
  onOpenOlabidItem,
  onDismissDraftPreview,
  onPickChatImage,
  onClearDraftMedia,
  olabidEnabled = true,
  presenceEnabled = false,
}: MessagesPanelProps) {
  const sorted = useMemo(() => {
    return [...threads].sort((a, b) => {
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime();
      }
      if (a.lastMessage) return -1;
      if (b.lastMessage) return 1;
      return a.username.localeCompare(b.username);
    });
  }, [threads]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isExpanded) onToggleExpand();
        else onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isExpanded, onClose, onToggleExpand]);

  // Scroll stays wherever the pointer is (no page lock). These give the chat and
  // conversation lists a rubber-band bump at the start/end and stop scroll from
  // chaining to the page behind.
  const chatScrollRef = useOverscrollBounce<HTMLDivElement>(isOpen);
  const listScrollRef = useOverscrollBounce<HTMLDivElement>(isOpen);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const peerIsTyping = !!(chatRecipient && typingUsers[chatRecipient.id]);
  const canSend = !!(newMsgText.trim() || draftMediaPreviewUrl) && !sendingMedia;

  const stopCameraStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const closeCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraStarting(false);
  };

  const openGallery = () => {
    setAttachMenuOpen(false);
    galleryInputRef.current?.click();
  };

  const openCamera = async () => {
    setAttachMenuOpen(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    setCameraOpen(true);
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      closeCamera();
      cameraInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || !onPickChatImage) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      blob => {
        if (!blob) return;
        onPickChatImage(new File([blob], `chat-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        closeCamera();
      },
      'image/jpeg',
      0.92,
    );
  };

  useEffect(() => {
    if (!attachMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAttachMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!cameraOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCamera();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      stopCameraStream();
    };
  }, [cameraOpen]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
  }, [newMsgText, chatRecipient?.id, isOpen]);

  useEffect(() => {
    if (!isOpen || isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      const panel = document.getElementById('messages-panel');
      const fab = document.getElementById('messages-fab-trigger');
      const target = e.target as Node;
      if (panel?.contains(target) || fab?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isExpanded, onClose]);

  if (!isOpen) return null;

  const showingChat = !!chatRecipient;
  const anchorBottom = 'bottom-[4.75rem]';

  return (
    <>
      {!isExpanded && (
        <div
          className="fixed inset-0 z-40 bg-black/20 animate-backdrop-fade-in"
          onClick={onClose}
          aria-hidden
        />
      )}

      <div
        id="messages-panel"
        className={
          isExpanded
            ? 'fixed inset-0 z-50 flex flex-col bg-bg-secondary border border-border-custom shadow-2xl overflow-hidden animate-panel-pop-anchor'
            : `fixed right-4 ${anchorBottom} z-50 flex flex-col w-[min(380px,calc(100vw-2rem))] h-[min(520px,62vh)] bg-bg-secondary border border-border-custom shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)] overflow-hidden animate-panel-pop-anchor rounded-2xl rounded-br-xl`
        }
        role="dialog"
        aria-label="Messages"
      >
        <PanelHeader
          showingChat={showingChat}
          chatRecipient={chatRecipient}
          isOnline={presenceEnabled && chatRecipient ? onlineUserIds.has(chatRecipient.id) : false}
          showPresence={presenceEnabled}
          isTyping={peerIsTyping}
          isExpanded={isExpanded}
          onBack={onBackToList}
          onToggleExpand={onToggleExpand}
          onClose={onClose}
          onOpenProfile={onOpenProfile}
        />

        {showingChat && chatRecipient ? (
          <>
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2 bg-chat-bg min-h-0">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-muted text-[11px] gap-1.5 py-8">
                  <MessageCircle className="h-7 w-7 opacity-40" />
                  <span>No messages yet. Say hello!</span>
                </div>
              ) : (
                chatMessages.map((msg, index) => {
                  const isMe = msg.senderId === currentUser.id;
                  const prevMsg = index > 0 ? chatMessages[index - 1] : null;
                  const isLast = index === chatMessages.length - 1;
                  const showTime =
                    !prevMsg ||
                    new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 15 * 60 * 1000;

                  return (
                    <div key={msg.id} className="flex flex-col">
                      {showTime && (
                        <div className="text-[10px] text-text-muted font-medium text-center my-2">
                          {new Date(msg.createdAt).toLocaleDateString([], {
                            weekday: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-[18px] px-3 py-2 text-[12px] leading-snug ${
                            isMe
                              ? 'bg-msg-me text-msg-me-text rounded-br-[4px]'
                              : 'bg-msg-other text-msg-other-text rounded-bl-[4px] border border-border-custom'
                          }`}
                        >
                          {msg.mediaUrl && (
                            <a
                              href={msg.mediaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block mb-1.5 -mx-0.5 rounded-xl overflow-hidden bg-black/10"
                            >
                              <img
                                src={msg.mediaUrl}
                                alt="Attachment"
                                className="max-w-full max-h-56 object-cover"
                                loading="lazy"
                              />
                            </a>
                          )}
                          {msg.content ? (
                            <p className="break-words whitespace-pre-wrap text-left">{msg.content}</p>
                          ) : null}
                          {msg.linkPreview && (
                            <div className="mt-1.5 -mx-0.5">
                              <LinkPreviewCard
                                preview={msg.linkPreview}
                                compact
                                inAppOlabidLinks={olabidEnabled}
                                onClick={e => {
                                  const itemId = getOlabidItemIdFromUrl(msg.linkPreview!.url);
                                  if (itemId !== null && onOpenOlabidItem) {
                                    e.preventDefault();
                                    onOpenOlabidItem(itemId);
                                    onClose();
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {isLast && isMe && (
                        <div className="text-[10px] text-text-muted text-right pr-1 mt-0.5">
                          {msg.read ? 'Read' : 'Delivered'}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            {(draftLinkPreview || draftMediaPreviewUrl) && (
              <div className="px-2.5 pt-2 bg-chat-input border-t border-border-custom shrink-0 space-y-2">
                {draftMediaPreviewUrl && (
                  <div className="relative inline-block">
                    <img
                      src={draftMediaPreviewUrl}
                      alt="Attachment preview"
                      className="h-20 w-20 rounded-xl object-cover border border-border-custom"
                    />
                    {onClearDraftMedia && (
                      <button
                        type="button"
                        onClick={onClearDraftMedia}
                        className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-bg-tertiary border border-border-custom text-text-muted hover:text-text-primary flex items-center justify-center cursor-pointer"
                        aria-label="Remove image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
                {draftLinkPreview && (
                  <LinkPreviewCard
                    preview={draftLinkPreview}
                    compact
                    inAppOlabidLinks={olabidEnabled}
                    onDismiss={onDismissDraftPreview}
                  />
                )}
              </div>
            )}

            <form
              onSubmit={(e: FormEvent) => {
                if (!canSend) {
                  e.preventDefault();
                  return;
                }
                onSendDM(e);
              }}
              className={`p-2.5 bg-chat-input flex items-end gap-2 shrink-0 pb-safe ${draftLinkPreview || draftMediaPreviewUrl ? '' : 'border-t border-border-custom'}`}
            >
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file && onPickChatImage) onPickChatImage(file);
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file && onPickChatImage) onPickChatImage(file);
                }}
              />
              {onPickChatImage && (
                <div ref={attachMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setAttachMenuOpen(prev => !prev)}
                    disabled={sendingMedia}
                    className="h-10 w-10 rounded-full border border-border-custom bg-input-bg text-text-muted hover:text-text-primary hover:bg-bg-tertiary flex items-center justify-center cursor-pointer disabled:opacity-40"
                    aria-label="Attach image"
                    aria-haspopup="menu"
                    aria-expanded={attachMenuOpen}
                    title="Attach image"
                  >
                    <ImagePlus className="h-4 w-4" />
                  </button>
                  {attachMenuOpen && (
                    <div
                      role="menu"
                      className="absolute left-0 bottom-full mb-1 w-44 rounded-xl border border-border-custom bg-bg-secondary shadow-lg overflow-hidden z-20"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={openGallery}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
                      >
                        <ImagePlus className="h-3.5 w-3.5 shrink-0" />
                        Choose photo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void openCamera()}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
                      >
                        <Camera className="h-3.5 w-3.5 shrink-0" />
                        Take photo
                      </button>
                    </div>
                  )}
                </div>
              )}
              <textarea
                ref={composerRef}
                rows={1}
                placeholder="Message"
                value={newMsgText}
                aria-label="Message"
                onChange={e => {
                  onNewMsgTextChange(e.target.value);
                  onTyping(chatRecipient.id);
                }}
                onKeyDown={(e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key !== 'Enter') return;
                  // Mobile / touch: Return inserts a newline; Send button sends.
                  if (prefersTouchComposer()) return;
                  // Desktop: Enter sends, Shift+Enter inserts a newline.
                  if (e.shiftKey) return;
                  e.preventDefault();
                  if (!canSend) return;
                  e.currentTarget.form?.requestSubmit();
                }}
                className="flex-grow bg-input-bg border border-border-custom rounded-2xl px-3 py-2 text-[12px] text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/20 min-h-[40px] max-h-[120px] resize-none leading-snug overflow-y-auto"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white p-2 rounded-full shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            {cameraOpen && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
                <div className="w-full max-w-md rounded-2xl border border-border-custom bg-bg-secondary overflow-hidden shadow-xl">
                  <div className="relative aspect-[4/3] bg-black">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="h-full w-full object-cover"
                    />
                    {cameraStarting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="h-8 w-8 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 p-3">
                    <button
                      type="button"
                      onClick={closeCamera}
                      className="px-3 py-2 rounded-xl text-xs text-text-muted hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      disabled={cameraStarting}
                      className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors cursor-pointer min-h-[44px]"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Capture
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div ref={listScrollRef} className="overflow-y-auto overscroll-contain divide-y divide-border-custom/50 flex-1 min-h-0">
            {sorted.length === 0 ? (
              <div className="px-3 py-10 text-center text-[11px] text-text-muted leading-snug flex flex-col items-center gap-2">
                <SquarePen className="h-4 w-4 opacity-50" />
                No messages yet.
              </div>
            ) : (
              sorted.map(t => {
                const hasUnread = t.unreadCount > 0;
                const isOnline = presenceEnabled && onlineUserIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectThread({ id: t.id, username: t.username, role: t.role, avatarUrl: t.avatarUrl })}
                    className={`w-full px-3 py-2.5 flex gap-2.5 text-left cursor-pointer transition-colors min-h-[52px] ${
                      hasUnread
                        ? 'bg-indigo-950/20 hover:bg-indigo-950/30 border-l-2 border-l-indigo-500'
                        : 'hover:bg-bg-tertiary/50'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <UserAvatar
                        username={t.username}
                        avatarUrl={t.avatarUrl}
                        size="md"
                        className={hasUnread ? 'ring-2 ring-indigo-500/60' : ''}
                      />
                      {presenceEnabled && (
                        <span
                          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg-secondary ${
                            isOnline ? 'bg-emerald-500' : 'bg-text-muted/60'
                          }`}
                          title={isOnline ? 'Online' : 'Offline'}
                          aria-label={isOnline ? 'Online' : 'Offline'}
                        />
                      )}
                      {hasUnread && (
                        <span className="absolute -top-0.5 -right-0.5 h-[18px] min-w-[18px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-bg-secondary">
                          {t.unreadCount > 9 ? '9+' : t.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <p
                          className={`text-[11px] truncate ${hasUnread ? 'font-bold text-text-primary' : 'font-semibold text-text-primary'}`}
                        >
                          {t.username}
                          {t.equippedBadges && t.equippedBadges.length > 0 && (
                            <EquippedBadgesInline
                              badges={t.equippedBadges}
                              size="sm"
                              className="ml-0.5 align-text-bottom"
                            />
                          )}
                          {t.role === 'admin' && (
                            <Shield className="h-3 w-3 text-amber-500 inline ml-0.5 align-text-bottom" />
                          )}
                        </p>
                        {t.lastMessage && (
                          <span
                            className={`text-[10px] shrink-0 leading-none ${hasUnread ? 'text-indigo-400 font-medium' : 'text-text-muted'}`}
                          >
                            {new Date(t.lastMessage.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        {typingUsers[t.id] ? (
                          <p className="text-[10px] font-medium text-indigo-400">Typing…</p>
                        ) : t.lastMessage ? (
                          <p
                            className={`text-[10px] truncate leading-snug ${hasUnread ? 'text-text-primary font-semibold' : 'text-text-muted'}`}
                          >
                            {t.lastMessage.senderId === currentUser.id ? 'You: ' : ''}
                            {t.lastMessage.content}
                          </p>
                        ) : (
                          <p className="text-[10px] text-text-muted italic">No messages yet</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  );
}

function PanelHeader({
  showingChat,
  chatRecipient,
  isOnline,
  showPresence,
  isTyping,
  isExpanded,
  onBack,
  onToggleExpand,
  onClose,
  onOpenProfile,
}: {
  showingChat: boolean;
  chatRecipient: ChatRecipient | null;
  isOnline: boolean;
  showPresence: boolean;
  isTyping: boolean;
  isExpanded: boolean;
  onBack: () => void;
  onToggleExpand: () => void;
  onClose: () => void;
  onOpenProfile: (userId: number, opts?: { username?: string }) => void;
}) {
  return (
    <div className="px-3 py-2 flex items-center justify-between bg-bg-primary/50 border-b border-border-custom/60 shrink-0 gap-2">
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {showingChat && chatRecipient ? (
          <>
            <button
              onClick={onBack}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-indigo-400 hover:bg-bg-tertiary cursor-pointer shrink-0"
              aria-label="Back to conversations"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onOpenProfile(chatRecipient.id, { username: chatRecipient.username })}
              className="flex items-center gap-2 min-w-0 rounded-lg hover:bg-bg-tertiary/60 px-1 -mx-1 py-0.5 transition-colors cursor-pointer text-left"
              aria-label={`View ${chatRecipient.username}'s profile`}
            >
              <div className="relative shrink-0">
                <UserAvatar
                  username={chatRecipient.username}
                  avatarUrl={chatRecipient.avatarUrl}
                  size="sm"
                />
                {showPresence && (
                  <span
                    className={`absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-bg-primary ${
                      isOnline ? 'bg-emerald-500' : 'bg-text-muted/60'
                    }`}
                    title={isOnline ? 'Online' : 'Offline'}
                    aria-label={isOnline ? 'Online' : 'Offline'}
                  />
                )}
              </div>
              <div className="min-w-0 leading-tight">
                <span className="text-[11px] font-semibold text-text-primary truncate block hover:text-indigo-400 transition-colors">
                  {chatRecipient.username}
                </span>
                {isTyping ? (
                  <span className="text-[10px] font-medium text-indigo-400">Typing…</span>
                ) : showPresence ? (
                  <span className={`text-[10px] ${isOnline ? 'text-emerald-500' : 'text-text-muted'}`}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                ) : null}
              </div>
            </button>
          </>
        ) : (
          <span className="text-[11px] font-semibold text-text-secondary tracking-wide">Messages</span>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onToggleExpand}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer transition-colors"
          aria-label={isExpanded ? 'Collapse messages' : 'Expand messages'}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          onClick={onClose}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer transition-colors"
          aria-label="Dismiss messages"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
