import { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { CallType, VideoCallPeer } from '@hin/types';

const ActiveCallRoom = lazy(() => import('./ActiveCallRoom'));

export function prefetchActiveCallRoom() {
  void import('./ActiveCallRoom');
}

interface ActiveCallPanelProps {
  authToken: string;
  callType: CallType;
  remotePeer: VideoCallPeer;
  onHangUp: () => void;
}

export function ActiveCallPanel({ authToken, callType, remotePeer, onHangUp }: ActiveCallPanelProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const subtitle = callType === 'audio' ? 'Voice call' : 'Video call';

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-zinc-950 text-white animate-fade-in">
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/10 shrink-0">
        <div>
          <p className="text-sm font-semibold">{remotePeer.username}</p>
          <p className="text-[11px] text-white/60">{subtitle}</p>
        </div>
      </div>

      <Suspense
        fallback={(
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          </div>
        )}
      >
        <ActiveCallRoom
          authToken={authToken}
          callType={callType}
          remotePeer={remotePeer}
          onHangUp={onHangUp}
        />
      </Suspense>
    </div>
  );
}
