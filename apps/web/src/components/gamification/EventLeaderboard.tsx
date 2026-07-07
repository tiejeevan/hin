import { useEffect, useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';
import type { EventLeaderboard as EventLeaderboardData } from '@hin/types';
import { API_URL } from '../../config';

interface EventLeaderboardProps {
  eventId: number;
  token: string | null;
}

export function EventLeaderboard({ eventId, token }: EventLeaderboardProps) {
  const [data, setData] = useState<EventLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${API_URL}/api/events/${eventId}/leaderboard`, { headers });
        if (!res.ok) throw new Error('Failed to load leaderboard');
        const json = await res.json() as EventLeaderboardData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [eventId, token]);

  if (loading) {
    return (
      <div className="flex justify-center py-8 text-text-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-red-400 text-center py-4">{error ?? 'No data'}</p>;
  }

  return (
    <div className="space-y-3">
      {data.myRank !== null && (
        <div className="rounded-lg bg-accent/10 border border-accent/20 px-3 py-2 text-sm">
          Your rank: <strong>#{data.myRank}</strong>
          {data.myScore !== null && <span className="text-text-muted"> · {data.myScore} pts</span>}
        </div>
      )}
      {data.entries.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-4">No participants yet.</p>
      ) : (
        <ol className="space-y-1">
          {data.entries.map((entry) => (
            <li
              key={entry.userId}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-primary/40"
            >
              <span className={`w-7 text-center font-bold text-sm ${
                entry.rank <= 3 ? 'text-amber-500' : 'text-text-muted'
              }`}>
                {entry.rank <= 3 ? <Trophy className="w-4 h-4 inline" /> : `#${entry.rank}`}
              </span>
              <span className="flex-1 truncate text-text-primary">{entry.username}</span>
              <span className="text-sm font-medium text-text-secondary">{entry.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
