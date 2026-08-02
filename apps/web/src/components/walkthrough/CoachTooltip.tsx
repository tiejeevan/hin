import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bell, Calendar, Lock, Settings, Sparkles, User } from 'lucide-react';
import type { WalkthroughStep } from './IntroWalkthrough';

const STEP_ICONS = {
  post: User,
  messages: User,
  notifications: Bell,
  user: User,
  calendar: Calendar,
  settings: Settings,
  lock: Lock,
} as const;

export type CoachStep = Omit<WalkthroughStep, 'icon'> & {
  icon: keyof typeof STEP_ICONS;
};

const TOOLTIP_MAX_WIDTH = 248;
const VIEWPORT_MARGIN = 12;
const TARGET_GAP = 16;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CoachTooltipProps {
  steps: CoachStep[];
  stepIndex: number;
  onNext: () => void;
  onComplete: () => void;
  onSkip: () => void;
  completionMessage?: string;
  skipLabel?: string;
}

function measureTarget(selector: string, padding: number): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  return {
    top: box.top - padding,
    left: box.left - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return !(
    a.left + a.width + gap <= b.left
    || b.left + b.width + gap <= a.left
    || a.top + a.height + gap <= b.top
    || b.top + b.height + gap <= a.top
  );
}

function fitsInViewport(rect: Rect): boolean {
  return (
    rect.top >= VIEWPORT_MARGIN
    && rect.left >= VIEWPORT_MARGIN
    && rect.left + rect.width <= window.innerWidth - VIEWPORT_MARGIN
    && rect.top + rect.height <= window.innerHeight - VIEWPORT_MARGIN
  );
}

function computeTooltipPosition(
  target: Rect,
  tooltipWidth: number,
  tooltipHeight: number,
): { top: number; left: number } {
  const candidates: Array<{ top: number; left: number }> = [
    { top: target.top + target.height + TARGET_GAP, left: target.left + target.width / 2 - tooltipWidth / 2 },
    { top: target.top + target.height + TARGET_GAP, left: target.left - tooltipWidth + target.width },
    { top: target.top - tooltipHeight - TARGET_GAP, left: target.left + target.width / 2 - tooltipWidth / 2 },
    { top: target.top, left: target.left + target.width + TARGET_GAP },
  ];

  for (const candidate of candidates) {
    const tooltipRect: Rect = {
      top: candidate.top,
      left: candidate.left,
      width: tooltipWidth,
      height: tooltipHeight,
    };

    if (rectsOverlap(tooltipRect, target, TARGET_GAP)) continue;
    if (!fitsInViewport(tooltipRect)) continue;
    return candidate;
  }

  return {
    top: clamp(
      target.top + target.height + TARGET_GAP,
      VIEWPORT_MARGIN,
      window.innerHeight - tooltipHeight - VIEWPORT_MARGIN,
    ),
    left: clamp(
      target.left + target.width / 2 - tooltipWidth / 2,
      VIEWPORT_MARGIN,
      window.innerWidth - tooltipWidth - VIEWPORT_MARGIN,
    ),
  };
}

/** Non-blocking coach: spotlight + tooltip only; page stays interactive. */
export function CoachTooltip({
  steps,
  stepIndex,
  onNext,
  onComplete,
  onSkip,
  completionMessage,
  skipLabel = 'Remind me later',
}: CoachTooltipProps) {
  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const Icon = step ? STEP_ICONS[step.icon] : User;
  const padding = step?.padding ?? 6;
  const borderRadius = step?.borderRadius ?? 16;

  const tooltipRef = useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [entered, setEntered] = useState(false);

  const updateLayout = useCallback(() => {
    if (!step) return;
    const rect = measureTarget(step.targetSelector, padding);
    if (!rect) {
      setSpotlight(null);
      setTooltipPos(null);
      return;
    }

    setSpotlight(rect);

    const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 156;
    setTooltipPos(computeTooltipPosition(rect, tooltipWidth, tooltipHeight));
  }, [padding, step]);

  useLayoutEffect(() => {
    setEntered(false);
    updateLayout();
    const frame = requestAnimationFrame(() => {
      updateLayout();
      setEntered(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [stepIndex, updateLayout]);

  useEffect(() => {
    if (!step) return;
    const target = document.querySelector(step.targetSelector);
    if (!(target instanceof HTMLElement)) return;

    target.classList.add('walkthrough-target-active');
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout, true);
    return () => {
      target.classList.remove('walkthrough-target-active');
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout, true);
    };
  }, [step, updateLayout]);

  useLayoutEffect(() => {
    if (!tooltipRef.current || !step) return;
    updateLayout();
  }, [stepIndex, entered, updateLayout, step]);

  useEffect(() => {
    if (!spotlight) {
      const retry = window.setInterval(updateLayout, 120);
      return () => window.clearInterval(retry);
    }
  }, [spotlight, updateLayout]);

  if (!step) return null;

  const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);

  return (
    <div
      className="fixed inset-0 z-[120] pointer-events-none animate-walkthrough-enter"
      role="dialog"
      aria-modal="false"
      aria-label="Profile setup coach"
    >
      {spotlight && (
        <div
          className={`absolute pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ring-2 ring-indigo-400/70 ${
            entered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            borderRadius,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
          }}
          aria-hidden
        />
      )}

      {tooltipPos && (
        <div
          ref={tooltipRef}
          className={`pointer-events-auto absolute rounded-xl border border-indigo-500/30 bg-bg-secondary shadow-xl shadow-black/15 ${
            entered ? 'animate-walkthrough-tooltip-in' : 'opacity-0'
          }`}
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            width: tooltipWidth,
          }}
        >
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/12 text-indigo-400">
                <Icon className="h-4 w-4" strokeWidth={2.25} />
              </div>
              <div className="flex items-center gap-1">
                {steps.map((s, i) => (
                  <span
                    key={s.id}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === stepIndex
                        ? 'w-4 bg-indigo-500'
                        : i < stepIndex
                          ? 'w-1 bg-indigo-400/80'
                          : 'w-1 bg-border-custom'
                    }`}
                  />
                ))}
              </div>
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-400">
              Step {stepIndex + 1} of {steps.length}
            </p>
            <h2 className="mt-0.5 text-[13px] font-semibold leading-snug text-text-primary">{step.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{step.description}</p>

            {isLastStep && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-2.5 py-1.5 text-[11px] text-indigo-300">
                <Sparkles className="h-3 w-3 shrink-0" />
                <span>{completionMessage || 'You can revisit this tour anytime from Settings.'}</span>
              </div>
            )}

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onSkip}
                className="rounded-md px-1.5 py-1 text-[11px] font-medium text-text-muted transition-colors hover:text-text-secondary cursor-pointer"
              >
                {skipLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isLastStep) onComplete();
                  else onNext();
                }}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 active:scale-[0.98] cursor-pointer"
              >
                {isLastStep ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const PROFILE_TOUR_STEPS: CoachStep[] = [
  {
    id: 'edit-profile',
    targetSelector: '#edit-profile-btn',
    title: 'Update your profile',
    description: 'Start here to add your name and birthday so others can know you.',
    icon: 'user',
    padding: 4,
    borderRadius: 12,
  },
  {
    id: 'basics',
    targetSelector: '#profile-edit-basics',
    title: 'Your basics',
    description: 'Add your first name, last name, and birthday. You can type freely — nothing is locked.',
    icon: 'user',
    padding: 8,
    borderRadius: 16,
  },
  {
    id: 'save',
    targetSelector: '#save-profile-btn',
    title: 'Save your details',
    description: 'Save when you are ready. You can come back anytime.',
    icon: 'user',
    padding: 4,
    borderRadius: 9999,
  },
  {
    id: 'settings',
    targetSelector: '#profile-settings-btn',
    title: 'Profile settings',
    description: 'Privacy, notifications, and more live here.',
    icon: 'settings',
    padding: 4,
    borderRadius: 12,
  },
  {
    id: 'privacy',
    targetSelector: '#profile-settings-privacy',
    title: 'Privacy',
    description: 'Make your account private and manage follow requests.',
    icon: 'lock',
    padding: 4,
    borderRadius: 16,
  },
  {
    id: 'notifications',
    targetSelector: '#profile-settings-notifications',
    title: 'Notifications',
    description: 'Choose what alerts you get for likes, comments, mentions, and messages.',
    icon: 'notifications',
    padding: 4,
    borderRadius: 16,
  },
];
