import type { CallType, VideoCallSession } from '@hin/types';
import { API_URL } from '../config';

async function parseJson<T>(res: Response): Promise<T & { error?: string; code?: string }> {
  return res.json() as Promise<T & { error?: string; code?: string }>;
}

export async function fetchActiveCall(token: string): Promise<VideoCallSession | null> {
  const res = await fetch(`${API_URL}/api/calls/active`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await parseJson<{ call: VideoCallSession | null }>(res);
  return data.call ?? null;
}

export async function inviteCall(
  token: string,
  calleeUserId: number,
  callType: CallType = 'video',
): Promise<VideoCallSession> {
  const res = await fetch(`${API_URL}/api/calls/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ calleeUserId, callType }),
  });
  const data = await parseJson<{ call: VideoCallSession }>(res);
  if (!res.ok) throw new Error(data.error || 'Failed to start call');
  return data.call;
}

export async function acceptCall(token: string, callId: number): Promise<VideoCallSession> {
  const res = await fetch(`${API_URL}/api/calls/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ callId }),
  });
  const data = await parseJson<{ call: VideoCallSession }>(res);
  if (!res.ok) throw new Error(data.error || 'Failed to accept call');
  return data.call;
}

export async function declineCall(token: string, callId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/calls/decline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ callId }),
  });
  const data = await parseJson<{ error?: string }>(res);
  if (!res.ok) throw new Error(data.error || 'Failed to decline call');
}

export async function cancelCall(
  token: string,
  callId: number,
  reason: 'cancelled' | 'missed' = 'cancelled',
): Promise<void> {
  const res = await fetch(`${API_URL}/api/calls/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ callId, reason }),
  });
  const data = await parseJson<{ error?: string }>(res);
  if (!res.ok) throw new Error(data.error || 'Failed to cancel call');
}

export async function endCall(token: string, callId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/calls/end`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ callId }),
  });
  const data = await parseJson<{ error?: string }>(res);
  if (!res.ok) throw new Error(data.error || 'Failed to end call');
}
