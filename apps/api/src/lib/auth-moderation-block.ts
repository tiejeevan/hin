import {
  getAccountModerationBlockMessage,
  getAccountModerationBlockReason,
  type ModerationGuardUser,
} from './moderation-guard';

export function moderationBlockJson(user: ModerationGuardUser) {
  const code = getAccountModerationBlockReason(user);
  if (!code) return null;
  return {
    error: getAccountModerationBlockMessage(code),
    code: code === 'banned' ? 'account_banned' : 'account_suspended',
    reason: user.accountModerationReason ?? null,
    until: user.accountModerationUntil ?? null,
  };
}
