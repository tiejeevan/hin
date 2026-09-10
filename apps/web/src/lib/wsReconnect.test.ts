import { describe, it, expect } from 'vitest';
import {
  WS_ACCOUNT_SETUP_BLOCKED_CLOSE_CODE,
  WS_AUTH_FAILURE_CLOSE_CODE,
  isWsAccountBlockErrorCode,
  isWsAccountSetupBlockedCloseCode,
  isWsAuthFailureCloseCode,
  isWsAuthFailureMessage,
  shouldReconnectAfterClose,
} from './wsReconnect';

describe('wsReconnect', () => {
  it('recognizes auth failure close code 4001', () => {
    expect(isWsAuthFailureCloseCode(WS_AUTH_FAILURE_CLOSE_CODE)).toBe(true);
    expect(isWsAuthFailureCloseCode(1000)).toBe(false);
    expect(isWsAuthFailureCloseCode(1006)).toBe(false);
    expect(isWsAuthFailureCloseCode(WS_ACCOUNT_SETUP_BLOCKED_CLOSE_CODE)).toBe(false);
  });

  it('recognizes account setup blocked close code 4002', () => {
    expect(isWsAccountSetupBlockedCloseCode(WS_ACCOUNT_SETUP_BLOCKED_CLOSE_CODE)).toBe(true);
    expect(isWsAccountSetupBlockedCloseCode(WS_AUTH_FAILURE_CLOSE_CODE)).toBe(false);
  });

  it('recognizes account block error codes', () => {
    expect(isWsAccountBlockErrorCode('email_verification_required')).toBe(true);
    expect(isWsAccountBlockErrorCode('username_setup_required')).toBe(true);
    expect(isWsAccountBlockErrorCode('rate_limit')).toBe(false);
  });

  it('recognizes auth failure error message', () => {
    expect(isWsAuthFailureMessage('Authentication failed')).toBe(true);
    expect(isWsAuthFailureMessage('Other error')).toBe(false);
    expect(isWsAuthFailureMessage(undefined)).toBe(false);
  });

  it('does not reconnect on auth failure close even with a token', () => {
    expect(
      shouldReconnectAfterClose({ closeCode: WS_AUTH_FAILURE_CLOSE_CODE, hasToken: true }),
    ).toBe(false);
  });

  it('does not reconnect on account setup blocked close even with a token', () => {
    expect(
      shouldReconnectAfterClose({ closeCode: WS_ACCOUNT_SETUP_BLOCKED_CLOSE_CODE, hasToken: true }),
    ).toBe(false);
  });

  it('reconnects on normal close when still authenticated', () => {
    expect(shouldReconnectAfterClose({ closeCode: 1000, hasToken: true })).toBe(true);
    expect(shouldReconnectAfterClose({ closeCode: 1006, hasToken: true })).toBe(true);
  });

  it('does not reconnect when logged out (no token)', () => {
    expect(shouldReconnectAfterClose({ closeCode: 1000, hasToken: false })).toBe(false);
    expect(shouldReconnectAfterClose({ closeCode: 1006, hasToken: false })).toBe(false);
  });
});
