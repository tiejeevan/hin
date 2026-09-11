import { describe, expect, it } from 'vitest';
import { computeAccountStatus } from './user-lifecycle';
import { deletedUsernameTombstone } from './registration';

describe('soft delete identifier release', () => {
  it('tombstone username frees the public handle in the users table', () => {
    const userId = 7;
    expect(deletedUsernameTombstone(userId)).toBe('__del_7');
    expect(deletedUsernameTombstone(userId)).not.toBe('myuser');
  });
});

describe('computeAccountStatus', () => {
  it('marks admin deleted accounts', () => {
    expect(computeAccountStatus('2026-01-01T00:00:00.000Z', 'admin')).toBe('admin_deleted');
  });

  it('marks self deleted accounts', () => {
    expect(computeAccountStatus('2026-01-01T00:00:00.000Z', 'self')).toBe('self_deleted');
  });

  it('marks active accounts', () => {
    expect(computeAccountStatus(null, null)).toBe('active');
  });
});
