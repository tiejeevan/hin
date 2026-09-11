import { useCallback, useEffect, useRef } from 'react';

type RingtoneKind = 'incoming' | 'outgoing' | null;

const GAIN = 0.08;
const FADE_MS = 180;

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedContext) sharedContext = new Ctx();
  return sharedContext;
}

export function unlockCallAudio(): void {
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') void ctx.resume();
}

function playTone(
  ctx: AudioContext,
  dest: GainNode,
  freq: number,
  start: number,
  duration: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(GAIN, start + 0.04);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function schedulePattern(
  ctx: AudioContext,
  master: GainNode,
  kind: 'incoming' | 'outgoing',
  startAt: number,
): number {
  if (kind === 'incoming') {
    playTone(ctx, master, 440, startAt, 0.35);
    playTone(ctx, master, 523, startAt + 0.38, 0.35);
    playTone(ctx, master, 440, startAt + 0.82, 0.35);
    return 3.2;
  }
  playTone(ctx, master, 392, startAt, 0.55);
  playTone(ctx, master, 392, startAt + 0.72, 0.45);
  return 2.4;
}

export function useCallRingtone(activeKind: RingtoneKind) {
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<RingtoneKind>(null);

  const stop = useCallback((fade = true) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const master = masterRef.current;
    const ctx = getAudioContext();
    if (master && ctx) {
      const now = ctx.currentTime;
      if (fade) {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + FADE_MS / 1000);
        const node = master;
        setTimeout(() => {
          try {
            node.disconnect();
          } catch {
            /* already disconnected */
          }
        }, FADE_MS + 20);
      } else {
        try {
          master.disconnect();
        } catch {
          /* ignore */
        }
      }
    }
    masterRef.current = null;
    activeRef.current = null;
  }, []);

  const start = useCallback((kind: 'incoming' | 'outgoing') => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    stop(false);
    activeRef.current = kind;

    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    masterRef.current = master;

    const loop = () => {
      if (activeRef.current !== kind) return;
      const interval = schedulePattern(ctx, master, kind, ctx.currentTime + 0.02);
      timerRef.current = setTimeout(loop, interval * 1000);
    };
    loop();
  }, [stop]);

  useEffect(() => {
    if (activeKind === 'incoming' || activeKind === 'outgoing') {
      start(activeKind);
    } else {
      stop();
    }
    return () => stop();
  }, [activeKind, start, stop]);

  return { unlockCallAudio, stopRingtone: stop };
}
