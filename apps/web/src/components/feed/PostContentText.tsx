import type { ReactNode } from 'react';

// Mirrors the backend's parseMentions/parseHashtags regexes exactly (apps/api/src/lib/mentions.ts, hashtags.ts).
const TOKEN_RE = /@([a-zA-Z0-9_]{3,30})\b|#([a-zA-Z0-9_]{1,50})\b/g;

interface PostContentTextProps {
  content: string;
  onViewProfile: (userIdOrUsername: number | string) => void;
  /** When omitted, hashtags render as plain (non-clickable) text. */
  onViewHashtag?: (tag: string) => void;
  className?: string;
}

export function PostContentText({ content, onViewProfile, onViewHashtag, className }: PostContentTextProps) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE.source, 'g');

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const [full, username, tag] = match;
    if (username) {
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
    } else if (tag && onViewHashtag) {
      parts.push(
        <button
          key={`${match.index}-${tag}`}
          type="button"
          onClick={e => {
            e.stopPropagation();
            onViewHashtag(tag.toLowerCase());
          }}
          className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
        >
          #{tag}
        </button>
      );
    } else {
      parts.push(full);
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return (
    <p className={`overflow-hidden break-words [overflow-wrap:anywhere] ${className ?? ''}`}>
      {parts.length > 0 ? parts : content}
    </p>
  );
}
