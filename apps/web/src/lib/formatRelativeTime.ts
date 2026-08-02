/** Human-friendly relative time for presence "last seen". */
export function formatLastSeen(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'recently';

  const diffSec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `${mins}m ago`;
  }

  const thenDate = new Date(then);
  const nowDate = new Date(nowMs);
  const startOfToday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  if (then >= startOfYesterday && then < startOfToday) {
    return 'yesterday';
  }

  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours}h ago`;
  }

  return thenDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: thenDate.getFullYear() !== nowDate.getFullYear() ? 'numeric' : undefined,
  });
}
