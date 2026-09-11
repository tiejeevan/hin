export type AudioRoute = 'earpiece' | 'speaker';

const EARPIECE_LABEL = /earpiece|receiver|handset|phone/i;
const SPEAKER_LABEL = /speaker| loud/i;

export function pickOutputDevice(
  devices: MediaDeviceInfo[],
  route: AudioRoute,
): MediaDeviceInfo | null {
  if (devices.length === 0) return null;

  const defaultDevice = devices.find(d => d.deviceId === 'default') ?? devices[0];

  if (route === 'earpiece') {
    return devices.find(d => EARPIECE_LABEL.test(d.label)) ?? defaultDevice;
  }

  return devices.find(d => SPEAKER_LABEL.test(d.label))
    ?? devices[devices.length - 1]
    ?? defaultDevice;
}

export function isAudioRouteSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const probe = document.createElement('audio');
  return typeof (probe as HTMLAudioElement & { setSinkId?: unknown }).setSinkId === 'function'
    || typeof navigator.mediaDevices?.enumerateDevices === 'function';
}

type RtkSelfLike = {
  getSpeakerDevices?: () => Promise<MediaDeviceInfo[]>;
  setDevice?: (device: MediaDeviceInfo) => Promise<void>;
};

async function listOutputDevices(self?: RtkSelfLike): Promise<MediaDeviceInfo[]> {
  if (self?.getSpeakerDevices) {
    try {
      const devices = await self.getSpeakerDevices();
      if (devices.length > 0) return devices;
    } catch {
      /* fall through */
    }
  }

  if (typeof navigator.mediaDevices?.enumerateDevices === 'function') {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audiooutput');
  }

  return [];
}

export async function applyAudioRoute(options: {
  self?: RtkSelfLike;
  audioEl?: HTMLAudioElement | null;
  route: AudioRoute;
}): Promise<boolean> {
  const { self, audioEl, route } = options;
  const devices = await listOutputDevices(self);
  const device = pickOutputDevice(devices, route);
  if (!device) return false;

  let applied = false;

  if (self?.setDevice) {
    try {
      await self.setDevice(device);
      applied = true;
    } catch {
      /* try setSinkId */
    }
  }

  if (audioEl && typeof audioEl.setSinkId === 'function') {
    try {
      await audioEl.setSinkId(device.deviceId);
      applied = true;
    } catch {
      /* browser may not allow routing on this element */
    }
  }

  return applied;
}
