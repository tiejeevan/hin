import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { subscribeGlobalLoading } from '../../lib/globalLoading';

export function GlobalLoadingOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeGlobalLoading(setVisible), []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-bg-primary/70 pointer-events-auto"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <Loader2 className="h-10 w-10 animate-spin text-indigo-500" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  );
}
