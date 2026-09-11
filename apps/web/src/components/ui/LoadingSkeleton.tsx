import { Loader2 } from 'lucide-react';

export function PostCardSkeleton() {
  return (
    <div className="border border-border-custom rounded-2xl p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-bg-secondary shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 bg-bg-secondary rounded" />
          <div className="h-2.5 w-16 bg-bg-secondary rounded" />
        </div>
      </div>
      <div className="h-24 bg-bg-secondary rounded-xl" />
    </div>
  );
}

export function NotificationRowSkeleton() {
  return (
    <div className="px-3 py-3 flex gap-2.5 animate-pulse">
      <div className="h-9 w-9 rounded-full bg-bg-secondary shrink-0" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="h-3 w-full max-w-[200px] bg-bg-secondary rounded" />
        <div className="h-2.5 w-3/4 max-w-[140px] bg-bg-secondary rounded" />
      </div>
    </div>
  );
}

export function ThreadRowSkeleton() {
  return (
    <div className="px-3 py-2.5 flex gap-2.5 animate-pulse border-b border-border-custom/50">
      <div className="h-10 w-10 rounded-full bg-bg-secondary shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 w-24 bg-bg-secondary rounded" />
        <div className="h-2.5 w-full max-w-[180px] bg-bg-secondary rounded" />
      </div>
    </div>
  );
}

export function MessageBubbleSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-4 animate-pulse">
      <div className="flex justify-start">
        <div className="h-8 w-40 bg-bg-secondary rounded-2xl rounded-bl-md" />
      </div>
      <div className="flex justify-end">
        <div className="h-8 w-32 bg-bg-secondary rounded-2xl rounded-br-md" />
      </div>
      <div className="flex justify-start">
        <div className="h-8 w-48 bg-bg-secondary rounded-2xl rounded-bl-md" />
      </div>
    </div>
  );
}

export function PanelRefreshSpinner() {
  return (
    <Loader2
      className="h-3.5 w-3.5 animate-spin text-indigo-400/80 shrink-0"
      aria-hidden
    />
  );
}
