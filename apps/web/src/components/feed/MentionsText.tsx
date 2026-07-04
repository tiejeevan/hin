import type { ReactNode } from 'react';
import { User as UserType } from '@hin/types';

const MENTION_RE = /@([a-zA-Z0-9_]{3,30})\b/g;

interface MentionsTextProps {
  content: string;
  users: UserType[];
  onViewProfile: (userId: number) => void;
  className?: string;
}

export function MentionsText({ content, users, onViewProfile, className }: MentionsTextProps) {
  const usersByName = new Map(users.map(u => [u.username, u]));
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, 'g');

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const username = match[1];
    const user = usersByName.get(username);
    if (user) {
      parts.push(
        <button
          key={`${match.index}-${user.id}`}
          type="button"
          onClick={e => {
            e.stopPropagation();
            onViewProfile(user.id);
          }}
          className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
        >
          @{user.username}
        </button>
      );
    } else {
      parts.push(
        <span key={`${match.index}-${username}`} className="text-indigo-400/70 font-medium">
          @{username}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <p className={className}>{parts.length > 0 ? parts : content}</p>;
}
