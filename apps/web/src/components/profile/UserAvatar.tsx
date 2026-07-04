import { getAvatarColor } from '../../utils/avatar';

interface UserAvatarProps {
  username: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-20 w-20 text-2xl',
  xl: 'h-28 w-28 text-3xl',
};

export function UserAvatar({ username, avatarUrl, size = 'md', className = '', onClick }: UserAvatarProps) {
  const sizeClass = sizeClasses[size];
  const interactive = onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : '';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`${username}'s avatar`}
        onClick={onClick}
        className={`rounded-full object-cover border border-border-custom shrink-0 ${sizeClass} ${interactive} ${className}`}
      />
    );
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-full border border-border-custom flex items-center justify-center font-bold uppercase shrink-0 ${getAvatarColor(username)} ${sizeClass} ${interactive} ${className}`}
    >
      {username[0]}
    </div>
  );
}
