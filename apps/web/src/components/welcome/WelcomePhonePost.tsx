import type { WelcomeMockPostView } from './welcomePhoneTypes';
import { HeartIcon, ReplyIcon } from './welcomePhoneIcons';

interface WelcomePhonePostProps {
  post: WelcomeMockPostView;
  onToggleLike: (mockId: string) => void;
}

export function WelcomePhonePost({ post, onToggleLike }: WelcomePhonePostProps) {
  const avatarClass = post.avatarTone ? `avatar ${post.avatarTone}` : 'avatar';

  return (
    <article className="post" data-mock="true">
      <div className="post-head">
        <span className={avatarClass}>{post.initial}</span>
        <div className="identity">
          <b>{post.displayName}</b>
          <span>
            @{post.username} · {post.timeLabel}
          </span>
        </div>
      </div>
      <p>{post.content}</p>
      {post.mediaHint && <p className="phone-media-hint">{post.mediaHint}</p>}
      {post.linkHint && <p className="phone-link-hint">{post.linkHint}</p>}
      {post.poll && (
        <div className="poll" aria-label="Sample poll">
          {post.poll.map(row => (
            <div
              key={row.label}
              className="poll-row"
              style={{ ['--fill' as string]: `${row.fillPercent}%` }}
            >
              <span>{row.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="post-actions">
        <span className="post-action-stat" aria-label={`${post.commentsCount} replies`}>
          <ReplyIcon />
          {post.commentsCount}
        </span>
        <button
          type="button"
          className={`post-action-btn${post.hasLiked ? ' liked' : ''}`}
          onClick={() => onToggleLike(post.id)}
          aria-pressed={post.hasLiked}
          aria-label={post.hasLiked ? 'Unlike' : 'Like'}
        >
          <HeartIcon />
          {post.likesCount}
        </button>
      </div>
    </article>
  );
}
