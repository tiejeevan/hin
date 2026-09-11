import type { CallType } from '@hin/types';

export type CallMediaPermissionFailureReason =
  | 'unsupported'
  | 'insecure'
  | 'denied'
  | 'not_found'
  | 'error';

export type CallMediaPermissionResult =
  | { ok: true }
  | { ok: false; reason: CallMediaPermissionFailureReason; message: string };

function isSecureContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true;
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function mapMediaError(err: unknown, callType: CallType): CallMediaPermissionResult {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      const devices = callType === 'video' ? 'Microphone and camera' : 'Microphone';
      return {
        ok: false,
        reason: 'denied',
        message: `${devices} access was denied. Allow access in your browser settings and try again.`,
      };
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return {
        ok: false,
        reason: 'not_found',
        message: callType === 'video'
          ? 'No camera or microphone was found on this device.'
          : 'No microphone was found on this device.',
      };
    }
  }
  const message = err instanceof Error ? err.message : 'Could not access media devices';
  return { ok: false, reason: 'error', message };
}

export async function probeCallMediaPermissions(callType: CallType): Promise<CallMediaPermissionResult> {
  if (typeof navigator === 'undefined') {
    return { ok: false, reason: 'unsupported', message: 'Media devices are not available.' };
  }

  if (!isSecureContext()) {
    return {
      ok: false,
      reason: 'insecure',
      message: 'Calls require HTTPS or localhost. Open this site over a secure connection and try again.',
    };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Your browser does not support voice or video calls.',
    };
  }

  const permApi = navigator.permissions;
  if (!permApi?.query) {
    return { ok: true };
  }

  try {
    const mic = await permApi.query({ name: 'microphone' as PermissionName });
    if (mic.state === 'denied') {
      return {
        ok: false,
        reason: 'denied',
        message: 'Microphone access is blocked. Allow access in your browser settings and try again.',
      };
    }

    if (callType === 'video') {
      const cam = await permApi.query({ name: 'camera' as PermissionName });
      if (cam.state === 'denied') {
        return {
          ok: false,
          reason: 'denied',
          message: 'Camera access is blocked. Allow access in your browser settings and try again.',
        };
      }
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export async function requestCallMediaPermissions(callType: CallType): Promise<CallMediaPermissionResult> {
  const probe = await probeCallMediaPermissions(callType);
  if (!probe.ok) return probe;

  try {
    const constraints: MediaStreamConstraints = callType === 'video'
      ? { audio: true, video: true }
      : { audio: true, video: false };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stopStream(stream);
    return { ok: true };
  } catch (err) {
    return mapMediaError(err, callType);
  }
}
