import { User as UserType } from '@hin/types';
import { Shield } from 'lucide-react';
import { UserAvatar } from '../profile/UserAvatar';

interface MentionSuggestionsProps {
  suggestions: UserType[];
  activeIndex: number;
  onSelect: (username: string) => void;
}

export function MentionSuggestions({ suggestions, activeIndex, onSelect }: MentionSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="absolute z-50 bg-bg-secondary border border-border-custom rounded-2xl shadow-xl max-h-48 overflow-y-auto w-64 overflow-hidden mt-1 backdrop-blur-md bg-opacity-95 text-left">
      <ul className="py-1">
        {suggestions.map((user, idx) => (
          <li
            key={user.id}
            onMouseDown={(e) => {
              // Prevent losing focus on input before selecting
              e.preventDefault();
            }}
            onClick={() => onSelect(user.username)}
            className={`flex items-center gap-2.5 px-3 py-2 text-xs text-text-primary cursor-pointer transition-colors ${
              idx === activeIndex
                ? 'bg-indigo-600/20 text-indigo-400 font-semibold'
                : 'hover:bg-bg-tertiary'
            }`}
          >
            <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="sm" />
            <span className="flex-grow text-left font-medium">{user.username}</span>
            {user.role === 'admin' && (
              <Shield className="h-3 w-3 text-amber-500 shrink-0" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
