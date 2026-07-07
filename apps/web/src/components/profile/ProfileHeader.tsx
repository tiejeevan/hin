import { useEffect, useRef, useState } from 'react';
import { Shield, MessageCircle, Pencil, UserPlus, UserCheck, Clock, Settings, MoreHorizontal, VolumeX, Volume2, Ban, UserX, Link2, Flag } from 'lucide-react';
import { BlockStatus, FollowStatus, MuteStatus, User as UserType, type GamificationPublic } from '@hin/types';
import { UserAvatar } from './UserAvatar';
import { ProfileEditForm } from './ProfileEditForm';
import { LevelBadge } from '../gamification/LevelBadge';
import { PointsDisplay } from '../gamification/PointsDisplay';
import { BadgeGrid } from '../gamification/BadgeGrid';

interface ProfileHeaderProps {
  user: UserType;
  isOwnProfile: boolean;
  isEditing: boolean;
  token: string;
  followBusy?: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onProfileSaved: (updated: UserType) => void;
  onStartChat: (user: UserType) => void;
  onFollow: (userId: number) => void;
  onUnfollow: (userId: number) => void;
  onCancelFollowRequest: (userId: number) => void;
  onBlockUser: (userId: number) => void;
  onUnblockUser: (userId: number) => void;
  onMuteUser: (userId: number) => void;
  onUnmuteUser: (userId: number) => void;
  onShowFollowers: () => void;
  onShowFollowing: () => void;
  pendingRequestCount?: number;
  isSettingsOpen?: boolean;
  onOpenSettings?: () => void;
  readOnly?: boolean;
  onCopyPermalink?: () => void;
  onReport?: () => void;
  onSignInRequired?: () => void;
  gamification?: GamificationPublic | null;
  showGamification?: boolean;
}

function followButtonLabel(status: FollowStatus | undefined, isPrivate: boolean | undefined): string {
  if (status === 'following') return 'Following';
  if (status === 'requested') return 'Requested';
  return isPrivate ? 'Request' : 'Follow';
}

export function ProfileHeader({
  user,
  isOwnProfile,
  isEditing,
  token,
  followBusy,
  onStartEdit,
  onCancelEdit,
  onProfileSaved,
  onStartChat,
  onFollow,
  onUnfollow,
  onCancelFollowRequest,
  onBlockUser,
  onUnblockUser,
  onMuteUser,
  onUnmuteUser,
  onShowFollowers,
  onShowFollowing,
  pendingRequestCount = 0,
  isSettingsOpen = false,
  onOpenSettings,
  readOnly = false,
  onCopyPermalink,
  onReport,
  onSignInRequired,
  gamification,
  showGamification = false,
}: ProfileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  if (isEditing && isOwnProfile) {
    return (
      <ProfileEditForm
        user={user}
        token={token}
        onSave={updated => {
          onProfileSaved(updated);
          onCancelEdit();
        }}
        onCancel={onCancelEdit}
      />
    );
  }

  const followStatus = user.followStatus ?? 'none';
  const blockStatus: BlockStatus = user.blockStatus ?? 'none';
  const muteStatus: MuteStatus = user.muteStatus ?? 'none';
  const isFollowing = followStatus === 'following';
  const isRequested = followStatus === 'requested';
  const youBlocked = blockStatus === 'you_blocked';
  const isMuted = muteStatus === 'muted';
  const canInteract = blockStatus === 'none';

  const handleFollowClick = () => {
    if (followBusy) return;
    if (isFollowing) onUnfollow(user.id);
    else if (isRequested) onCancelFollowRequest(user.id);
    else onFollow(user.id);
  };

  return (
    <div className="bg-bg-secondary border border-border-custom rounded-2xl overflow-hidden shadow-sm">
      <div className="relative h-36 md:h-44 bg-gradient-to-br from-indigo-600/40 via-violet-600/30 to-bg-tertiary">
        {user.coverUrl && (
          <img src={user.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {user.isPrivate && (
          <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg bg-black/40 text-white/90">
            Private
          </span>
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-end justify-between -mt-10 md:-mt-12">
          <UserAvatar
            username={user.username}
            avatarUrl={user.avatarUrl}
            size="xl"
            className="border-4 border-bg-secondary"
          />

          <div className="flex items-center gap-2 pb-1">
            {readOnly ? (
              onSignInRequired && (
                <button
                  type="button"
                  onClick={onSignInRequired}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer min-h-[44px]"
                >
                  Sign in
                </button>
              )
            ) : isOwnProfile ? (
              <>
                {onCopyPermalink && (
                  <button
                    type="button"
                    onClick={onCopyPermalink}
                    className="flex items-center justify-center w-11 h-11 rounded-xl border border-border-custom bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary transition-colors cursor-pointer"
                    aria-label="Copy profile link"
                    title="Copy profile link"
                  >
                    <Link2 className="h-4 w-4" />
                  </button>
                )}
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
                      isSettingsOpen
                        ? 'bg-indigo-600 text-white'
                        : 'border border-border-custom bg-bg-tertiary text-text-primary hover:bg-bg-tertiary/80'
                    }`}
                    aria-label="Profile settings"
                    title="Profile settings"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    {pendingRequestCount > 0 && !isSettingsOpen && (
                      <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
                      </span>
                    )}
                  </button>
                )}
                <button
                  onClick={onStartEdit}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer min-h-[44px]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Profile
                </button>
              </>
            ) : youBlocked ? (
              <button
                type="button"
                disabled={followBusy}
                onClick={() => onUnblockUser(user.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-border-custom bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
              >
                <UserX className="h-3.5 w-3.5" />
                Unblock
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={followBusy}
                  onClick={handleFollowClick}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[44px] disabled:opacity-50 ${
                    isFollowing || isRequested
                      ? 'border border-border-custom bg-bg-tertiary text-text-primary hover:bg-bg-tertiary/80'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {isFollowing ? (
                    <UserCheck className="h-3.5 w-3.5" />
                  ) : isRequested ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  {followButtonLabel(followStatus, user.isPrivate)}
                </button>
                {canInteract && (
                  <button
                    type="button"
                    onClick={() => onStartChat(user)}
                    className="flex items-center justify-center w-11 h-11 rounded-xl border border-border-custom bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary transition-colors cursor-pointer"
                    aria-label="Message"
                    title="Message"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                )}
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(prev => !prev)}
                    className="flex items-center justify-center w-11 h-11 rounded-xl border border-border-custom bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary transition-colors cursor-pointer"
                    aria-label="More actions"
                    aria-expanded={menuOpen}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] py-1 rounded-xl border border-border-custom bg-bg-secondary shadow-lg">
                      <button
                        type="button"
                        disabled={followBusy}
                        onClick={() => {
                          setMenuOpen(false);
                          if (isMuted) onUnmuteUser(user.id);
                          else onMuteUser(user.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isMuted ? (
                          <>
                            <Volume2 className="h-3.5 w-3.5" />
                            Unmute
                          </>
                        ) : (
                          <>
                            <VolumeX className="h-3.5 w-3.5" />
                            Mute
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={followBusy}
                        onClick={() => {
                          setMenuOpen(false);
                          onBlockUser(user.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Block
                      </button>
                      {onReport && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onReport();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <Flag className="h-3.5 w-3.5" />
                          Report
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {youBlocked && (
          <p className="mt-3 text-xs text-text-muted bg-bg-tertiary border border-border-custom rounded-lg px-3 py-2">
            You blocked this user. Their posts are hidden from your feed.
          </p>
        )}

        <div className="mt-3 space-y-1 text-left">
          <h1 className="text-lg font-bold text-text-primary flex items-center gap-1.5 flex-wrap">
            {user.username}
            {showGamification && gamification && (
              <>
                <LevelBadge level={gamification.level} />
                <PointsDisplay totalPoints={gamification.totalPoints} compact />
              </>
            )}
            {user.role === 'admin' && <Shield className="h-4 w-4 text-amber-500" />}
            {followStatus === 'follows_you' && !isOwnProfile && canInteract && (
              <span className="text-[10px] font-semibold text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-md">
                Follows you
              </span>
            )}
            {isMuted && !isOwnProfile && !youBlocked && (
              <span className="text-[10px] font-semibold text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-md">
                Muted
              </span>
            )}
          </h1>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <button type="button" onClick={onShowFollowers} className="hover:text-text-primary cursor-pointer">
              <span className="font-semibold text-text-secondary">{user.followerCount ?? 0}</span> followers
            </button>
            <button type="button" onClick={onShowFollowing} className="hover:text-text-primary cursor-pointer">
              <span className="font-semibold text-text-secondary">{user.followingCount ?? 0}</span> following
            </button>
          </div>
          <p className="text-xs text-text-muted">
            Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            {user.postCount != null && user.postCount > 0 && ` · ${user.postCount} post${user.postCount === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="mt-4 text-left">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">About</h2>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
            {user.bio?.trim() || (isOwnProfile ? 'Add a bio to tell others about yourself.' : 'No bio yet.')}
          </p>
        </div>

        {showGamification && gamification && gamification.badges.length > 0 && (
          <BadgeGrid badges={gamification.badges} className="mt-4 text-left" />
        )}
      </div>
    </div>
  );
}
