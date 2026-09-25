import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import './welcomeFeedBanner.css';

const SLIDES = [
  {
    label: 'A better feed starts here',
    title: 'Make Hin feel like yours.',
    text: 'Discover people, conversations, and simple tools built to make sharing feel human again.',
  },
  {
    label: 'Find your people',
    title: 'Follow what moves you.',
    text: 'Tune your feed around the voices, topics, and communities you actually care about.',
  },
  {
    label: 'Join the conversation',
    title: 'Your next idea belongs here.',
    text: 'Post a thought, ask a question, or just look around. There’s no wrong way to begin.',
  },
] as const;

const SLIDE_INTERVAL_MS = 4800;
const AXIS_LOCK_PX = 10;
const SWIPE_THRESHOLD_PX = 48;

interface WelcomeFeedBannerProps {
  onOpenWelcome: () => void;
}

export function WelcomeFeedBanner({ onOpenWelcome }: WelcomeFeedBannerProps) {
  const uid = useId().replace(/:/g, '');
  const ribbonColorId = `wfb-ribbonColor-${uid}`;
  const ribbonShineId = `wfb-ribbonShine-${uid}`;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const axisRef = useRef<'h' | 'v' | null>(null);

  const slide = SLIDES[index];

  const resetGesture = useCallback(() => {
    pointerIdRef.current = null;
    axisRef.current = null;
  }, []);

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('button, a'));
  };

  const showSlide = useCallback((next: number) => {
    setIndex(next);
  }, []);

  useEffect(() => {
    if (paused) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const timer = window.setInterval(() => {
      setIndex(prev => (prev + 1) % SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, index]);

  const stopControlClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(e.target)) return;
    pointerIdRef.current = e.pointerId;
    startRef.current = { x: e.clientX, y: e.clientY };
    axisRef.current = null;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    if (!axisRef.current) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      axisRef.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      if (axisRef.current === 'v') {
        resetGesture();
        return;
      }
      try {
        bannerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    if (axisRef.current === 'h') {
      e.preventDefault();
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;

    const dx = e.clientX - startRef.current.x;
    const axis = axisRef.current;

    try {
      if (bannerRef.current?.hasPointerCapture(e.pointerId)) {
        bannerRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }

    resetGesture();

    if (axis === 'h' && Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
      setIndex(prev =>
        dx < 0 ? (prev + 1) % SLIDES.length : (prev - 1 + SLIDES.length) % SLIDES.length
      );
    }
  };

  return (
    <div className="welcome-feed-banner-wrap">
      <div
        ref={bannerRef}
        className="welcome-banner"
        aria-label="Welcome to Hin"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <span className="banner-grid" aria-hidden="true" />
        <div className="banner-copy">
          <div className="mini-label">
            <span className="pulse" aria-hidden="true" />
            <span>{slide.label}</span>
          </div>
          <h2>{slide.title}</h2>
          <p>{slide.text}</p>
        </div>

        <button
          type="button"
          className="banner-cta"
          onClick={e => {
            e.stopPropagation();
            onOpenWelcome();
          }}
        >
          Explore Hin
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>

        <div className="visual" aria-hidden="true">
          <div className={`artwork artwork-ribbon${index === 0 ? ' is-active' : ''}`}>
            <div className="logo-stage">
              <svg className="infinity-ribbon" viewBox="0 0 200 100" role="presentation">
                <defs>
                  <linearGradient id={ribbonColorId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#ffc13d" />
                    <stop offset=".47" stopColor="#ff643e" />
                    <stop offset="1" stopColor="#8b183f" />
                  </linearGradient>
                  <linearGradient id={ribbonShineId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#fff4bd" stopOpacity="0" />
                    <stop offset=".28" stopColor="#fff4bd" />
                    <stop offset=".72" stopColor="#ffffff" />
                    <stop offset="1" stopColor="#fff4bd" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  className="ribbon-base"
                  pathLength={1000}
                  d="M100 50 C86 27 73 18 57 18 C35 18 19 32 19 50 C19 68 35 82 57 82 C73 82 86 73 100 50 C114 27 127 18 143 18 C165 18 181 32 181 50 C181 68 165 82 143 82 C127 82 114 73 100 50"
                  fill="none"
                  stroke={`url(#${ribbonColorId})`}
                  strokeWidth="17"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  className="ribbon-trail"
                  pathLength={1000}
                  d="M100 50 C86 27 73 18 57 18 C35 18 19 32 19 50 C19 68 35 82 57 82 C73 82 86 73 100 50 C114 27 127 18 143 18 C165 18 181 32 181 50 C181 68 165 82 143 82 C127 82 114 73 100 50"
                />
                <path
                  className="ribbon-light"
                  pathLength={1000}
                  d="M100 50 C86 27 73 18 57 18 C35 18 19 32 19 50 C19 68 35 82 57 82 C73 82 86 73 100 50 C114 27 127 18 143 18 C165 18 181 32 181 50 C181 68 165 82 143 82 C127 82 114 73 100 50"
                  style={{ stroke: `url(#${ribbonShineId})` }}
                />
              </svg>
            </div>
            <span className="spark s1" />
            <span className="spark s2" />
            <span className="spark s3" />
            <div className="floating-card one">
              <div className="float-top">
                <span className="float-dot" />
                <span className="float-lines">
                  <i />
                  <i />
                </span>
              </div>
              <div className="reaction-row">
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="floating-card two">
              <div className="float-top">
                <span className="float-dot" style={{ background: '#7067ea' }} />
                <span className="float-lines">
                  <i />
                  <i />
                </span>
              </div>
              <div className="reaction-row">
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>

          <div className={`artwork artwork-conversation${index === 1 ? ' is-active' : ''}`}>
            <div className="conversation-stage">
              <div className="chat-bubble chat-one">
                <span className="bubble-avatar" />
                <span className="bubble-copy">
                  <i />
                  <i />
                </span>
              </div>
              <div className="chat-bubble chat-two">
                <span className="bubble-avatar" />
                <span className="bubble-copy">
                  <i />
                  <i />
                </span>
              </div>
              <div className="chat-bubble chat-three">
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          </div>

          <div className={`artwork artwork-connection${index === 2 ? ' is-active' : ''}`}>
            <div className="connection-stage">
              <svg className="connection-lines" viewBox="0 0 270 250" role="presentation">
                <line x1="135" y1="125" x2="49" y2="61" pathLength={120} />
                <line x1="135" y1="125" x2="217" y2="47" pathLength={120} />
                <line x1="135" y1="125" x2="235" y2="154" pathLength={120} />
                <line x1="135" y1="125" x2="167" y2="213" pathLength={120} />
                <line x1="135" y1="125" x2="51" y2="184" pathLength={120} />
              </svg>
              <span className="signal-ring" />
              <span className="signal-ring r2" />
              <span className="signal-ring r3" />
              <span className="signal-core" />
              <span className="satellite sat-1" />
              <span className="satellite sat-2" />
              <span className="satellite sat-3" />
              <span className="satellite sat-4" />
              <span className="satellite sat-5" />
            </div>
          </div>
        </div>

        <div className="banner-bottom">
          <div className="dot-nav" aria-label="Banner slides">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                className={i === index ? 'active' : undefined}
                aria-label={`Slide ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={e => {
                  stopControlClick(e);
                  showSlide(i);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="pause"
            aria-label={paused ? 'Play animation' : 'Pause animation'}
            onClick={e => {
              stopControlClick(e);
              setPaused(p => !p);
            }}
          >
            {paused ? (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="m8 5 11 7-11 7z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 5h3v14H7zm7 0h3v14h-3z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
