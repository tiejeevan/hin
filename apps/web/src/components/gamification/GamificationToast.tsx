import type { GamificationRewardPayload } from '@hin/types';
import type { Toast } from '../../types/ui';

type AddToast = (
  content: string,
  type: Toast['type'],
  target?: { postId?: number; commentId?: number },
  opts?: { skipPrefCheck?: boolean },
) => void;

interface GamificationToastCallbacks {
  addToast: AddToast;
  onRefresh: () => void;
}

/** Apply WS gamification_reward payload — secondary path; API response is primary. */
export function applyGamificationReward(
  payload: GamificationRewardPayload,
  { addToast, onRefresh }: GamificationToastCallbacks,
): void {
  onRefresh();

  if (payload.eventWin) {
    addToast(`You won "${payload.eventWin.eventName}"!`, 'badge_award', undefined, { skipPrefCheck: true });
    return;
  }

  // Badge and level-up toasts (and their bell entries) are owned by the WS
  // `notification` path (badge_award / level_up); toasting them here too would
  // double up. This path only handles the points toast, which has no bell entry.
  if (payload.pe && payload.pe > 0) {
    addToast(`+${payload.pe} points!`, 'badge_award', undefined, { skipPrefCheck: true });
  }
}
