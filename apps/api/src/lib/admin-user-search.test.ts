import { describe, expect, it } from 'vitest';
import {
  adminUserSearchShouldRun,
  normalizeAdminUserSearchQuery,
} from './admin-user-search';

describe('adminUserSearchShouldRun', () => {
  it('rejects empty query', () => {
    expect(adminUserSearchShouldRun('')).toBe(false);
    expect(adminUserSearchShouldRun('   ')).toBe(false);
  });

  it('allows exact id for short numeric query', () => {
    expect(adminUserSearchShouldRun('42')).toBe(true);
    expect(adminUserSearchShouldRun('ab')).toBe(false);
  });

  it('allows username search from 3 chars', () => {
    expect(adminUserSearchShouldRun('jel')).toBe(true);
  });

  it('strips @ prefix', () => {
    expect(normalizeAdminUserSearchQuery('@jello')).toBe('jello');
  });
});
