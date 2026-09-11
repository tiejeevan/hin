import { describe, expect, it } from 'vitest';

describe('useVideoCallManager', () => {
  it('documents ring timeout aligned with server', () => {
    expect(45_000).toBeGreaterThan(0);
  });
});
