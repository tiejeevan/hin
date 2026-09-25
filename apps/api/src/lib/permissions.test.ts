import { describe, expect, it } from 'vitest';
import { hasPermissionInSet, permissionsToArray } from './permissions';
import type { PermissionKey } from '@hin/types';

describe('hasPermissionInSet', () => {
  it('grants all keys for admin set', () => {
    expect(hasPermissionInSet('all', 'post.hide')).toBe(true);
  });

  it('checks membership in moderator set', () => {
    const set = new Set<PermissionKey>(['report.view', 'post.hide']);
    expect(hasPermissionInSet(set, 'post.hide')).toBe(true);
    expect(hasPermissionInSet(set, 'user.ban')).toBe(false);
  });
});

describe('permissionsToArray', () => {
  it('returns all sentinel for admins', () => {
    expect(permissionsToArray('all')).toBe('all');
  });

  it('materializes moderator keys', () => {
    const keys = permissionsToArray(new Set<PermissionKey>(['post.hide']));
    expect(keys).toEqual(['post.hide']);
  });
});
