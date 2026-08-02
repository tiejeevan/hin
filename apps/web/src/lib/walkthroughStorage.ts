export const INTRO_WALKTHROUGH_VERSION = 1;

export const INTRO_WALKTHROUGH_STORAGE_KEY = `hin_intro_walkthrough_v${INTRO_WALKTHROUGH_VERSION}`;

export function isIntroWalkthroughCompletedLocally(): boolean {
  return localStorage.getItem(INTRO_WALKTHROUGH_STORAGE_KEY) === '1';
}

export function markIntroWalkthroughCompletedLocally(): void {
  localStorage.setItem(INTRO_WALKTHROUGH_STORAGE_KEY, '1');
}

export function clearIntroWalkthroughCompletedLocally(): void {
  localStorage.removeItem(INTRO_WALKTHROUGH_STORAGE_KEY);
}

export const PROFILE_TOUR_VERSION = 1;
export const PROFILE_TOUR_SNOOZED_KEY = `hin_profile_tour_snoozed_v${PROFILE_TOUR_VERSION}`;
export const PROFILE_TOUR_SEEN_KEY = `hin_profile_tour_seen_v${PROFILE_TOUR_VERSION}`;

export function isProfileTourSnoozed(): boolean {
  return localStorage.getItem(PROFILE_TOUR_SNOOZED_KEY) === '1';
}

export function snoozeProfileTour(): void {
  localStorage.setItem(PROFILE_TOUR_SNOOZED_KEY, '1');
}

export function clearProfileTourSnooze(): void {
  localStorage.removeItem(PROFILE_TOUR_SNOOZED_KEY);
}

export function isProfileTourSeen(): boolean {
  return localStorage.getItem(PROFILE_TOUR_SEEN_KEY) === '1';
}

export function markProfileTourSeen(): void {
  localStorage.setItem(PROFILE_TOUR_SEEN_KEY, '1');
}

/** Clears snooze + seen flags so the tour can auto-start again. */
export function resetProfileTourLocalState(): void {
  localStorage.removeItem(PROFILE_TOUR_SNOOZED_KEY);
  localStorage.removeItem(PROFILE_TOUR_SEEN_KEY);
}
