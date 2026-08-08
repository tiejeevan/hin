import { describe, it, expect } from 'vitest';
import {
  WS_AUTH_FAILURE_CLOSE_CODE,
  isWsAuthFailureCloseCode,
  isWsAuthFailureMessage,
  shouldReconnectAfterClose,
} from './wsReconnect';

describe('wsReconnect', () => {
  it('recognizes auth failure close code 4001', () => {
    expect(isWsAuthFailureCloseCode(WS_AUTH_FAILURE_CLOSE_CODE)).toBe(true);
    expect(isWsAuthFailureCloseCode(1000)).toBe(false);
    expect(isWsAuthFailureCloseCode(1006)).toBe(false);
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

  it('reconnects on normal close when still authenticated', () => {
    expect(shouldReconnectAfterClose({ closeCode: 1000, hasToken: true })).toBe(true);
    expect(shouldReconnectAfterClose({ closeCode: 1006, hasToken: true })).toBe(true);
  });

  it('does not reconnect when logged out (no token)', () => {
    expect(shouldReconnectAfterClose({ closeCode: 1000, hasToken: false })).toBe(false);
    expect(shouldReconnectAfterClose({ closeCode: 1006, hasToken: false })).toBe(false);
  });
});
