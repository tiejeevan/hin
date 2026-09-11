import type { CallType } from '@hin/types';
import type { Env } from '../types';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

export class RealtimeKitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealtimeKitConfigError';
  }
}

export class RealtimeKitApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RealtimeKitApiError';
    this.status = status;
  }
}

interface RealtimeKitParticipant {
  id: string;
  token: string;
  preset_name: string;
  custom_participant_id: string;
}

interface RealtimeKitMeeting {
  id: string;
}

function requireRealtimeKitConfig(env: Env): {
  accountId: string;
  appId: string;
  apiToken: string;
  preset: string;
} {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const appId = env.REALTIMEKIT_APP_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !appId || !apiToken) {
    throw new RealtimeKitConfigError(
      'Video calling is not configured. Set CLOUDFLARE_ACCOUNT_ID, REALTIMEKIT_APP_ID, and CLOUDFLARE_API_TOKEN.',
    );
  }
  return {
    accountId,
    appId,
    apiToken,
    preset: env.REALTIMEKIT_DM_PRESET?.trim() || 'group_call_participant',
  };
}

export function resolvePreset(env: Env, callType: CallType): string {
  if (callType === 'audio') {
    return env.REALTIMEKIT_AUDIO_PRESET?.trim()
      || env.REALTIMEKIT_DM_PRESET?.trim()
      || 'group_call_participant';
  }
  return env.REALTIMEKIT_DM_PRESET?.trim() || 'group_call_participant';
}

async function cfFetch<T>(
  env: Env,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { apiToken } = requireRealtimeKitConfig(env);
  const res = await fetch(`${CF_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json() as { success?: boolean; errors?: Array<{ message?: string }>; data?: T };
  if (!res.ok || body.success === false) {
    const msg = body.errors?.[0]?.message ?? `Cloudflare RealtimeKit API error (${res.status})`;
    throw new RealtimeKitApiError(msg, res.status);
  }
  return body.data as T;
}

export function isRealtimeKitConfigured(env: Env): boolean {
  return !!(
    env.CLOUDFLARE_ACCOUNT_ID?.trim()
    && env.REALTIMEKIT_APP_ID?.trim()
    && env.CLOUDFLARE_API_TOKEN?.trim()
  );
}

export async function createMeeting(env: Env, title: string): Promise<string> {
  const { accountId, appId } = requireRealtimeKitConfig(env);
  const data = await cfFetch<RealtimeKitMeeting>(
    env,
    `/accounts/${accountId}/realtime/kit/${appId}/meetings`,
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        record_on_start: false,
        live_stream_on_start: false,
        persist_chat: false,
      }),
    },
  );
  if (!data?.id) {
    throw new RealtimeKitApiError('Meeting creation returned no id', 502);
  }
  return data.id;
}

export async function addParticipant(
  env: Env,
  meetingId: string,
  customParticipantId: string,
  name: string,
  picture?: string | null,
  presetName?: string,
): Promise<RealtimeKitParticipant> {
  const { accountId, appId, preset } = requireRealtimeKitConfig(env);
  const data = await cfFetch<RealtimeKitParticipant>(
    env,
    `/accounts/${accountId}/realtime/kit/${appId}/meetings/${meetingId}/participants`,
    {
      method: 'POST',
      body: JSON.stringify({
        custom_participant_id: customParticipantId,
        preset_name: presetName ?? preset,
        name,
        ...(picture ? { picture } : {}),
      }),
    },
  );
  if (!data?.id || !data.token) {
    throw new RealtimeKitApiError('Add participant returned incomplete data', 502);
  }
  return data;
}

export async function refreshParticipantToken(
  env: Env,
  meetingId: string,
  participantId: string,
): Promise<string> {
  const { accountId, appId } = requireRealtimeKitConfig(env);
  const data = await cfFetch<{ token: string }>(
    env,
    `/accounts/${accountId}/realtime/kit/${appId}/meetings/${meetingId}/participants/${participantId}/token`,
    { method: 'POST', body: '{}' },
  );
  if (!data?.token) {
    throw new RealtimeKitApiError('Token refresh returned no token', 502);
  }
  return data.token;
}

export async function deleteParticipant(
  env: Env,
  meetingId: string,
  participantId: string,
): Promise<void> {
  const { accountId, appId } = requireRealtimeKitConfig(env);
  await cfFetch<unknown>(
    env,
    `/accounts/${accountId}/realtime/kit/${appId}/meetings/${meetingId}/participants/${participantId}`,
    { method: 'DELETE' },
  );
}
