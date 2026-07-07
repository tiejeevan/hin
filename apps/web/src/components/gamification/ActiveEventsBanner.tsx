import { useCallback, useEffect, useState } from 'react';
import { Calendar, ChevronRight, Trophy, X } from 'lucide-react';
import type { PublicEvent } from '@hin/types';
import { API_URL } from '../../config';
import { EventLeaderboard } from './EventLeaderboard';

interface ActiveEventsBannerProps {
  token: string | null;
  onGamificationRefresh?: () => void;
}

export function ActiveEventsBanner({ token, onGamificationRefresh }: ActiveEventsBannerProps) {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [joiningId, setJoiningId] = useState<number | null>(null);

  const authHeaders = token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : undefined;

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/events/active`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json() as { events: PublicEvent[] };
        setEvents(data.events);
      }
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const handleJoin = async (eventId: number) => {
    if (!token) return;
    setJoiningId(eventId);
    try {
      const res = await fetch(`${API_URL}/api/events/${eventId}/join`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (res.ok) {
        await loadEvents();
        onGamificationRefresh?.();
      }
    } finally {
      setJoiningId(null);
    }
  };

  if (loading || events.length === 0) return null;

  return (
    <>
      <div className="mb-4 space-y-2">
        {events.map((event) => (
          <div
            key={event.id}
            className="rounded-xl border border-border-custom bg-bg-secondary/80 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            {event.bannerUrl && (
              <img
                src={event.bannerUrl}
                alt=""
                className="w-full sm:w-20 h-20 object-cover rounded-lg shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Active event</span>
              </div>
              <h3 className="font-semibold text-text-primary truncate">{event.name}</h3>
              {event.description && (
                <p className="text-sm text-text-secondary line-clamp-2 mt-0.5">{event.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!event.joined && event.requiresOptIn && token && (
                <button
                  type="button"
                  onClick={() => void handleJoin(event.id)}
                  disabled={joiningId === event.id}
                  className="px-3 py-1.5 text-sm rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-50"
                >
                  {joiningId === event.id ? 'Joining…' : 'Join'}
                </button>
              )}
              {event.joined && (
                <span className="text-xs text-emerald-500 font-medium">Joined</span>
              )}
              <button
                type="button"
                onClick={() => setSelectedEventId(event.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-border-custom hover:bg-bg-primary/50"
              >
                <Trophy className="w-3.5 h-3.5" />
                Leaderboard
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedEventId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-bg-secondary rounded-xl border border-border-custom w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border-custom">
              <h2 className="font-semibold text-text-primary">Event Leaderboard</h2>
              <button
                type="button"
                onClick={() => setSelectedEventId(null)}
                className="p-1 rounded-lg hover:bg-bg-primary/50"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <EventLeaderboard eventId={selectedEventId} token={token} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
