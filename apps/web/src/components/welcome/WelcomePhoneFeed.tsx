import { PlusIcon } from './welcomePhoneIcons';
import { useWelcomePhoneFeed } from './useWelcomePhoneFeed';
import { WelcomePhonePost } from './WelcomePhonePost';

interface WelcomePhoneFeedProps {
  token: string | null;
  onSignIn: () => void;
}

export function WelcomePhoneFeed({ token, onSignIn }: WelcomePhoneFeedProps) {
  const feed = useWelcomePhoneFeed();

  const handleChipClick = () => {
    if (!token) onSignIn();
  };

  return (
    <div className="phone-stage" aria-label="Sample Hin feed preview">
      <div className="phone">
        <div className="phone-screen">
          <div className="phone-top">
            <span className="phone-heading">
              <img className="phone-logo" src="/icons/hin-logo.png" alt="Hin" />
              <strong>For you</strong>
            </span>
            <span className="live-dot">now</span>
          </div>
          <div className="phone-feed-scroll">
            {feed.posts.map(post => (
              <WelcomePhonePost
                key={post.id}
                post={post}
                onToggleLike={feed.toggleLike}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          className="floating-chip"
          onClick={handleChipClick}
          aria-label="New Thought"
        >
          <PlusIcon />
          New Thought
        </button>
      </div>
    </div>
  );
}
