import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { TURNSTILE_SITE_KEY } from '../../config';

export interface TurnstileWidgetHandle {
  reset: () => void;
}

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onExpire: () => void;
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
  if (existing) {
    turnstileScriptPromise = new Promise((resolve) => {
      if (window.turnstile) resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
    });
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken, onExpire }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    const onExpireRef = useRef(onExpire);
    onTokenRef.current = onToken;
    onExpireRef.current = onExpire;

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
      },
    }));

    useEffect(() => {
      if (!TURNSTILE_SITE_KEY) return;

      let cancelled = false;

      const mountWidget = async () => {
        await loadTurnstileScript();
        if (cancelled) return;

        const container = containerRef.current;
        const turnstile = window.turnstile;
        if (!container || !turnstile) return;

        widgetIdRef.current = turnstile.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onExpireRef.current(),
          'error-callback': () => onExpireRef.current(),
        });
      };

      mountWidget().catch(() => {});

      return () => {
        cancelled = true;
        if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      };
    }, []);

    if (!TURNSTILE_SITE_KEY) return null;

    return <div ref={containerRef} />;
  },
);
