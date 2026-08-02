import { useCallback, useEffect, useState } from 'react';
import { PROFILE_TOUR_STEPS } from '../components/walkthrough/CoachTooltip';
import {
  clearProfileTourSnooze,
  isProfileTourSeen,
  isProfileTourSnoozed,
  markProfileTourSeen,
  resetProfileTourLocalState,
  snoozeProfileTour,
} from '../lib/walkthroughStorage';

export type ProfileTourSettingsSection = 'privacy' | 'notifications' | null;

interface UseProfileTourOptions {
  /** Own profile, incomplete basics, not loading auth-only, etc. */
  autoStartEnabled: boolean;
  feedIntroActive: boolean;
  isProfileEditing: boolean;
  setIsProfileEditing: (val: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
  setSettingsTourSection: (section: ProfileTourSettingsSection) => void;
}

function applyStepSideEffects(
  stepIndex: number,
  {
    setIsProfileEditing,
    openSettings,
    closeSettings,
    setSettingsTourSection,
  }: Pick<
    UseProfileTourOptions,
    'setIsProfileEditing' | 'openSettings' | 'closeSettings' | 'setSettingsTourSection'
  >,
) {
  const step = PROFILE_TOUR_STEPS[stepIndex];
  if (!step) return;

  switch (step.id) {
    case 'edit-profile':
      setIsProfileEditing(false);
      closeSettings();
      setSettingsTourSection(null);
      break;
    case 'basics':
    case 'save':
      setIsProfileEditing(true);
      closeSettings();
      setSettingsTourSection(null);
      break;
    case 'settings':
      setIsProfileEditing(false);
      openSettings();
      setSettingsTourSection(null);
      break;
    case 'privacy':
      setIsProfileEditing(false);
      openSettings();
      setSettingsTourSection('privacy');
      break;
    case 'notifications':
      setIsProfileEditing(false);
      openSettings();
      setSettingsTourSection('notifications');
      break;
    default:
      break;
  }
}

export function useProfileTour({
  autoStartEnabled,
  feedIntroActive,
  isProfileEditing,
  setIsProfileEditing,
  openSettings,
  closeSettings,
  setSettingsTourSection,
}: UseProfileTourOptions) {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [snoozed, setSnoozed] = useState(() => isProfileTourSnoozed());
  const [tourSeen, setTourSeen] = useState(() => isProfileTourSeen());

  const sideEffectOpts = {
    setIsProfileEditing,
    openSettings,
    closeSettings,
    setSettingsTourSection,
  };

  const start = useCallback((fromStep = 0) => {
    clearProfileTourSnooze();
    setSnoozed(false);
    setStepIndex(fromStep);
    setIsActive(true);
    applyStepSideEffects(fromStep, sideEffectOpts);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stable setters
  }, [setIsProfileEditing, openSettings, closeSettings, setSettingsTourSection]);

  useEffect(() => {
    if (!autoStartEnabled || feedIntroActive || snoozed || tourSeen || isActive) {
      return;
    }

    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setIsActive(true);
      applyStepSideEffects(0, sideEffectOpts);
    }, 700);

    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartEnabled, feedIntroActive, snoozed, tourSeen, isActive]);

  // If user opens edit from step 0 themselves, advance into basics.
  useEffect(() => {
    if (!isActive) return;
    if (stepIndex === 0 && isProfileEditing) {
      setStepIndex(1);
      applyStepSideEffects(1, sideEffectOpts);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isProfileEditing, stepIndex]);

  const skip = useCallback(() => {
    setIsActive(false);
    setSettingsTourSection(null);
    snoozeProfileTour();
    setSnoozed(true);
  }, [setSettingsTourSection]);

  const complete = useCallback(() => {
    setIsActive(false);
    setSettingsTourSection(null);
    markProfileTourSeen();
    setTourSeen(true);
    clearProfileTourSnooze();
    setSnoozed(false);
  }, [setSettingsTourSection]);

  const next = useCallback(() => {
    setStepIndex(prev => {
      const nextIndex = Math.min(prev + 1, PROFILE_TOUR_STEPS.length - 1);
      applyStepSideEffects(nextIndex, sideEffectOpts);
      return nextIndex;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIsProfileEditing, openSettings, closeSettings, setSettingsTourSection]);

  const snoozeFromBanner = useCallback(() => {
    snoozeProfileTour();
    setSnoozed(true);
    setIsActive(false);
  }, []);

  /** Dev helper: clear snooze/seen and restart from step 0. */
  const resetAndStart = useCallback(() => {
    resetProfileTourLocalState();
    setSnoozed(false);
    setTourSeen(false);
    setStepIndex(0);
    setIsActive(true);
    applyStepSideEffects(0, sideEffectOpts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIsProfileEditing, openSettings, closeSettings, setSettingsTourSection]);

  return {
    isActive,
    stepIndex,
    snoozed,
    tourSeen,
    showReminderBanner: !isActive && (snoozed || tourSeen),
    next,
    skip,
    complete,
    start,
    snoozeFromBanner,
    resetAndStart,
  };
}
