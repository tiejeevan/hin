import { describe, expect, it } from 'vitest';
import { resolvePreset } from './realtimekit';
import type { Env } from '../types';

describe('resolvePreset', () => {
  const env = {
    REALTIMEKIT_DM_PRESET: 'hin-dm-video',
    REALTIMEKIT_AUDIO_PRESET: 'hin-dm-audio',
  } as Env;

  it('returns video preset for video calls', () => {
    expect(resolvePreset(env, 'video')).toBe('hin-dm-video');
  });

  it('returns audio preset for voice calls', () => {
    expect(resolvePreset(env, 'audio')).toBe('hin-dm-audio');
  });

  it('falls back to video preset when audio preset is unset', () => {
    expect(resolvePreset({ REALTIMEKIT_DM_PRESET: 'group_call_participant' } as Env, 'audio'))
      .toBe('group_call_participant');
  });
});
