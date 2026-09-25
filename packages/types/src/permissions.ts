import { z } from 'zod';

export type PermissionKey =
  | 'post.view' | 'post.review' | 'post.hide' | 'post.unhide' | 'post.remove' | 'post.restore' | 'post.feature' | 'post.unfeature'
  | 'comment.view' | 'comment.review' | 'comment.hide' | 'comment.unhide' | 'comment.remove' | 'comment.restore' | 'comment.lock' | 'comment.unlock'
  | 'user.view' | 'user.view_history' | 'user.warn' | 'user.restrict' | 'user.suspend' | 'user.unsuspend' | 'user.ban' | 'user.unban'
  | 'report.view' | 'report.review' | 'report.resolve' | 'report.dismiss' | 'report.escalate'
  | 'featured_post.view' | 'featured_post.review' | 'featured_post.approve' | 'featured_post.reject' | 'featured_post.remove' | 'featured_post.restore' | 'featured_post.escalate'
  | 'moderator.view' | 'moderator.activity'
  | 'audit.view';

export type PermissionCategory =
  | 'Posts'
  | 'Comments'
  | 'Users'
  | 'Reports'
  | 'Global Feed'
  | 'Moderators'
  | 'Audit';

export interface PermissionCatalogEntry {
  key: PermissionKey;
  name: string;
  description: string;
  category: PermissionCategory;
  comingSoon?: boolean;
}

export type ModeratorPresetKey =
  | 'basic'
  | 'content'
  | 'community'
  | 'user_moderator'
  | 'senior'
  | 'custom';

export const PERMISSION_KEY_VALUES = [
  'post.view', 'post.review', 'post.hide', 'post.unhide', 'post.remove', 'post.restore', 'post.feature', 'post.unfeature',
  'comment.view', 'comment.review', 'comment.hide', 'comment.unhide', 'comment.remove', 'comment.restore', 'comment.lock', 'comment.unlock',
  'user.view', 'user.view_history', 'user.warn', 'user.restrict', 'user.suspend', 'user.unsuspend', 'user.ban', 'user.unban',
  'report.view', 'report.review', 'report.resolve', 'report.dismiss', 'report.escalate',
  'featured_post.view', 'featured_post.review', 'featured_post.approve', 'featured_post.reject', 'featured_post.remove', 'featured_post.restore', 'featured_post.escalate',
  'moderator.view', 'moderator.activity',
  'audit.view',
] as const satisfies readonly PermissionKey[];

export const PermissionKeySchema = z.enum(PERMISSION_KEY_VALUES);

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  { key: 'post.view', name: 'View Posts', description: 'View posts in moderation context', category: 'Posts' },
  { key: 'post.review', name: 'Review Posts', description: 'Review posts awaiting moderation', category: 'Posts' },
  { key: 'post.hide', name: 'Hide Posts', description: 'Hide posts from public view', category: 'Posts' },
  { key: 'post.unhide', name: 'Unhide Posts', description: 'Restore hidden posts', category: 'Posts' },
  { key: 'post.remove', name: 'Remove Posts', description: 'Remove posts from the platform', category: 'Posts' },
  { key: 'post.restore', name: 'Restore Posts', description: 'Restore removed posts', category: 'Posts' },
  { key: 'post.feature', name: 'Feature Posts', description: 'Feature posts (reserved)', category: 'Posts' },
  { key: 'post.unfeature', name: 'Unfeature Posts', description: 'Remove featured status (reserved)', category: 'Posts' },
  { key: 'comment.view', name: 'View Comments', description: 'View comments in moderation context', category: 'Comments' },
  { key: 'comment.review', name: 'Review Comments', description: 'Review comments awaiting moderation', category: 'Comments' },
  { key: 'comment.hide', name: 'Hide Comments', description: 'Hide comments from public view', category: 'Comments' },
  { key: 'comment.unhide', name: 'Unhide Comments', description: 'Restore hidden comments', category: 'Comments' },
  { key: 'comment.remove', name: 'Remove Comments', description: 'Remove comments from the platform', category: 'Comments' },
  { key: 'comment.restore', name: 'Restore Comments', description: 'Restore removed comments', category: 'Comments' },
  { key: 'comment.lock', name: 'Lock Comments', description: 'Lock comment threads on posts', category: 'Comments' },
  { key: 'comment.unlock', name: 'Unlock Comments', description: 'Unlock comment threads on posts', category: 'Comments' },
  { key: 'user.view', name: 'View Users', description: 'View user profiles for moderation', category: 'Users' },
  { key: 'user.view_history', name: 'View User History', description: 'View moderation history for a user', category: 'Users' },
  { key: 'user.warn', name: 'Warn Users', description: 'Issue warnings to users', category: 'Users' },
  { key: 'user.restrict', name: 'Restrict Users', description: 'Restrict user posting and commenting', category: 'Users' },
  { key: 'user.suspend', name: 'Suspend Users', description: 'Suspend user accounts', category: 'Users' },
  { key: 'user.unsuspend', name: 'Unsuspend Users', description: 'Lift account suspensions', category: 'Users' },
  { key: 'user.ban', name: 'Ban Users', description: 'Permanently ban user accounts', category: 'Users' },
  { key: 'user.unban', name: 'Unban Users', description: 'Lift account bans', category: 'Users' },
  { key: 'report.view', name: 'View Reports', description: 'View content reports', category: 'Reports' },
  { key: 'report.review', name: 'Review Reports', description: 'Mark reports as in review', category: 'Reports' },
  { key: 'report.resolve', name: 'Resolve Reports', description: 'Resolve content reports', category: 'Reports' },
  { key: 'report.dismiss', name: 'Dismiss Reports', description: 'Dismiss content reports', category: 'Reports' },
  { key: 'report.escalate', name: 'Escalate Reports', description: 'Escalate reports to admin review', category: 'Reports' },
  { key: 'featured_post.view', name: 'View Global Feed', description: 'View global feed submissions (reserved)', category: 'Global Feed', comingSoon: true },
  { key: 'featured_post.review', name: 'Review Global Feed', description: 'Review global feed submissions (reserved)', category: 'Global Feed', comingSoon: true },
  { key: 'featured_post.approve', name: 'Approve Global Feed', description: 'Approve global feed submissions (reserved)', category: 'Global Feed', comingSoon: true },
  { key: 'featured_post.reject', name: 'Reject Global Feed', description: 'Reject global feed submissions (reserved)', category: 'Global Feed', comingSoon: true },
  { key: 'featured_post.remove', name: 'Remove Global Feed', description: 'Remove from global feed (reserved)', category: 'Global Feed', comingSoon: true },
  { key: 'featured_post.restore', name: 'Restore Global Feed', description: 'Restore global feed items (reserved)', category: 'Global Feed', comingSoon: true },
  { key: 'featured_post.escalate', name: 'Escalate Global Feed', description: 'Escalate global feed items (reserved)', category: 'Global Feed', comingSoon: true },
  { key: 'moderator.view', name: 'View Moderators', description: 'View moderator list (admin only)', category: 'Moderators' },
  { key: 'moderator.activity', name: 'View Moderator Activity', description: 'View moderator activity logs', category: 'Moderators' },
  { key: 'audit.view', name: 'View Audit Logs', description: 'View moderation audit logs', category: 'Audit' },
];

export type SimplePermissionCategory = 'Posts' | 'Comments' | 'Users' | 'Reports';

export const SIMPLE_PERMISSION_CATEGORY_ORDER: SimplePermissionCategory[] = [
  'Posts',
  'Comments',
  'Users',
  'Reports',
];

function catalogKeysForCategory(category: SimplePermissionCategory): PermissionKey[] {
  return PERMISSION_CATALOG.filter((p) => p.category === category && !p.comingSoon).map((p) => p.key);
}

export const SIMPLE_PERMISSION_CATEGORIES: Record<SimplePermissionCategory, PermissionKey[]> = {
  Posts: catalogKeysForCategory('Posts'),
  Comments: catalogKeysForCategory('Comments'),
  Users: catalogKeysForCategory('Users'),
  Reports: catalogKeysForCategory('Reports'),
};

export const DEFAULT_MODERATOR_PERMISSIONS: PermissionKey[] = [
  'report.view',
  'report.review',
  'report.resolve',
  'report.dismiss',
  'report.escalate',
  'post.view',
  'post.hide',
  'comment.view',
  'comment.hide',
];

export const MODERATOR_PRESETS: Record<Exclude<ModeratorPresetKey, 'custom'>, { label: string; keys: PermissionKey[] }> = {
  basic: {
    label: 'Basic Moderator',
    keys: [...DEFAULT_MODERATOR_PERMISSIONS],
  },
  content: {
    label: 'Content Moderator',
    keys: [
      'post.view', 'post.review', 'post.hide', 'post.remove', 'post.restore',
      'comment.view', 'comment.review', 'comment.hide', 'comment.remove', 'comment.restore',
      'report.view', 'report.review', 'report.resolve', 'report.dismiss',
    ],
  },
  community: {
    label: 'Community Moderator',
    keys: [
      ...DEFAULT_MODERATOR_PERMISSIONS,
      'post.review', 'comment.review', 'user.view', 'user.warn',
    ],
  },
  user_moderator: {
    label: 'User Moderator',
    keys: [
      'report.view', 'report.review', 'report.resolve', 'report.dismiss',
      'user.view', 'user.view_history', 'user.warn', 'user.restrict',
    ],
  },
  senior: {
    label: 'Senior Moderator',
    keys: PERMISSION_CATALOG
      .filter((p) => !p.comingSoon && !p.key.startsWith('moderator.') && p.key !== 'audit.view')
      .map((p) => p.key),
  },
};

export type ModeratorStatus = 'active' | 'suspended';
export type AccountModerationStatus = 'active' | 'restricted' | 'suspended' | 'banned';
export type ContentModerationAction = 'hidden' | 'removed';

export interface ModerationNotice {
  action: ContentModerationAction;
  reason: string | null;
  moderatedAt: string | null;
}

export interface ModeratorSummary {
  id: number;
  username: string;
  role: 'moderator';
  moderatorStatus: ModeratorStatus | null;
  permissionCount: number;
  createdAt: string;
  lastActivityAt: string | null;
}

export interface ModeratorDetail extends ModeratorSummary {
  permissionKeys: PermissionKey[];
}

export interface ModerationAuditLogEntry {
  id: number;
  actorId: number | null;
  actorUsername: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: number | null;
  reason: string | null;
  metadata: string | null;
  beforeState: string | null;
  afterState: string | null;
  createdAt: string;
}

export interface ModerationAuditLogPage {
  logs: ModerationAuditLogEntry[];
  nextCursor: number | null;
}

export interface PermissionsCatalogResponse {
  catalog: PermissionCatalogEntry[];
  presets: typeof MODERATOR_PRESETS;
  defaultPermissions: PermissionKey[];
}

export const PromoteModeratorSchema = z.object({
  userId: z.number().int().positive(),
  permissionKeys: z.array(PermissionKeySchema).optional(),
  preset: z.enum(['basic', 'content', 'community', 'user_moderator', 'senior']).optional(),
}).refine(
  (v) => !(v.permissionKeys && v.preset),
  { message: 'Provide either permissionKeys or preset, not both' },
);

export const UpdateModeratorPermissionsSchema = z.object({
  permissionKeys: z.array(PermissionKeySchema),
});

export const ModerationReasonSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
});

export const SuspendUserSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  until: z.string().datetime({ offset: true }).nullable().optional(),
});

export const UpdateModeratorStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export const ReviewReportV2Schema = z.object({
  action: z.enum(['review', 'resolve', 'dismiss', 'escalate', 'delete_content', 'delete_user']),
  reason: z.string().trim().max(500).optional(),
});

export type ReviewReportV2Action = z.infer<typeof ReviewReportV2Schema>['action'];
