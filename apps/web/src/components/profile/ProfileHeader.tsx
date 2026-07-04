import { Shield, MessageCircle, Pencil } from 'lucide-react';
import { User as UserType } from '@hin/types';
import { UserAvatar } from './UserAvatar';
import { ProfileEditForm } from './ProfileEditForm';

interface ProfileHeaderProps {
  user: UserType;
  isOwnProfile: boolean;
  isEditing: boolean;
  token: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onProfileSaved: (updated: UserType) => void;
  onStartChat: (user: UserType) => void;
}

export function ProfileHeader({
  user,
  isOwnProfile,
  isEditing,
  token,
  onStartEdit,
  onCancelEdit,
  onProfileSaved,
  onStartChat,
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

  return (
    <div className="bg-bg-secondary border border-border-custom rounded-2xl overflow-hidden shadow-sm">
      <div className="relative h-36 md:h-44 bg-gradient-to-br from-indigo-600/40 via-violet-600/30 to-bg-tertiary">
        {user.coverUrl && (
          <img src={user.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
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
              <button
                onClick={onStartEdit}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer min-h-[44px]"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Profile
              </button>
            ) : (
              <button
                onClick={() => onStartChat(user)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer min-h-[44px]"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Message
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-1 text-left">
          <h1 className="text-lg font-bold text-text-primary flex items-center gap-1.5">
            {user.username}
            {user.role === 'admin' && <Shield className="h-4 w-4 text-amber-500" />}
          </h1>
          <p className="text-xs text-text-muted">
            Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            {user.postCount !== undefined && ` · ${user.postCount} post${user.postCount === 1 ? '' : 's'}`}
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
