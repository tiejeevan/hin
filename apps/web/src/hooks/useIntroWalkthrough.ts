import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../config';
import {
  clearIntroWalkthroughCompletedLocally,
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
  /** When true, ignore local/server completed flags until the next complete. */
  const [forceShow, setForceShow] = useState(false);

  useEffect(() => {
    if (!enabled) {
      if (!forceShow) setIsActive(false);
      return;
    }

    if (!forceShow && isIntroWalkthroughCompletedLocally()) {
      setIsActive(false);
      return;
    }

    if (!forceShow) {
      if (serverCompleted === null) return;
      if (serverCompleted) {
        markIntroWalkthroughCompletedLocally();
        setIsActive(false);
        return;
      }
    }

    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setIsActive(true);
      onStepChange?.(0);
    }, forceShow ? 0 : 700);

    return () => window.clearTimeout(timer);
  }, [enabled, onStepChange, serverCompleted, forceShow]);

  const persistCompletion = useCallback(async () => {
    markIntroWalkthroughCompletedLocally();
    setForceShow(false);
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

  /** Dev helper: clear local completion and force-show from step 0. */
  const resetAndStart = useCallback(() => {
    clearIntroWalkthroughCompletedLocally();
    setForceShow(true);
    setStepIndex(0);
    setIsActive(true);
    onStepChange?.(0);
  }, [onStepChange]);

  return {
    isActive,
    stepIndex,
    next,
    complete,
    resetAndStart,
  };
}
