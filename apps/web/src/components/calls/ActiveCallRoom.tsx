import { useEffect, useRef, useState, type RefObject } from 'react';
import RTKClient from '@cloudflare/realtimekit';
import type RTKClientType from '@cloudflare/realtimekit';
import {
  RealtimeKitProvider,
  useRealtimeKitSelector,
} from '@cloudflare/realtimekit-react';
import { Mic, MicOff, PhoneOff, Smartphone, Video, VideoOff, Volume2 } from 'lucide-react';
import type { CallType, VideoCallPeer } from '@hin/types';
import {
  applyAudioRoute,
  type AudioRoute,
  isAudioRouteSupported,
} from '../../lib/callAudioRoute';
import { classifyCallJoinError } from '../../lib/callJoinErrors';
import { UserAvatar } from '../profile/UserAvatar';
import { CallControlButton } from './CallControlButton';

const VIDEO_MEDIA_DEFAULTS = {
  audio: true,
  video: true,
  mediaConfiguration: {
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 24 },
    },
  },
} as const;

const AUDIO_MEDIA_DEFAULTS = {
  audio: true,
  video: false,
} as const;

type MediaDefaults = typeof VIDEO_MEDIA_DEFAULTS | typeof AUDIO_MEDIA_DEFAULTS;

type MeetingSession = {
  promise: Promise<RTKClientType>;
  client: RTKClientType | null;
  refs: number;
  joined: boolean;
  joinPromise: Promise<void> | null;
  mediaDefaults: MediaDefaults;
};

// RealtimeKit rejects concurrent Client.init(); React StrictMode mounts effects twice in dev.
const meetingSessions = new Map<string, MeetingSession>();

function leaveMeetingClient(client: RTKClientType) {
  void client.leave().catch(() => {});
}

function acquireMeeting(authToken: string, mediaDefaults: MediaDefaults): Promise<RTKClientType> {
  let session = meetingSessions.get(authToken);
  if (!session) {
    const promise = RTKClient.init({
      authToken,
      defaults: mediaDefaults,
    })
      .then(client => {
        const active = meetingSessions.get(authToken);
        if (!active) {
          leaveMeetingClient(client);
          return client;
        }
        active.client = client;
        if (active.refs <= 0) {
          meetingSessions.delete(authToken);
          leaveMeetingClient(client);
        }
        return client;
      })
      .catch(err => {
        const active = meetingSessions.get(authToken);
        if (active?.refs === 0) meetingSessions.delete(authToken);
        throw err;
      });

    session = {
      promise,
      client: null,
      refs: 0,
      joined: false,
      joinPromise: null,
      mediaDefaults,
    };
    meetingSessions.set(authToken, session);
  }

  session.refs += 1;
  return session.promise;
}

async function joinMeeting(authToken: string, client: RTKClientType) {
  const session = meetingSessions.get(authToken);
  if (!session || session.joined) return;
  if (session.joinPromise) {
    await session.joinPromise;
    return;
  }

  session.joinPromise = client
    .join()
    .then(() => {
      session.joined = true;
    })
    .finally(() => {
      session.joinPromise = null;
    });

  await session.joinPromise;
}

function releaseMeeting(authToken: string) {
  const session = meetingSessions.get(authToken);
  if (!session) return;

  session.refs -= 1;
  if (session.refs > 0) return;

  if (session.client) {
    meetingSessions.delete(authToken);
    leaveMeetingClient(session.client);
  }
}

function RemotePeerMedia({
  peerId,
  username,
  avatarUrl,
  videoEnabled,
  audioRef,
}: VideoCallPeer & { peerId: string; videoEnabled: boolean; audioRef: RefObject<HTMLAudioElement> }) {
  const peer = useRealtimeKitSelector(m => m.participants.active.get(peerId));
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    if (peer?.audioEnabled && peer.audioTrack) {
      const stream = new MediaStream();
      stream.addTrack(peer.audioTrack);
      audioRef.current.srcObject = stream;
    } else {
      audioRef.current.srcObject = null;
    }
  }, [peer?.audioEnabled, peer?.audioTrack]);

  useEffect(() => {
    if (!videoEnabled || !videoRef.current) return;
    if (peer?.videoEnabled && peer.videoTrack) {
      const stream = new MediaStream();
      stream.addTrack(peer.videoTrack);
      videoRef.current.srcObject = stream;
    } else {
      videoRef.current.srcObject = null;
    }
  }, [peer?.videoEnabled, peer?.videoTrack, videoEnabled]);

  const showVideo = videoEnabled && peer?.videoEnabled;

  return (
    <div className="relative flex-1 min-h-0 bg-zinc-900 rounded-2xl overflow-hidden flex items-center justify-center">
      {videoEnabled && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${showVideo ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      <audio ref={audioRef} autoPlay playsInline />
      {!showVideo && (
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <UserAvatar username={username} avatarUrl={avatarUrl} size="xl" />
          <p className="text-sm text-white/70">{username}</p>
          {!videoEnabled && (
            <div className="flex items-end gap-1 h-6 mt-1">
              {[0, 1, 2, 3, 4].map(i => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-emerald-400/70 animate-bounce-dot"
                  style={{ height: `${8 + (i % 3) * 6}px`, animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LocalPreview() {
  const self = useRealtimeKitSelector(m => m.self);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (self.videoEnabled && self.videoTrack) {
      const stream = new MediaStream();
      stream.addTrack(self.videoTrack);
      videoRef.current.srcObject = stream;
    } else {
      videoRef.current.srcObject = null;
    }
  }, [self.videoEnabled, self.videoTrack]);

  if (!self.videoEnabled) return null;

  return (
    <div className="absolute bottom-24 right-4 w-28 h-40 rounded-xl overflow-hidden border border-white/20 shadow-xl bg-zinc-800 z-10 animate-fade-in">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
    </div>
  );
}

function EnsureVideoEnabled() {
  const self = useRealtimeKitSelector(m => m.self);
  const roomJoined = useRealtimeKitSelector(m => m.self.roomJoined);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!roomJoined || attemptedRef.current || self.videoEnabled) return;
    attemptedRef.current = true;
    void self.enableVideo().catch(() => {});
  }, [roomJoined, self]);

  return null;
}

function CallControls({
  onHangUp,
  showVideoToggle,
  showAudioRouteToggle,
  remoteAudioRef,
}: {
  onHangUp: () => void;
  showVideoToggle: boolean;
  showAudioRouteToggle: boolean;
  remoteAudioRef: RefObject<HTMLAudioElement>;
}) {
  const self = useRealtimeKitSelector(m => m.self);
  const roomJoined = useRealtimeKitSelector(m => m.self.roomJoined);
  const [audioRoute, setAudioRoute] = useState<AudioRoute>('earpiece');
  const [routeSupported] = useState(() => isAudioRouteSupported());

  useEffect(() => {
    if (!roomJoined || !showAudioRouteToggle || !routeSupported) return;
    void applyAudioRoute({
      self: self as Parameters<typeof applyAudioRoute>[0]['self'],
      audioEl: remoteAudioRef.current,
      route: 'earpiece',
    }).then(applied => {
      if (applied) setAudioRoute('earpiece');
    });
  }, [remoteAudioRef, roomJoined, self, showAudioRouteToggle, routeSupported]);

  const toggleAudioRoute = () => {
    const next: AudioRoute = audioRoute === 'earpiece' ? 'speaker' : 'earpiece';
    void applyAudioRoute({
      self: self as Parameters<typeof applyAudioRoute>[0]['self'],
      audioEl: remoteAudioRef.current,
      route: next,
    }).then(applied => {
      if (applied) setAudioRoute(next);
    });
  };

  if (!roomJoined) {
    return (
      <div className="py-6 flex justify-center text-sm text-white/60 animate-fade-in">
        Joining call…
      </div>
    );
  }

  return (
    <div className="py-5 px-4 flex items-center justify-center gap-4 shrink-0">
      <CallControlButton
        variant={self.audioEnabled ? 'neutral' : 'active-negative'}
        icon={self.audioEnabled ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
        onClick={() => (self.audioEnabled ? self.disableAudio() : self.enableAudio())}
        aria-label={self.audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        title={self.audioEnabled ? 'Mute' : 'Unmute'}
      />
      {showAudioRouteToggle && routeSupported && (
        <CallControlButton
          variant={audioRoute === 'speaker' ? 'active-positive' : 'active-route'}
          icon={audioRoute === 'earpiece'
            ? <Volume2 className="h-6 w-6" />
            : <Smartphone className="h-6 w-6" />}
          onClick={toggleAudioRoute}
          aria-label={audioRoute === 'earpiece' ? 'Switch to speaker' : 'Switch to earpiece'}
          title={audioRoute === 'earpiece' ? 'Speaker' : 'Earpiece'}
        />
      )}
      {showVideoToggle && (
        <CallControlButton
          variant={self.videoEnabled ? 'neutral' : 'active-negative'}
          icon={self.videoEnabled ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
          onClick={() => (self.videoEnabled ? self.disableVideo() : self.enableVideo())}
          aria-label={self.videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          title={self.videoEnabled ? 'Camera on' : 'Camera off'}
        />
      )}
      <CallControlButton
        variant="active-negative"
        icon={<PhoneOff className="h-6 w-6" />}
        onClick={onHangUp}
        aria-label="End call"
        title="End call"
      />
    </div>
  );
}

function CallRoomBody({
  remotePeer,
  onHangUp,
  callType,
}: {
  remotePeer: VideoCallPeer;
  onHangUp: () => void;
  callType: CallType;
}) {
  const roomJoined = useRealtimeKitSelector(m => m.self.roomJoined);
  const activeParticipants = useRealtimeKitSelector(m => m.participants.active.toArray());
  const selfId = useRealtimeKitSelector(m => m.self.id);
  const remoteParticipant = activeParticipants.find(p => p.id !== selfId);
  const isVideoCall = callType === 'video';
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  return (
    <>
      {isVideoCall && <EnsureVideoEnabled />}
      <div className="relative flex-1 min-h-0 flex flex-col p-4">
        {remoteParticipant ? (
          <RemotePeerMedia
            peerId={remoteParticipant.id}
            userId={remotePeer.userId}
            username={remotePeer.username}
            avatarUrl={remotePeer.avatarUrl}
            videoEnabled={isVideoCall}
            audioRef={remoteAudioRef}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/70 animate-fade-in">
            <UserAvatar username={remotePeer.username} avatarUrl={remotePeer.avatarUrl} size="xl" />
            <p className="text-sm transition-opacity duration-300">
              {roomJoined ? 'Waiting for peer…' : 'Connecting…'}
            </p>
          </div>
        )}
        {isVideoCall && <LocalPreview />}
      </div>
      <CallControls
        onHangUp={onHangUp}
        showVideoToggle={isVideoCall}
        showAudioRouteToggle
        remoteAudioRef={remoteAudioRef}
      />
    </>
  );
}

export default function ActiveCallRoom({
  authToken,
  callType,
  remotePeer,
  onHangUp,
}: {
  authToken: string;
  callType: CallType;
  remotePeer: VideoCallPeer;
  onHangUp: () => void;
}) {
  const [meeting, setMeeting] = useState<RTKClientType | null>(null);
  const [status, setStatus] = useState<'starting' | 'joining' | 'ready' | 'error'>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mediaDefaults = callType === 'video' ? VIDEO_MEDIA_DEFAULTS : AUDIO_MEDIA_DEFAULTS;

    async function connect() {
      setStatus('starting');
      setErrorMessage(null);

      try {
        const client = await acquireMeeting(authToken, mediaDefaults);
        if (cancelled) return;

        setMeeting(client);
        setStatus('joining');

        await joinMeeting(authToken, client);
        if (cancelled) return;

        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to join call';
        setErrorMessage(message);
        setStatus('error');
        console.error('[video-call] RealtimeKit join failed:', err);
      }
    }

    void connect();

    return () => {
      cancelled = true;
      releaseMeeting(authToken);
      setMeeting(null);
    };
  }, [authToken, callType]);

  if (status === 'error') {
    const errorInfo = classifyCallJoinError(errorMessage ?? 'Unknown error', callType);
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center animate-fade-in">
        <p className="text-sm font-medium text-rose-300">{errorInfo.title}</p>
        <p className="text-xs text-white/60 max-w-sm">{errorInfo.detail}</p>
        <p className="text-[11px] text-white/45 max-w-sm">{errorInfo.hint}</p>
        <CallControlButton
          variant="active-negative"
          size="sm"
          icon={<PhoneOff className="h-4 w-4" />}
          label="End call"
          onClick={onHangUp}
          aria-label="End call"
          className="!h-10 !px-5 !rounded-full text-xs font-semibold"
        />
      </div>
    );
  }

  if (!meeting || status === 'starting') {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-white/60 animate-fade-in">
        Starting call…
      </div>
    );
  }

  return (
    <RealtimeKitProvider value={meeting}>
      <CallRoomBody remotePeer={remotePeer} onHangUp={onHangUp} callType={callType} />
    </RealtimeKitProvider>
  );
}
