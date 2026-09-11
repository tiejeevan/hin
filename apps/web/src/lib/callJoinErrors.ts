export type CallJoinErrorKind = 'permission' | 'config' | 'network' | 'unknown';

export interface CallJoinErrorInfo {
  title: string;
  detail: string;
  hint: string;
  kind: CallJoinErrorKind;
}

export function classifyCallJoinError(message: string, callType: 'audio' | 'video'): CallJoinErrorInfo {
  const lower = message.toLowerCase();

  if (
    lower.includes('notallowed')
    || lower.includes('permission')
    || lower.includes('denied')
    || lower.includes('microphone')
    || lower.includes('camera')
  ) {
    return {
      kind: 'permission',
      title: 'Microphone or camera access denied',
      detail: message,
      hint: callType === 'video'
        ? 'Allow microphone and camera for this site in your browser settings, then try the call again.'
        : 'Allow microphone access for this site in your browser settings, then try the call again.',
    };
  }

  if (
    lower.includes('not configured')
    || lower.includes('503')
    || lower.includes('token')
    || lower.includes('auth')
    || lower.includes('missing call token')
  ) {
    return {
      kind: 'config',
      title: 'Call service is not ready',
      detail: message,
      hint: 'Video calling may not be configured on the server. Check admin settings and RealtimeKit credentials.',
    };
  }

  if (
    lower.includes('network')
    || lower.includes('fetch')
    || lower.includes('timeout')
    || lower.includes('connection')
  ) {
    return {
      kind: 'network',
      title: 'Connection problem',
      detail: message,
      hint: 'Check your internet connection and try again.',
    };
  }

  return {
    kind: 'unknown',
    title: 'Could not join the call',
    detail: message,
    hint: callType === 'video'
      ? 'Make sure microphone and camera access are allowed, then try again.'
      : 'Make sure microphone access is allowed, then try again.',
  };
}
