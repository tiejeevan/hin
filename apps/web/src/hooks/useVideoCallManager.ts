import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallType, ServerMessage, VideoCallPeer, VideoCallSession } from '@hin/types';
import { requestCallMediaPermissions } from '../lib/callMediaPermissions';
import {
  acceptCall,
  cancelCall,
  declineCall,
  endCall,
  fetchActiveCall,
  inviteCall,
} from '../lib/videoCallApi';
import { unlockCallAudio, useCallRingtone } from './useCallRingtone';

export type VideoCallUiPhase =
  | 'idle'
  | 'outgoing_ring'
  | 'incoming_ring'
  | 'connecting'
  | 'in_call'
  | 'ended';

export interface VideoCallUiState {
  phase: VideoCallUiPhase;
  call: VideoCallSession | null;
  authToken: string | null;
  remotePeer: VideoCallPeer | null;
  callType: CallType | null;
  endReason: string | null;
  error: string | null;
}

const RING_TIMEOUT_MS = 45_000;

const INITIAL_STATE: VideoCallUiState = {
  phase: 'idle',
  call: null,
  authToken: null,
  remotePeer: null,
  callType: null,
  endReason: null,
  error: null,
};

export function useVideoCallManager(token: string | null, currentUserId: number | undefined) {
  const [state, setState] = useState<VideoCallUiState>(INITIAL_STATE);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const ringtoneKind = state.phase === 'incoming_ring'
    ? 'incoming'
    : state.phase === 'outgoing_ring'
      ? 'outgoing'
      : null;
  useCallRingtone(ringtoneKind);

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }, []);

  const clearEndTimer = useCallback(() => {
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
  }, []);

  const resetToIdle = useCallback(() => {
    clearRingTimer();
    clearEndTimer();
    setState(INITIAL_STATE);
  }, [clearEndTimer, clearRingTimer]);

  const showEnded = useCallback((reason: string) => {
    clearRingTimer();
    setState(prev => ({
      ...prev,
      phase: 'ended',
      authToken: null,
      endReason: reason,
      error: null,
    }));
    clearEndTimer();
    endTimerRef.current = setTimeout(() => {
      setState(INITIAL_STATE);
    }, 2500);
  }, [clearEndTimer, clearRingTimer]);

  const endIfMatchingCall = useCallback((callId: number, reason: string) => {
    setState(prev => {
      if (prev.call?.callId !== callId) return prev;
      if (prev.phase === 'idle' || prev.phase === 'ended') return prev;
      clearRingTimer();
      clearEndTimer();
      endTimerRef.current = setTimeout(() => {
        setState(INITIAL_STATE);
      }, 2500);
      return {
        ...prev,
        phase: 'ended',
        authToken: null,
        endReason: reason,
        error: null,
      };
    });
  }, [clearEndTimer, clearRingTimer]);

  const startRingTimeout = useCallback((callId: number, asCaller: boolean) => {
    clearRingTimer();
    ringTimerRef.current = setTimeout(() => {
      const auth = tokenRef.current;
      if (!auth) return;
      void cancelCall(auth, callId, 'missed').finally(() => {
        showEnded(asCaller ? 'No answer' : 'Missed call');
      });
    }, RING_TIMEOUT_MS);
  }, [clearRingTimer, showEnded]);

  const beginInCall = useCallback((
    call: VideoCallSession,
    remotePeer: VideoCallPeer,
    callType: CallType,
  ) => {
    clearRingTimer();
    if (!call.authToken) {
      setState(prev => ({ ...prev, phase: 'ended', error: 'Missing call token', authToken: null }));
      return;
    }
    setState({
      phase: 'in_call',
      call,
      authToken: call.authToken,
      remotePeer,
      callType,
      endReason: null,
      error: null,
    });
  }, [clearRingTimer]);

  const startCall = useCallback(async (
    calleeUserId: number,
    calleeUsername: string,
    callType: CallType,
  ): Promise<string | null> => {
    const auth = tokenRef.current;
    if (!auth || !currentUserId) return 'Not signed in';

    unlockCallAudio();

    const perm = await requestCallMediaPermissions(callType);
    if (!perm.ok) {
      setState(prev => ({ ...prev, error: perm.message }));
      return perm.message;
    }

    setState({
      phase: 'outgoing_ring',
      call: null,
      authToken: null,
      remotePeer: { userId: calleeUserId, username: calleeUsername },
      callType,
      endReason: null,
      error: null,
    });
    try {
      const call = await inviteCall(auth, calleeUserId, callType);
      setState(prev => ({
        ...prev,
        call,
        callType: call.callType,
        authToken: call.authToken ?? null,
      }));
      startRingTimeout(call.callId, true);
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to start call';
      setState(prev => ({ ...prev, phase: 'idle', error: message, remotePeer: null, callType: null }));
      return message;
    }
  }, [currentUserId, startRingTimeout]);

  const acceptIncoming = useCallback(async () => {
    const auth = tokenRef.current;
    const callId = state.call?.callId;
    const callType = state.callType ?? state.call?.callType ?? 'video';
    if (!auth || !callId) return;

    unlockCallAudio();
    clearRingTimer();
    setState(prev => ({ ...prev, phase: 'connecting', error: null }));

    const perm = await requestCallMediaPermissions(callType);
    if (!perm.ok) {
      showEnded(perm.message);
      return;
    }

    try {
      const call = await acceptCall(auth, callId);
      const remotePeer = call.caller;
      const resolvedCallType = call.callType ?? callType;
      beginInCall(call, remotePeer, resolvedCallType);
    } catch (e) {
      showEnded(e instanceof Error ? e.message : 'Failed to join call');
    }
  }, [beginInCall, clearRingTimer, showEnded, state.call?.callId, state.call?.callType, state.callType]);

  const declineIncoming = useCallback(async () => {
    const auth = tokenRef.current;
    const callId = state.call?.callId;
    if (!auth || !callId) {
      resetToIdle();
      return;
    }
    clearRingTimer();
    try {
      await declineCall(auth, callId);
    } finally {
      resetToIdle();
    }
  }, [clearRingTimer, resetToIdle, state.call?.callId]);

  const cancelOutgoing = useCallback(async () => {
    const auth = tokenRef.current;
    const callId = state.call?.callId;
    clearRingTimer();
    if (auth && callId) {
      try {
        await cancelCall(auth, callId, 'cancelled');
      } catch {
        // ignore — local UI should still reset
      }
    }
    resetToIdle();
  }, [clearRingTimer, resetToIdle, state.call?.callId]);

  const hangUp = useCallback(async () => {
    const auth = tokenRef.current;
    const callId = state.call?.callId;
    if (auth && callId) {
      try {
        await endCall(auth, callId);
      } catch {
        // still leave locally
      }
    }
    resetToIdle();
  }, [resetToIdle, state.call?.callId]);

  const handleWsMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'call_invite': {
        const { callId, caller, callType, createdAt } = message.payload;
        if (Date.now() - Date.parse(createdAt) > RING_TIMEOUT_MS) return;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
        setState({
          phase: 'incoming_ring',
          call: {
            callId,
            meetingId: '',
            status: 'ringing',
            callType,
            caller,
            callee: { userId: currentUserId ?? 0, username: '' },
            createdAt,
          },
          authToken: null,
          remotePeer: caller,
          callType,
          endReason: null,
          error: null,
        });
        startRingTimeout(callId, false);
        break;
      }
      case 'call_accepted': {
        const { callId, callee, callType } = message.payload;
        clearRingTimer();
        setState(prev => {
          if (prev.phase !== 'outgoing_ring' || prev.call?.callId !== callId || !prev.call.authToken) {
            return prev;
          }
          return {
            phase: 'in_call',
            call: prev.call,
            authToken: prev.call.authToken,
            remotePeer: callee,
            callType: callType ?? prev.callType ?? prev.call.callType,
            endReason: null,
            error: null,
          };
        });
        break;
      }
      case 'call_declined': {
        endIfMatchingCall(message.payload.callId, 'Call declined');
        break;
      }
      case 'call_cancelled': {
        const { callId, reason } = message.payload;
        endIfMatchingCall(callId, reason === 'missed' ? 'Missed call' : 'Call cancelled');
        break;
      }
      case 'call_ended': {
        endIfMatchingCall(message.payload.callId, 'Call ended');
        break;
      }
      case 'call_busy': {
        if (state.phase === 'outgoing_ring' && state.call?.callId === message.payload.callId) {
          showEnded('User is busy');
        }
        break;
      }
      default:
        break;
    }
  }, [clearRingTimer, currentUserId, endIfMatchingCall, showEnded, startRingTimeout, state.call?.callId, state.phase]);

  useEffect(() => {
    if (!token || !currentUserId) return;
    let cancelled = false;
    void fetchActiveCall(token).then(call => {
      if (cancelled || !call) return;
      if (call.status === 'ringing' && call.caller.userId === currentUserId && call.authToken) {
        setState({
          phase: 'outgoing_ring',
          call,
          authToken: call.authToken,
          remotePeer: call.callee,
          callType: call.callType,
          endReason: null,
          error: null,
        });
        startRingTimeout(call.callId, true);
      } else if (call.status === 'ringing' && call.callee.userId === currentUserId) {
        setState({
          phase: 'incoming_ring',
          call,
          authToken: null,
          remotePeer: call.caller,
          callType: call.callType,
          endReason: null,
          error: null,
        });
        startRingTimeout(call.callId, false);
      } else if (call.status === 'accepted' && call.authToken) {
        const remotePeer = call.caller.userId === currentUserId ? call.callee : call.caller;
        beginInCall(call, remotePeer, call.callType);
      }
    });
    return () => { cancelled = true; };
  }, [beginInCall, currentUserId, startRingTimeout, token]);

  useEffect(() => () => {
    clearRingTimer();
    clearEndTimer();
  }, [clearEndTimer, clearRingTimer]);

  return {
    state,
    startCall,
    acceptIncoming,
    declineIncoming,
    cancelOutgoing,
    hangUp,
    handleWsMessage,
    resetToIdle,
  };
}
