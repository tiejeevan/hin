import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../config';
import { User as UserType } from '@hin/types';

interface UseBioWalkthroughOptions {
  enabled: boolean;
  token: string | null;
  isProfileEditing: boolean;
  setIsProfileEditing: (val: boolean) => void;
  getHeaders: () => Record<string, string>;
  onUserUpdate: (updatedUser: UserType) => void;
}

export function useBioWalkthrough({
  enabled,
  token,
  isProfileEditing,
  setIsProfileEditing,
  getHeaders,
  onUserUpdate,
}: UseBioWalkthroughOptions) {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setIsActive(false);
      return;
    }

    // Delay walkthrough slightly to allow page elements to render
    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setIsActive(true);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [enabled]);

  // Adjust step index based on whether we are in edit mode
  useEffect(() => {
    if (!isActive) return;

    if (isProfileEditing && stepIndex === 0) {
      setStepIndex(1);
    } else if (!isProfileEditing && stepIndex > 0) {
      setStepIndex(0);
    }
  }, [isProfileEditing, isActive, stepIndex]);

  const persistCompletion = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/me/bio-walkthrough/complete`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          onUserUpdate(data.user);
        }
      }
    } catch (e) {
      console.error('Failed to persist bio walkthrough completion:', e);
    }
  }, [getHeaders, token, onUserUpdate]);

  const complete = useCallback(() => {
    setIsActive(false);
    void persistCompletion();
  }, [persistCompletion]);

  const next = useCallback(() => {
    setStepIndex(prev => {
      const nextIndex = prev + 1;
      // If we go from step 0 (Edit Profile button) to step 1 (First name input), enter edit mode programmatically
      if (prev === 0) {
        setIsProfileEditing(true);
      }
      return nextIndex;
    });
  }, [setIsProfileEditing]);

  return {
    isActive,
    stepIndex,
    next,
    complete,
  };
}
