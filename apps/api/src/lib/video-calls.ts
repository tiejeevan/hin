import { drizzle } from 'drizzle-orm/d1';
import { and, asc, desc, eq, inArray, isNull, like, or } from 'drizzle-orm';
import * as schema from '@hin/db';
import type {
  CallType,
  VideoCallAllowlistEntry,
  VideoCallAllowlistSearchResult,
  VideoCallPeer,
  VideoCallSession,
  VideoCallStatus,
} from '@hin/types';
import type { Env } from '../types';
import { isBlocked } from './blocks';
import { isVideoCallsEnabled } from './system-settings';
import {
  RealtimeKitApiError,
  RealtimeKitConfigError,
  addParticipant,
  createMeeting,
  deleteParticipant,
  isRealtimeKitConfigured,
  refreshParticipantToken,
  resolvePreset,
} from './realtimekit';
import { broadcastUserEvent } from './realtime';
import { normalizeEmail } from './otp';
import { normalizeUsername } from './auth-validation';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export const RING_TIMEOUT_MS = 45_000;

const ACTIVE_STATUSES: VideoCallStatus[] = ['ringing', 'accepted'];

export async function isUserOnVideoCallAllowlist(db: Db, userId: number): Promise<boolean> {
  const row = await db
    .select({ userId: schema.videoCallAllowlist.userId })
    .from(schema.videoCallAllowlist)
    .where(eq(schema.videoCallAllowlist.userId, userId))
    .get();
  return !!row;
}

export async function canUserInitiateVideoCalls(db: Db, userId: number): Promise<boolean> {
  const enabled = await isVideoCallsEnabled(db);
  if (!enabled) return false;
  return isUserOnVideoCallAllowlist(db, userId);
}

async function toPeer(db: Db, userId: number): Promise<VideoCallPeer | null> {
  const user = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
    .get();
  if (!user) return null;
  return {
    userId: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
}

function isRingExpired(createdAt: string, now = Date.now()): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true;
  return now - created > RING_TIMEOUT_MS;
}

export async function expireStaleRingingCalls(db: Db, userId: number): Promise<void> {
  const rows = await db
    .select()
    .from(schema.videoCalls)
    .where(
      and(
        eq(schema.videoCalls.status, 'ringing'),
        or(
          eq(schema.videoCalls.callerId, userId),
          eq(schema.videoCalls.calleeId, userId),
        ),
      ),
    )
    .all();

  const nowIso = new Date().toISOString();
  for (const row of rows) {
    if (!isRingExpired(row.createdAt)) continue;
    await db
      .update(schema.videoCalls)
      .set({ status: 'missed', updatedAt: nowIso, endedAt: nowIso })
      .where(eq(schema.videoCalls.id, row.id))
      .run();
  }
}

async function getActiveCallRow(db: Db, userId: number) {
  await expireStaleRingingCalls(db, userId);
  return db
    .select()
    .from(schema.videoCalls)
    .where(
      and(
        inArray(schema.videoCalls.status, ACTIVE_STATUSES),
        or(
          eq(schema.videoCalls.callerId, userId),
          eq(schema.videoCalls.calleeId, userId),
        ),
      ),
    )
    .orderBy(desc(schema.videoCalls.createdAt))
    .get();
}

async function rowToSession(
  db: Db,
  row: typeof schema.videoCalls.$inferSelect,
  viewerUserId: number,
  authToken?: string,
): Promise<VideoCallSession | null> {
  const [caller, callee] = await Promise.all([
    toPeer(db, row.callerId),
    toPeer(db, row.calleeId),
  ]);
  if (!caller || !callee) return null;
  const callType = row.callType === 'audio' ? 'audio' : 'video';
  return {
    callId: row.id,
    meetingId: row.meetingId,
    status: row.status as VideoCallStatus,
    callType,
    caller,
    callee,
    ...(authToken ? { authToken } : {}),
    createdAt: row.createdAt,
  };
}

export async function getActiveCallForUser(
  db: Db,
  env: Env,
  userId: number,
): Promise<VideoCallSession | null> {
  const row = await getActiveCallRow(db, userId);
  if (!row) return null;

  let authToken: string | undefined;
  if (row.status === 'accepted' || (row.status === 'ringing' && row.callerId === userId)) {
    const participantId = row.callerId === userId
      ? row.callerParticipantId
      : row.calleeParticipantId;
    try {
      authToken = await refreshParticipantToken(env, row.meetingId, participantId);
    } catch {
      authToken = undefined;
    }
  }

  return rowToSession(db, row, userId, authToken);
}

async function cleanupMeetingParticipants(env: Env, row: typeof schema.videoCalls.$inferSelect): Promise<void> {
  if (!isRealtimeKitConfigured(env)) return;
  await Promise.allSettled([
    deleteParticipant(env, row.meetingId, row.callerParticipantId),
    deleteParticipant(env, row.meetingId, row.calleeParticipantId),
  ]);
}

async function finalizeCall(
  db: Db,
  env: Env,
  row: typeof schema.videoCalls.$inferSelect,
  status: VideoCallStatus,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .update(schema.videoCalls)
    .set({ status, updatedAt: nowIso, endedAt: nowIso })
    .where(eq(schema.videoCalls.id, row.id))
    .run();
  await cleanupMeetingParticipants(env, row);
}

export async function inviteVideoCall(
  db: Db,
  env: Env,
  callerId: number,
  calleeUserId: number,
  callType: CallType = 'video',
): Promise<VideoCallSession> {
  if (callerId === calleeUserId) {
    throw new VideoCallDomainError('Cannot call yourself', 400);
  }

  const enabled = await isVideoCallsEnabled(db);
  if (!enabled) {
    throw new VideoCallDomainError('Video calling is disabled', 403);
  }

  const canInitiate = await isUserOnVideoCallAllowlist(db, callerId);
  if (!canInitiate) {
    throw new VideoCallDomainError('You are not allowed to start video calls', 403);
  }

  if (!isRealtimeKitConfigured(env)) {
    throw new VideoCallDomainError('Video calling is not configured on the server', 503);
  }

  if (await isBlocked(db, callerId, calleeUserId)) {
    throw new VideoCallDomainError('Cannot call this user', 403);
  }

  const callee = await db
    .select({ id: schema.users.id, deletedAt: schema.users.deletedAt })
    .from(schema.users)
    .where(eq(schema.users.id, calleeUserId))
    .get();
  if (!callee || callee.deletedAt) {
    throw new VideoCallDomainError('User not found', 404);
  }

  await expireStaleRingingCalls(db, callerId);
  await expireStaleRingingCalls(db, calleeUserId);

  const callerActive = await getActiveCallRow(db, callerId);
  if (callerActive) {
    throw new VideoCallDomainError('You are already in a call', 409);
  }

  const calleeActive = await getActiveCallRow(db, calleeUserId);
  if (calleeActive) {
    throw new VideoCallDomainError('User is busy', 409, 'busy');
  }

  const callerPeer = await toPeer(db, callerId);
  const calleePeer = await toPeer(db, calleeUserId);
  if (!callerPeer || !calleePeer) {
    throw new VideoCallDomainError('User not found', 404);
  }

  let meetingId: string;
  let callerParticipantId: string;
  let callerToken: string;
  let calleeParticipantId: string;
  const presetName = resolvePreset(env, callType);

  try {
    meetingId = await createMeeting(env, `hin-dm-${callerId}-${calleeUserId}`);
    const [callerParticipant, calleeParticipant] = await Promise.all([
      addParticipant(
        env,
        meetingId,
        `hin-user-${callerId}`,
        callerPeer.username,
        callerPeer.avatarUrl,
        presetName,
      ),
      addParticipant(
        env,
        meetingId,
        `hin-user-${calleeUserId}`,
        calleePeer.username,
        calleePeer.avatarUrl,
        presetName,
      ),
    ]);
    callerParticipantId = callerParticipant.id;
    callerToken = callerParticipant.token;
    calleeParticipantId = calleeParticipant.id;
  } catch (err) {
    if (err instanceof RealtimeKitConfigError || err instanceof RealtimeKitApiError) {
      throw new VideoCallDomainError(err.message, err instanceof RealtimeKitApiError ? err.status : 503);
    }
    throw err;
  }

  const nowIso = new Date().toISOString();
  const inserted = await db
    .insert(schema.videoCalls)
    .values({
      callerId,
      calleeId: calleeUserId,
      meetingId,
      callerParticipantId,
      calleeParticipantId,
      status: 'ringing',
      callType,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning()
    .get();

  await broadcastUserEvent(env, calleeUserId, {
    type: 'call_invite',
    payload: {
      callId: inserted.id,
      caller: callerPeer,
      callType,
      createdAt: nowIso,
    },
  });

  return {
    callId: inserted.id,
    meetingId,
    status: 'ringing',
    callType,
    caller: callerPeer,
    callee: calleePeer,
    authToken: callerToken,
    createdAt: nowIso,
  };
}

export async function acceptVideoCall(
  db: Db,
  env: Env,
  userId: number,
  callId: number,
): Promise<VideoCallSession> {
  const row = await db
    .select()
    .from(schema.videoCalls)
    .where(eq(schema.videoCalls.id, callId))
    .get();
  if (!row) throw new VideoCallDomainError('Call not found', 404);
  if (row.calleeId !== userId) throw new VideoCallDomainError('Forbidden', 403);
  if (row.status !== 'ringing') throw new VideoCallDomainError('Call is no longer ringing', 409);
  if (isRingExpired(row.createdAt)) {
    await finalizeCall(db, env, row, 'missed');
    throw new VideoCallDomainError('Call expired', 410);
  }

  const calleeToken = await refreshParticipantToken(env, row.meetingId, row.calleeParticipantId);
  const nowIso = new Date().toISOString();
  await db
    .update(schema.videoCalls)
    .set({ status: 'accepted', updatedAt: nowIso })
    .where(eq(schema.videoCalls.id, callId))
    .run();

  const calleePeer = await toPeer(db, userId);
  const callerPeer = await toPeer(db, row.callerId);
  if (!calleePeer || !callerPeer) {
    throw new VideoCallDomainError('User not found', 404);
  }

  const callType = row.callType === 'audio' ? 'audio' : 'video';

  await broadcastUserEvent(env, row.callerId, {
    type: 'call_accepted',
    payload: { callId, callee: calleePeer, callType },
  });

  return {
    callId,
    meetingId: row.meetingId,
    status: 'accepted',
    callType,
    caller: callerPeer,
    callee: calleePeer,
    authToken: calleeToken,
    createdAt: row.createdAt,
  };
}

export async function declineVideoCall(
  db: Db,
  env: Env,
  userId: number,
  callId: number,
): Promise<void> {
  const row = await db
    .select()
    .from(schema.videoCalls)
    .where(eq(schema.videoCalls.id, callId))
    .get();
  if (!row) throw new VideoCallDomainError('Call not found', 404);
  if (row.calleeId !== userId) throw new VideoCallDomainError('Forbidden', 403);
  if (row.status !== 'ringing') return;

  await finalizeCall(db, env, row, 'declined');
  await broadcastUserEvent(env, row.callerId, {
    type: 'call_declined',
    payload: { callId, calleeUserId: userId },
  });
}

export async function cancelVideoCall(
  db: Db,
  env: Env,
  userId: number,
  callId: number,
  reason: 'cancelled' | 'missed' = 'cancelled',
): Promise<void> {
  const row = await db
    .select()
    .from(schema.videoCalls)
    .where(eq(schema.videoCalls.id, callId))
    .get();
  if (!row) throw new VideoCallDomainError('Call not found', 404);
  if (row.callerId !== userId) throw new VideoCallDomainError('Forbidden', 403);
  if (row.status !== 'ringing') return;

  const status: VideoCallStatus = reason === 'missed' ? 'missed' : 'cancelled';
  await finalizeCall(db, env, row, status);

  await broadcastUserEvent(env, row.calleeId, {
    type: 'call_cancelled',
    payload: { callId, reason },
  });
}

export async function endVideoCall(
  db: Db,
  env: Env,
  userId: number,
  callId: number,
): Promise<void> {
  const row = await db
    .select()
    .from(schema.videoCalls)
    .where(eq(schema.videoCalls.id, callId))
    .get();
  if (!row) throw new VideoCallDomainError('Call not found', 404);
  if (row.callerId !== userId && row.calleeId !== userId) {
    throw new VideoCallDomainError('Forbidden', 403);
  }
  if (!ACTIVE_STATUSES.includes(row.status as VideoCallStatus)) return;

  await finalizeCall(db, env, row, 'ended');

  const otherUserId = row.callerId === userId ? row.calleeId : row.callerId;
  await broadcastUserEvent(env, otherUserId, {
    type: 'call_ended',
    payload: { callId, endedByUserId: userId },
  });
}

export class VideoCallDomainError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'VideoCallDomainError';
    this.status = status;
    this.code = code;
  }
}

export async function listVideoCallAllowlist(db: Db): Promise<VideoCallAllowlistEntry[]> {
  const rows = await db
    .select({
      userId: schema.videoCallAllowlist.userId,
      grantedAt: schema.videoCallAllowlist.grantedAt,
      grantedByAdminId: schema.videoCallAllowlist.grantedByAdminId,
      username: schema.users.username,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.videoCallAllowlist)
    .innerJoin(schema.users, eq(schema.videoCallAllowlist.userId, schema.users.id))
    .orderBy(desc(schema.videoCallAllowlist.grantedAt))
    .all();

  return rows.map(r => ({
    userId: r.userId,
    username: r.username,
    email: r.email,
    avatarUrl: r.avatarUrl,
    grantedAt: r.grantedAt,
    grantedByAdminId: r.grantedByAdminId,
  }));
}

export async function searchUsersForVideoCallAllowlist(
  db: Db,
  q: string,
  limit = 10,
): Promise<VideoCallAllowlistSearchResult[]> {
  const trimmed = q.trim();
  const usernamePattern = `%${normalizeUsername(trimmed)}%`;
  const emailPattern = trimmed.includes('@')
    ? `%${normalizeEmail(trimmed)}%`
    : `%${trimmed.toLowerCase()}%`;

  const rows = await db
    .select({
      userId: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
      allowlistUserId: schema.videoCallAllowlist.userId,
    })
    .from(schema.users)
    .leftJoin(
      schema.videoCallAllowlist,
      eq(schema.videoCallAllowlist.userId, schema.users.id),
    )
    .where(
      and(
        isNull(schema.users.deletedAt),
        or(
          like(schema.users.username, usernamePattern),
          like(schema.users.email, emailPattern),
        ),
      ),
    )
    .orderBy(asc(schema.users.username))
    .limit(limit)
    .all();

  return rows.map(r => ({
    userId: r.userId,
    username: r.username,
    email: r.email,
    avatarUrl: r.avatarUrl,
    alreadyAllowlisted: r.allowlistUserId != null,
  }));
}

export async function addUserToVideoCallAllowlist(
  db: Db,
  adminId: number,
  input: { identifier?: string; userId?: number },
): Promise<VideoCallAllowlistEntry> {
  let user: typeof schema.users.$inferSelect | undefined;

  if (input.userId) {
    user = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, input.userId), isNull(schema.users.deletedAt)))
      .get();
  } else if (input.identifier) {
    const trimmed = input.identifier.trim();
    const isEmail = trimmed.includes('@');
    user = isEmail
      ? await db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.email, normalizeEmail(trimmed)), isNull(schema.users.deletedAt)))
        .get()
      : await db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.username, normalizeUsername(trimmed)), isNull(schema.users.deletedAt)))
        .get();
  }

  if (!user) {
    throw new VideoCallDomainError('User not found', 404);
  }

  await db
    .insert(schema.videoCallAllowlist)
    .values({
      userId: user.id,
      grantedByAdminId: adminId,
      grantedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();

  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    grantedAt: new Date().toISOString(),
    grantedByAdminId: adminId,
  };
}

export async function removeUserFromVideoCallAllowlist(
  db: Db,
  userId: number,
): Promise<void> {
  await db
    .delete(schema.videoCallAllowlist)
    .where(eq(schema.videoCallAllowlist.userId, userId))
    .run();
}
