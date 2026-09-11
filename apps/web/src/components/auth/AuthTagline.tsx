import { Fragment } from 'react';

const TAGLINE = ['Connect', 'Share', 'Repeat'] as const;

export function AuthTagline() {
  return (
    <div
      className="auth-tagline flex items-center justify-center flex-wrap gap-x-2.5 gap-y-1 sm:gap-x-3"
      aria-label="Connect, Share, Repeat"
    >
      {TAGLINE.map((word, index) => (
        <Fragment key={word}>
          {index > 0 && (
            <span
              className="auth-tagline-dot h-1.5 w-1.5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 shadow-[0_0_10px_rgba(129,140,248,0.45)] shrink-0"
              style={{ animationDelay: `${0.35 + index * 0.1}s` }}
              aria-hidden
            />
          )}
          <span
            className="auth-tagline-word text-[13px] sm:text-sm font-semibold tracking-[0.12em] bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent"
            style={{ animationDelay: `${0.2 + index * 0.1}s` }}
          >
            {word}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
