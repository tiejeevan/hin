import { useCallback, useEffect, useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import {
  getPushPermission,
  registerPushSubscription,
  unregisterPushSubscription,
  type PushPermissionState,
} from '../../lib/push-client';

interface PushNotificationSectionProps {
  token: string;
  notifyPushEnabled: boolean;
  onNotifyPushEnabledChange: (enabled: boolean) => void;
}

export function PushNotificationSection({
  token,
  notifyPushEnabled,
  onNotifyPushEnabledChange,
}: PushNotificationSectionProps) {
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  useEffect(() => {
    setPermission(getPushPermission());
  }, []);

  const handleEnable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await registerPushSubscription(token);
      setPermission(result.permission);
      setSubscribed(result.subscribed);
      if (result.subscribed && !notifyPushEnabled) {
        onNotifyPushEnabledChange(true);
      }
      if (!result.subscribed && result.error) {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enable push');
    } finally {
      setBusy(false);
    }
  }, [token, notifyPushEnabled, onNotifyPushEnabledChange]);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await unregisterPushSubscription(token);
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable push');
    } finally {
      setBusy(false);
    }
  }, [token]);

  if (!supported) {
    return (
      <p className="text-xs text-text-muted">
        Push notifications are not supported in this browser.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
          <BellRing className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">Browser push</p>
          <p className="text-xs text-text-muted mt-0.5">
            {permission === 'denied'
              ? 'Permission blocked in browser settings. Enable notifications for this site to continue.'
              : subscribed
                ? 'This device is subscribed for OS alerts when the app is closed.'
                : 'Enable to receive alerts when Hin is not open.'}
          </p>
        </div>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {permission !== 'denied' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void (subscribed ? handleDisable() : handleEnable())}
          className="w-full px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors cursor-pointer min-h-[44px] inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {subscribed ? 'Disable on this device' : 'Enable on this device'}
        </button>
      )}
    </div>
  );
}
