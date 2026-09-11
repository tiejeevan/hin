import { describe, expect, it } from 'vitest';
import { pickOutputDevice } from './callAudioRoute';

function device(id: string, label: string): MediaDeviceInfo {
  return { deviceId: id, kind: 'audiooutput', label, groupId: '', toJSON: () => ({}) };
}

describe('pickOutputDevice', () => {
  const devices = [
    device('default', 'Default'),
    device('recv', 'Built-in Receiver'),
    device('spk', 'Built-in Speaker'),
  ];

  it('picks receiver-like device for earpiece', () => {
    expect(pickOutputDevice(devices, 'earpiece')?.deviceId).toBe('recv');
  });

  it('picks speaker-like device for speaker route', () => {
    expect(pickOutputDevice(devices, 'speaker')?.deviceId).toBe('spk');
  });

  it('falls back to default when no label match', () => {
    const generic = [device('default', 'Default'), device('a', 'Output A')];
    expect(pickOutputDevice(generic, 'earpiece')?.deviceId).toBe('default');
    expect(pickOutputDevice(generic, 'speaker')?.deviceId).toBe('a');
  });

  it('returns null for empty device list', () => {
    expect(pickOutputDevice([], 'earpiece')).toBeNull();
  });
});
