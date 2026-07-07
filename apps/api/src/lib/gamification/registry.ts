import type {
  GamificationActionType,
  MetricCatalogEntry,
  MetricCatalogResponse,
  MetricType,
} from '@hin/types';
import type { GamificationTx } from './counters';

export interface CounterDelta {
  userId: number;
  metricKey: string;
  delta: number;
}

export interface ActionHandlerContext {
  tx: GamificationTx;
  userId: number;
  action: GamificationActionType;
  metadata: Record<string, unknown>;
}

export type ActionHandler = (ctx: ActionHandlerContext) => Promise<CounterDelta[]>;

interface MetricDefinition {
  key: string;
  label: string;
  description: string;
  type: MetricType;
  actions: GamificationActionType[];
  handler?: ActionHandler;
}

/**
 * Developer-owned metric catalog. Admin picks from this list in v2+.
 */
const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: 'total_posts',
    label: 'Publish a post',
    description: 'Total posts published by the user',
    type: 'cumulative',
    actions: ['post_created', 'post_deleted'],
  },
  {
    key: 'total_comments',
    label: 'Write a comment',
    description: 'Total comments created by the user',
    type: 'cumulative',
    actions: ['comment_created', 'comment_deleted'],
  },
  {
    key: 'unique_posts_shared',
    label: 'Share unique posts',
    description: 'Distinct posts the user has shared',
    type: 'cumulative',
    actions: ['post_shared', 'post_unshared'],
  },
  {
    key: 'unique_posts_commented',
    label: 'Comment on unique posts',
    description: 'Distinct posts the user has commented on',
    type: 'cumulative',
    actions: ['comment_created', 'comment_deleted'],
  },
  {
    key: 'follower_count',
    label: 'Gain a follower',
    description: 'Users following this account (passive metric)',
    type: 'cumulative',
    actions: ['user_followed', 'user_unfollowed'],
  },
  {
    key: 'max_likes_single_post',
    label: 'Likes on your post',
    description: 'Highest like count on any single post by the user',
    type: 'cumulative',
    actions: ['post_liked', 'post_unliked'],
  },
  {
    key: 'posts_with_3_images',
    label: 'Posts with 3+ images',
    description: 'Posts uploaded with three or more images',
    type: 'instant',
    actions: ['post_created'],
  },
  {
    key: 'likes_given',
    label: 'Likes given',
    description: 'Posts the user has liked',
    type: 'cumulative',
    actions: ['like_given', 'like_removed'],
  },
  {
    key: 'login_streak',
    label: 'Daily visit',
    description: 'Consecutive calendar days the user opened Hin',
    type: 'streak',
    actions: ['session_active'],
  },
  {
    key: 'total_session_minutes',
    label: 'Time on Hin',
    description: 'Active minutes spent on the platform',
    type: 'duration',
    actions: ['session_tick'],
  },
];

const ACTION_HANDLERS: Partial<Record<GamificationActionType, ActionHandler>> = {};

export function registerActionHandler(
  action: GamificationActionType,
  handler: ActionHandler,
): void {
  ACTION_HANDLERS[action] = handler;
}

export function getMetricCatalog(): MetricCatalogResponse {
  const metrics: MetricCatalogEntry[] = METRIC_DEFINITIONS.map((m) => ({
    key: m.key,
    label: m.label,
    description: m.description,
    type: m.type,
    actions: m.actions,
  }));
  return { metrics };
}

export function getMetricKeysForAction(action: GamificationActionType): string[] {
  return METRIC_DEFINITIONS
    .filter((m) => m.actions.includes(action))
    .map((m) => m.key);
}

/** Resolve counter deltas for an action via registered handlers. */
export async function resolveActionDeltas(ctx: ActionHandlerContext): Promise<CounterDelta[]> {
  const handler = ACTION_HANDLERS[ctx.action];
  if (!handler) return [];
  return handler(ctx);
}
