import { useEffect, useRef } from 'react';
import { API_URL } from '../config';

const TICK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Heartbeat while tab is visible — increments total_session_minutes via POST /api/me/session-tick.
 */
export function useSessionTick(token: string | null, enabled: boolean) {
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!token || !enabled) return;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const t = tokenRef.current;
      if (!t) return;
      try {
        await fetch(`${API_URL}/api/me/session-tick`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${t}`,
          },
          body: JSON.stringify({ minutes: 5 }),
        });
      } catch {
        // Non-critical — next interval retries
      }
    };

    const interval = window.setInterval(() => void tick(), TICK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [token, enabled]);
}
