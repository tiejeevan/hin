import { useEffect, useRef } from 'react';
import { GOOGLE_CLIENT_ID } from '../../config';

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void;
  disabled?: boolean;
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

let gsiScriptPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;

  const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi]');
  if (existing) {
    gsiScriptPromise = new Promise((resolve) => {
      if (window.google?.accounts?.id) resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
    });
    return gsiScriptPromise;
  }

  gsiScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
}

export function GoogleSignInButton({ onCredential, disabled }: GoogleSignInButtonProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;

    const mountButton = async () => {
      await loadGsiScript();
      if (cancelled) return;

      const container = overlayRef.current;
      const googleId = window.google?.accounts?.id;
      if (!container || !googleId) return;

      googleId.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => callbackRef.current(response.credential),
      });

      container.innerHTML = '';
      googleId.renderButton(container, {
        theme: 'outline',
        size: 'large',
        width: container.offsetWidth || 320,
        text: 'continue_with',
      });
    };

    mountButton().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div
      className={[
        'group relative w-full min-h-[44px] rounded-xl overflow-hidden',
        disabled ? 'opacity-50 pointer-events-none' : undefined,
      ].filter(Boolean).join(' ')}
    >
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 rounded-xl border border-border-custom bg-bg-primary px-4 py-3 text-sm font-semibold text-text-primary shadow-sm transition-all duration-200 group-hover:border-indigo-500/40 group-hover:bg-bg-tertiary/60 group-active:scale-[0.99]"
        aria-hidden="true"
      >
        <GoogleIcon />
        <span>Continue with Google</span>
      </div>

      <div
        ref={overlayRef}
        className="google-signin-overlay absolute inset-0 z-10 opacity-[0.01] cursor-pointer"
        aria-label="Continue with Google"
      />
    </div>
  );
}
