import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processUserAction } from './hub';
import * as settings from './settings';
import * as registry from './registry';
import * as counters from './counters';
import * as evaluator from './evaluator';
import * as points from './points';
import * as eventsEvaluator from './events/evaluator';

describe('processUserAction', () => {
  const mockDb = {
    transaction: vi.fn(),
  } as unknown as Parameters<typeof processUserAction>[0];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns immediately with zero writes when gamification is disabled', async () => {
    vi.spyOn(settings, 'isGamificationEnabled').mockResolvedValue(false);

    const result = await processUserAction(mockDb, 1, 'post_created', { postId: 42 });

    expect(result).toEqual({
      skipped: true,
      pointsEarned: 0,
      totalPoints: 0,
      level: 1,
      levelUp: null,
      badgesEarned: [],
    });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('runs pipeline when enabled', async () => {
    vi.spyOn(settings, 'isGamificationEnabled').mockResolvedValue(true);
    vi.spyOn(registry, 'resolveActionDeltas').mockResolvedValue([
      { userId: 1, metricKey: 'total_posts', delta: 1 },
    ]);
    vi.spyOn(counters, 'upsertCounterDelta').mockResolvedValue();
    vi.spyOn(points, 'awardPointsForAction').mockResolvedValue({
      pointsEarned: 10,
      totalPoints: 10,
      level: 1,
      levelUp: null,
    });
    vi.spyOn(evaluator, 'evaluateBadgesForUser').mockResolvedValue([]);
    vi.spyOn(eventsEvaluator, 'evaluateEventsForAction').mockResolvedValue([]);

    const result = await processUserAction(mockDb, 1, 'post_created');

    expect(result.skipped).toBe(false);
    expect(result.pointsEarned).toBe(10);
    expect(registry.resolveActionDeltas).toHaveBeenCalled();
    expect(counters.upsertCounterDelta).toHaveBeenCalledWith(
      expect.anything(),
      1,
      'total_posts',
      1,
    );
  });

  it('propagates pipeline failure to the caller', async () => {
    vi.spyOn(settings, 'isGamificationEnabled').mockResolvedValue(true);
    vi.spyOn(registry, 'resolveActionDeltas').mockResolvedValue([
      { userId: 1, metricKey: 'total_posts', delta: 1 },
    ]);
    vi.spyOn(counters, 'upsertCounterDelta').mockResolvedValue();
    vi.spyOn(points, 'awardPointsForAction').mockResolvedValue({
      pointsEarned: 10,
      totalPoints: 10,
      level: 1,
      levelUp: null,
    });
    vi.spyOn(evaluator, 'evaluateBadgesForUser').mockRejectedValue(new Error('simulated failure'));
    vi.spyOn(eventsEvaluator, 'evaluateEventsForAction').mockResolvedValue([]);

    await expect(processUserAction(mockDb, 1, 'post_created')).rejects.toThrow('simulated failure');
    expect(counters.upsertCounterDelta).toHaveBeenCalled();
    expect(evaluator.evaluateBadgesForUser).toHaveBeenCalled();
  });
});
