import { Phone, PhoneOff, Video } from 'lucide-react';
import type { CallType, VideoCallPeer } from '@hin/types';
import { UserAvatar } from '../profile/UserAvatar';
import { CallControlButton } from './CallControlButton';

interface IncomingCallOverlayProps {
  phase: 'outgoing_ring' | 'incoming_ring' | 'connecting' | 'ended';
  callType: CallType;
  remotePeer: VideoCallPeer | null;
  endReason?: string | null;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}

function callLabel(callType: CallType, isIncoming: boolean, isConnecting: boolean): string {
  if (isConnecting) return 'Connecting…';
  if (isIncoming) {
    return callType === 'audio' ? 'Incoming voice call' : 'Incoming video call';
  }
  return 'Calling…';
}

export function IncomingCallOverlay({
  phase,
  callType,
  remotePeer,
  endReason,
  onAccept,
  onDecline,
  onCancel,
}: IncomingCallOverlayProps) {
  if (!remotePeer && phase !== 'ended') return null;
  if (phase === 'ended' && !endReason) return null;

  const isIncoming = phase === 'incoming_ring';
  const isConnecting = phase === 'connecting';
  const isVoice = callType === 'audio';
  const ModeIcon = isVoice ? Phone : Video;
  const AcceptIcon = isVoice ? Phone : Video;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-sm rounded-2xl border border-border-custom bg-bg-secondary shadow-2xl p-6 space-y-5 transition-all duration-200"
        role="dialog"
        aria-label={isIncoming
          ? (isVoice ? 'Incoming voice call' : 'Incoming video call')
          : (isVoice ? 'Outgoing voice call' : 'Outgoing video call')}
      >
        {phase === 'ended' ? (
          <p className="text-center text-sm text-text-secondary animate-fade-in">{endReason}</p>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="relative animate-pulse-ring rounded-full">
                <UserAvatar
                  username={remotePeer?.username ?? '?'}
                  avatarUrl={remotePeer?.avatarUrl}
                  size="lg"
                />
                <span className={`absolute -bottom-1 -right-1 h-8 w-8 rounded-full flex items-center justify-center border-2 border-bg-secondary ${
                  isVoice ? 'bg-emerald-600' : 'bg-indigo-600'
                }`}>
                  <ModeIcon className="h-4 w-4 text-white" />
                </span>
              </div>
              <div>
                <p className="text-base font-semibold text-text-primary">
                  {remotePeer?.username}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {callLabel(callType, isIncoming, isConnecting)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4">
              {isIncoming ? (
                <>
                  <CallControlButton
                    variant="active-negative"
                    icon={<PhoneOff className="h-6 w-6" />}
                    onClick={onDecline}
                    disabled={isConnecting}
                    aria-label="Decline call"
                  />
                  <CallControlButton
                    variant="active-positive"
                    icon={<AcceptIcon className="h-6 w-6" />}
                    onClick={onAccept}
                    disabled={isConnecting}
                    aria-label="Accept call"
                  />
                </>
              ) : (
                <CallControlButton
                  variant="active-negative"
                  icon={<PhoneOff className="h-5 w-5" />}
                  label="Cancel"
                  onClick={onCancel}
                  disabled={isConnecting}
                  aria-label="Cancel call"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
