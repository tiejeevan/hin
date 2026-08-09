import { Check, CheckCheck, Loader2 } from 'lucide-react';
import type { DeliveryStatus } from '@hin/types';

export function DeliveryTicks({ status }: { status: DeliveryStatus }) {
  if (status === 'sending') {
    return <Loader2 className="h-3 w-3 animate-spin text-text-muted" aria-label="Sending" />;
  }
  if (status === 'failed') {
    return <span className="text-red-400 text-[10px] font-medium">Failed</span>;
  }
  if (status === 'sent') {
    return <Check className="h-3 w-3 text-text-muted" aria-label="Sent" />;
  }
  if (status === 'delivered') {
    return <CheckCheck className="h-3 w-3 text-text-muted" aria-label="Delivered" />;
  }
  return <CheckCheck className="h-3 w-3 text-sky-400" aria-label="Read" />;
}
