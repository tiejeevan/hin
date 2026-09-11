import { describe, expect, it } from 'vitest';
import {
  VideoCallActionSchema,
  VideoCallAllowlistAddSchema,
  VideoCallAllowlistSearchQuerySchema,
  VideoCallInviteSchema,
  VideoCallsSettingsSchema,
} from '@hin/types';
import { RING_TIMEOUT_MS } from './video-calls';

describe('video call constants', () => {
  it('uses 45 second ring timeout', () => {
    expect(RING_TIMEOUT_MS).toBe(45_000);
  });
});

describe('video call request schemas', () => {
  it('validates invite payload', () => {
    expect(VideoCallInviteSchema.safeParse({ calleeUserId: 1 }).success).toBe(true);
    expect(VideoCallInviteSchema.safeParse({ calleeUserId: 0 }).success).toBe(false);
  });

  it('accepts callType on invite payload', () => {
    const audio = VideoCallInviteSchema.safeParse({ calleeUserId: 1, callType: 'audio' });
    expect(audio.success).toBe(true);
    if (audio.success) expect(audio.data.callType).toBe('audio');

    const video = VideoCallInviteSchema.safeParse({ calleeUserId: 1, callType: 'video' });
    expect(video.success).toBe(true);
    if (video.success) expect(video.data.callType).toBe('video');

    const defaulted = VideoCallInviteSchema.safeParse({ calleeUserId: 1 });
    expect(defaulted.success).toBe(true);
    if (defaulted.success) expect(defaulted.data.callType).toBe('video');
  });

  it('validates call action payload', () => {
    expect(VideoCallActionSchema.safeParse({ callId: 42 }).success).toBe(true);
    expect(VideoCallActionSchema.safeParse({}).success).toBe(false);
  });

  it('validates video calls settings payload', () => {
    expect(VideoCallsSettingsSchema.safeParse({ videoCallsEnabled: true }).success).toBe(true);
    expect(VideoCallsSettingsSchema.safeParse({ videoCallsEnabled: false }).success).toBe(true);
    expect(VideoCallsSettingsSchema.safeParse({}).success).toBe(false);
  });

  it('validates allowlist add by identifier or userId', () => {
    expect(VideoCallAllowlistAddSchema.safeParse({ identifier: 'alice' }).success).toBe(true);
    expect(VideoCallAllowlistAddSchema.safeParse({ identifier: 'a@b.com' }).success).toBe(true);
    expect(VideoCallAllowlistAddSchema.safeParse({ userId: 42 }).success).toBe(true);
    expect(VideoCallAllowlistAddSchema.safeParse({ identifier: '' }).success).toBe(false);
    expect(VideoCallAllowlistAddSchema.safeParse({}).success).toBe(false);
  });

  it('validates allowlist search query', () => {
    expect(VideoCallAllowlistSearchQuerySchema.safeParse({ q: 'ja' }).success).toBe(true);
    expect(VideoCallAllowlistSearchQuerySchema.safeParse({ q: '  jack  ' }).success).toBe(true);
    expect(VideoCallAllowlistSearchQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(VideoCallAllowlistSearchQuerySchema.safeParse({ q: '' }).success).toBe(false);
  });
});
