import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../config';
import {
  isIntroWalkthroughCompletedLocally,
  markIntroWalkthroughCompletedLocally,
} from '../lib/walkthroughStorage';

interface UseIntroWalkthroughOptions {
  enabled: boolean;
  token: string | null;
  serverCompleted: boolean | null;
  getHeaders: () => Record<string, string>;
  onStepChange?: (stepIndex: number) => void;
}

export function useIntroWalkthrough({
  enabled,
  token,
  serverCompleted,
  getHeaders,
  onStepChange,
}: UseIntroWalkthroughOptions) {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setIsActive(false);
      return;
    }

    if (isIntroWalkthroughCompletedLocally()) {
      setIsActive(false);
      return;
    }

    if (serverCompleted === null) return;
    if (serverCompleted) {
      markIntroWalkthroughCompletedLocally();
      setIsActive(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setIsActive(true);
      onStepChange?.(0);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [enabled, onStepChange, serverCompleted]);

  const persistCompletion = useCallback(async () => {
    markIntroWalkthroughCompletedLocally();
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/me/intro-walkthrough/complete`, {
        method: 'POST',
        headers: getHeaders(),
      });
    } catch (e) {
      console.error('Failed to persist intro walkthrough completion:', e);
    }
  }, [getHeaders, token]);

  const complete = useCallback(() => {
    setIsActive(false);
    void persistCompletion();
  }, [persistCompletion]);

  const next = useCallback(() => {
    setStepIndex(prev => {
      const nextIndex = prev + 1;
      onStepChange?.(nextIndex);
      return nextIndex;
    });
  }, [onStepChange]);

  return {
    isActive,
    stepIndex,
    next,
    complete,
  };
}
