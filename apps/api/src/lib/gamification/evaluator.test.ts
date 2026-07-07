import { describe, it, expect } from 'vitest';
import { evaluateBadgeRules, compareMetric } from './evaluator';
import type { BadgeRuleDefinition } from '@hin/types';

describe('compareMetric', () => {
  it('supports >= operator', () => {
    expect(compareMetric(100, '>=', 100)).toBe(true);
    expect(compareMetric(99, '>=', 100)).toBe(false);
  });

  it('supports > operator', () => {
    expect(compareMetric(101, '>', 100)).toBe(true);
    expect(compareMetric(100, '>', 100)).toBe(false);
  });
});

describe('evaluateBadgeRules', () => {
  const rules: BadgeRuleDefinition[] = [
    { badgeId: 1, metricKey: 'unique_posts_shared', operator: '>=', threshold: 100 },
    { badgeId: 2, metricKey: 'follower_count', operator: '>=', threshold: 10 },
    { badgeId: 3, metricKey: 'total_posts', operator: '>=', threshold: 10 },
  ];

  it('awards badge when counter crosses threshold', () => {
    const counters = { unique_posts_shared: 100, follower_count: 5, total_posts: 3 };
    const earned = evaluateBadgeRules(counters, rules, new Set());
    expect(earned).toEqual([1]);
  });

  it('is idempotent — never awards the same badge twice', () => {
    const counters = { unique_posts_shared: 150, follower_count: 15, total_posts: 12 };
    const alreadyEarned = new Set([1]);
    const earned = evaluateBadgeRules(counters, rules, alreadyEarned);
    expect(earned).toEqual([2, 3]);
    expect(alreadyEarned.has(1)).toBe(true);
  });

  it('returns empty when no rules match', () => {
    const counters = { unique_posts_shared: 50 };
    const earned = evaluateBadgeRules(counters, rules, new Set());
    expect(earned).toEqual([]);
  });

  it('skips already-earned badges even when threshold still met', () => {
    const counters = { unique_posts_shared: 200 };
    const alreadyEarned = new Set([1, 2, 3]);
    const earned = evaluateBadgeRules(counters, rules, alreadyEarned);
    expect(earned).toEqual([]);
  });
});
