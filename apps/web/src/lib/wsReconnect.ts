/** Matches apps/api Durable Object AUTH_FAILURE_CLOSE_CODE. */
export const WS_AUTH_FAILURE_CLOSE_CODE = 4001;

/** Matches apps/api Durable Object ACCOUNT_SETUP_BLOCKED_CLOSE_CODE. */
export const WS_ACCOUNT_SETUP_BLOCKED_CLOSE_CODE = 4002;

/** Server join-failure payload message from RealtimeDO. */
export const WS_AUTH_FAILURE_MESSAGE = 'Authentication failed';

export function isWsAuthFailureCloseCode(code: number): boolean {
  return code === WS_AUTH_FAILURE_CLOSE_CODE;
}

export function isWsAccountSetupBlockedCloseCode(code: number): boolean {
  return code === WS_ACCOUNT_SETUP_BLOCKED_CLOSE_CODE;
}

export function isWsAuthFailureMessage(message: unknown): boolean {
  return typeof message === 'string' && message === WS_AUTH_FAILURE_MESSAGE;
}

export function isWsAccountBlockErrorCode(code: unknown): boolean {
  return code === 'email_verification_required' || code === 'username_setup_required';
}

/** Whether to schedule an automatic reconnect after a WebSocket close. */
export function shouldReconnectAfterClose(opts: {
  closeCode: number;
  hasToken: boolean;
}): boolean {
  if (isWsAuthFailureCloseCode(opts.closeCode)) return false;
  if (isWsAccountSetupBlockedCloseCode(opts.closeCode)) return false;
  return opts.hasToken;
}
