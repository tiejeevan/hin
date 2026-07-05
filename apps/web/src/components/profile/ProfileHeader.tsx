import { Shield, MessageCircle, Pencil, UserPlus, UserCheck, Clock, Settings } from 'lucide-react';
import { FollowStatus, User as UserType } from '@hin/types';
import { UserAvatar } from './UserAvatar';
import { ProfileEditForm } from './ProfileEditForm';

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
  onShowFollowers: () => void;
  onShowFollowing: () => void;
  pendingRequestCount?: number;
  isSettingsOpen?: boolean;
  onOpenSettings?: () => void;
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
  onShowFollowers,
  onShowFollowing,
  pendingRequestCount = 0,
  isSettingsOpen = false,
  onOpenSettings,
}: ProfileHeaderProps) {
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
  const isFollowing = followStatus === 'following';
  const isRequested = followStatus === 'requested';

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
            {isOwnProfile ? (
              <>
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
                <button
                  onClick={() => onStartChat(user)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-border-custom bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary transition-colors cursor-pointer min-h-[44px]"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Message
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-1 text-left">
          <h1 className="text-lg font-bold text-text-primary flex items-center gap-1.5 flex-wrap">
            {user.username}
            {user.role === 'admin' && <Shield className="h-4 w-4 text-amber-500" />}
            {followStatus === 'follows_you' && !isOwnProfile && (
              <span className="text-[10px] font-semibold text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-md">
                Follows you
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
      </div>
    </div>
  );
}
