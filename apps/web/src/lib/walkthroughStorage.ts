export const INTRO_WALKTHROUGH_VERSION = 1;

export const INTRO_WALKTHROUGH_STORAGE_KEY = `hin_intro_walkthrough_v${INTRO_WALKTHROUGH_VERSION}`;

export function isIntroWalkthroughCompletedLocally(): boolean {
  return localStorage.getItem(INTRO_WALKTHROUGH_STORAGE_KEY) === '1';
}

export function markIntroWalkthroughCompletedLocally(): void {
  localStorage.setItem(INTRO_WALKTHROUGH_STORAGE_KEY, '1');
}
