import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeCallMediaPermissions, requestCallMediaPermissions } from './callMediaPermissions';

function mockNavigator(overrides: Partial<Navigator> & { isSecureContext?: boolean }) {
  const { isSecureContext = true, ...navOverrides } = overrides;
  Object.defineProperty(window, 'isSecureContext', { value: isSecureContext, configurable: true });
  vi.stubGlobal('navigator', {
    ...navigator,
    ...navOverrides,
  });
}

describe('callMediaPermissions', () => {
  beforeEach(() => {
    mockNavigator({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects insecure contexts', async () => {
    mockNavigator({ isSecureContext: false });
    const result = await probeCallMediaPermissions('audio');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('insecure');
    }
  });

  it('rejects when getUserMedia is unavailable', async () => {
    mockNavigator({ mediaDevices: undefined });
    const result = await probeCallMediaPermissions('audio');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unsupported');
    }
  });

  it('maps NotAllowedError to denied', async () => {
    mockNavigator({
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(Object.assign(new DOMException('denied', 'NotAllowedError'), { name: 'NotAllowedError' })),
      } as unknown as MediaDevices,
    });

    const result = await requestCallMediaPermissions('audio');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('denied');
      expect(result.message).toContain('Microphone');
    }
  });

  it('maps NotFoundError to not_found', async () => {
    mockNavigator({
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(Object.assign(new DOMException('missing', 'NotFoundError'), { name: 'NotFoundError' })),
      } as unknown as MediaDevices,
    });

    const result = await requestCallMediaPermissions('video');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not_found');
    }
  });

  it('requests audio-only constraints for voice calls', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    mockNavigator({
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
    });

    const result = await requestCallMediaPermissions('audio');
    expect(result.ok).toBe(true);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it('requests audio and video for video calls', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    mockNavigator({
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
    });

    const result = await requestCallMediaPermissions('video');
    expect(result.ok).toBe(true);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
  });

  it('returns denied when permissions.query reports microphone blocked', async () => {
    mockNavigator({
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      } as unknown as Permissions,
      mediaDevices: {
        getUserMedia: vi.fn(),
      } as unknown as MediaDevices,
    });

    const result = await probeCallMediaPermissions('audio');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('denied');
    }
  });
});
