import { useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import './welcomePage.css';
import { WelcomePhoneFeed } from './WelcomePhoneFeed';

type FeedMood = 'curious' | 'honest' | 'useful' | 'playful';

type SamplePost = {
  context: string;
  initial: string;
  name: string;
  handle: string;
  text: string;
  replies: string;
  likes: string;
  tone: '' | 'orange' | 'green';
};

const SAMPLES: Record<FeedMood, SamplePost> = {
  curious: {
    context: 'A question worth sitting with',
    initial: 'N',
    name: 'Noor',
    handle: '@noorthinks · just now',
    text: 'What’s something you believed five years ago that you see completely differently now?',
    replies: '31 replies',
    likes: '64 likes',
    tone: '',
  },
  honest: {
    context: 'No polish required',
    initial: 'J',
    name: 'Jules',
    handle: '@juleswrites · 2m',
    text: 'Today was messy. I still showed up for the part that mattered, and I’m letting that be enough.',
    replies: '19 replies',
    likes: '83 likes',
    tone: 'orange',
  },
  useful: {
    context: 'A small idea with mileage',
    initial: 'T',
    name: 'Theo',
    handle: '@theobuilds · 8m',
    text: 'Try making tomorrow’s first decision tonight. Mine is simple: shoes by the door, walk before screens.',
    replies: '12 replies',
    likes: '48 likes',
    tone: 'green',
  },
  playful: {
    context: 'Serious debate, low stakes',
    initial: 'L',
    name: 'Liv',
    handle: '@livlaughs · 4m',
    text: 'You get one oddly specific superpower. I’m choosing the ability to find the cool side of any pillow.',
    replies: '46 replies',
    likes: '117 likes',
    tone: 'orange',
  },
};

const MOODS: { id: FeedMood; label: string }[] = [
  { id: 'curious', label: 'Curious' },
  { id: 'honest', label: 'Honest' },
  { id: 'useful', label: 'Useful' },
  { id: 'playful', label: 'Playful' },
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.7 9.7 0 0 1-4.2-1L3 20l1.2-4a8.4 8.4 0 1 1 16.8-4.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface WelcomePageProps {
  isAuthenticated?: boolean;
  token?: string | null;
  onStepInside?: () => void;
  onGoToApp?: () => void;
  onBack?: () => void;
}

export function WelcomePage({
  isAuthenticated,
  token = null,
  onStepInside,
  onGoToApp,
  onBack,
}: WelcomePageProps) {
  const [mood, setMood] = useState<FeedMood>('curious');
  const [fadeSwitch, setFadeSwitch] = useState(false);

  const sample = SAMPLES[mood];

  const chooseMood = useCallback((next: FeedMood) => {
    setMood(next);
    setFadeSwitch(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setFadeSwitch(true));
    });
  }, []);

  const avatarClass = sample.tone ? `avatar ${sample.tone}` : 'avatar';

  return (
    <div className="welcome-page">
      <div className="page-shell">
        <header className="welcome-header">
          <div className="welcome-header-top">
            <div className="welcome-brand" aria-label="Hin">
              <img src="/icons/hin-logo.png" alt="" aria-hidden="true" />
              <span>Hin</span>
            </div>
            {isAuthenticated ? (
              <button type="button" className="button primary welcome-sign-in" onClick={() => onGoToApp?.()}>
                Open Hin
              </button>
            ) : (
              <button type="button" className="button primary welcome-sign-in" onClick={() => onStepInside?.()}>
                Sign in
              </button>
            )}
          </div>
          <div className="welcome-header-sub">
            {onBack && (
              <button type="button" className="welcome-back" onClick={onBack}>
                <ArrowLeft aria-hidden="true" />
                Back
              </button>
            )}
            <nav className="welcome-section-nav" aria-label="Welcome page sections">
              <a href="#why">Why Hin</a>
              <a href="#preview">The feed</a>
            </nav>
          </div>
        </header>

        <main>
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <p className="tiny-note">A different kind of social</p>
              <h1 id="hero-title">
                Say what matters. Find <span className="marked">your people.</span>
              </h1>
              <p className="lede">
                Hin is a social space for short thoughts, real conversations, and the moments in
                between—without the pressure to perform.
              </p>
              <div className="actions">
                <a className="button primary" href="#preview">
                  See what it feels like
                  <ArrowIcon />
                </a>
                <a className="button" href="#why">
                  Why Hin?
                </a>
              </div>
            </div>

            <WelcomePhoneFeed
              token={token}
              onSignIn={() => onStepInside?.()}
            />
          </section>

          <section className="statement" aria-label="Hin philosophy">
            <div className="statement-inner">
              <h2>
                Less performance.
                <br />
                More presence.
              </h2>
              <p>
                Share the thought before it becomes a campaign. Join the conversation without
                turning yourself into a brand.
              </p>
            </div>
          </section>

          <section className="section" id="why" aria-labelledby="why-title">
            <div className="section-heading">
              <span className="section-index">01 / Why Hin</span>
              <h2 id="why-title">Built for conversation, not the scoreboard.</h2>
            </div>
            <div className="principles">
              <div className="principle-main">
                <span className="big-number">01</span>
                <h3>Your feed should feel human.</h3>
                <p>
                  Short posts make it easy to share what is happening now. Replies make room for the
                  part that matters next: the conversation.
                </p>
              </div>
              <div className="principle-list">
                <article className="principle-item">
                  <h3>Say it your way</h3>
                  <p>Words, images, polls, and rich links—enough range without the clutter.</p>
                </article>
                <article className="principle-item">
                  <h3>Follow curiosity</h3>
                  <p>Move between ideas, people, and moments without losing the thread.</p>
                </article>
                <article className="principle-item">
                  <h3>Make room for nuance</h3>
                  <p>A clean surface keeps attention on what people actually said.</p>
                </article>
              </div>
            </div>
          </section>

          <section className="section feed-section" id="preview" aria-labelledby="preview-title">
            <div className="feed-lab">
              <div className="feed-controls">
                <h2 id="preview-title">Find your frequency.</h2>
                <p>Choose a mood and get a glimpse of the kinds of conversation that belong here.</p>
                <div className="topics" role="tablist" aria-label="Sample feed moods">
                  {MOODS.map(({ id, label }) => (
                    <button
                      key={id}
                      className={`topic${mood === id ? ' active' : ''}`}
                      type="button"
                      role="tab"
                      aria-selected={mood === id}
                      onClick={() => chooseMood(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="feed-window">
                <div className="sample-label">
                  <span>Sample post</span>
                  <span>{sample.context}</span>
                </div>
                <article
                  className={`post feature-post${fadeSwitch ? ' fade-switch' : ''}`}
                  aria-live="polite"
                >
                  <div className="post-head">
                    <span className={avatarClass}>{sample.initial}</span>
                    <div className="identity">
                      <b>{sample.name}</b>
                      <span>{sample.handle}</span>
                    </div>
                  </div>
                  <p>{sample.text}</p>
                  <div className="post-actions">
                    <span>
                      <ReplyIcon />
                      {sample.replies}
                    </span>
                    <span>
                      <HeartIcon />
                      {sample.likes}
                    </span>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <section className="closing" id="start" aria-labelledby="start-title">
            <div className="closing-card">
              <div className="closing-content">
                <h2 id="start-title">Your corner is waiting.</h2>
                <p>
                  Bring a thought, a question, or just yourself. The best conversations rarely need
                  a grand entrance.
                </p>
                {isAuthenticated ? (
                  <button type="button" className="button" onClick={() => onGoToApp?.()}>
                    Go to your feed
                  </button>
                ) : (
                  <button type="button" className="button" onClick={() => onStepInside?.()}>
                    Step inside
                  </button>
                )}
              </div>
            </div>
          </section>
        </main>

        <footer>
          <span>Thoughts become conversations.</span>
          <span>Made for the people between the posts.</span>
        </footer>
      </div>
    </div>
  );
}
