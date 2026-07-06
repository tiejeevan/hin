import type { ReactNode } from 'react';

const MENTION_RE = /@([a-zA-Z0-9_]{3,30})\b/g;

interface MentionsTextProps {
  content: string;
  onViewProfile: (userIdOrUsername: number | string) => void;
  className?: string;
}

export function MentionsText({ content, onViewProfile, className }: MentionsTextProps) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, 'g');

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const username = match[1];
    parts.push(
      <button
        key={`${match.index}-${username}`}
        type="button"
        onClick={e => {
          e.stopPropagation();
          onViewProfile(username);
        }}
        className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
      >
        @{username}
      </button>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <p className={className}>{parts.length > 0 ? parts : content}</p>;
}
