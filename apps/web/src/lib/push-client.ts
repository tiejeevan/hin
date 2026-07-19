import { API_URL } from '../config';

export type PushPermissionState = NotificationPermission | 'unsupported';

export function getPushPermission(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function getVapidPublicKey(): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/push/vapid-public-key`);
  if (!res.ok) return null;
  const data = (await res.json()) as { publicKey?: string };
  return data.publicKey ?? null;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js');
}

export async function registerPushSubscription(
  token: string,
): Promise<{ subscribed: boolean; permission: PushPermissionState; error?: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { subscribed: false, permission: 'unsupported', error: 'Push not supported' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { subscribed: false, permission, error: 'Notification permission not granted' };
  }

  const publicKey = await getVapidPublicKey();
  if (!publicKey) {
    return { subscribed: false, permission, error: 'Push is not configured on the server' };
  }

  const registration = await ensureServiceWorker();
  if (!registration) {
    return { subscribed: false, permission, error: 'Service worker unavailable' };
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { subscribed: false, permission, error: 'Invalid subscription from browser' };
  }

  const res = await fetch(`${API_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent.slice(0, 512),
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return {
      subscribed: false,
      permission,
      error: (data as { error?: string }).error || 'Failed to save subscription',
    };
  }

  return { subscribed: true, permission };
}

export async function unregisterPushSubscription(token: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  try {
    await fetch(`${API_URL}/api/push/subscribe`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint }),
    });
  } finally {
    await subscription.unsubscribe().catch(() => undefined);
  }
}
