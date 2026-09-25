export type AccountModerationBlockState = {
  code: 'account_suspended' | 'account_banned';
  error: string;
  reason: string | null;
  until: string | null;
};

export function accountModerationBlockFromBody(
  data: unknown,
): AccountModerationBlockState | null {
  if (!data || typeof data !== 'object') return null;
  const code = (data as { code?: string }).code;
  if (code !== 'account_suspended' && code !== 'account_banned') return null;
  const body = data as {
    error?: string;
    reason?: string | null;
    until?: string | null;
  };
  return {
    code,
    error: body.error || (code === 'account_banned' ? 'Your account has been banned' : 'Your account has been suspended'),
    reason: body.reason ?? null,
    until: body.until ?? null,
  };
}
