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

  if (payload.be && payload.be.length > 0) {
    addToast('Badge earned!', 'badge_award', undefined, { skipPrefCheck: true });
  } else if (payload.levelUp) {
    addToast(`Level ${payload.levelUp} reached!`, 'level_up', undefined, { skipPrefCheck: true });
  } else if (payload.pe && payload.pe > 0) {
    addToast(`+${payload.pe} points!`, 'badge_award', undefined, { skipPrefCheck: true });
  }
}
