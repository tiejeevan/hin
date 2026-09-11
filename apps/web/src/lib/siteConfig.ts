function devSiteUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '');
  }
  return (import.meta.env.VITE_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
}

export const SITE_URL = devSiteUrl();

export const SITE_NAME = 'Hin';

export const DEFAULT_OG_IMAGE = `${SITE_URL}/icons/icon-512.png`;

export const SITE_DESCRIPTION = 'Social media and real-time messaging.';

export const GOOGLE_SITE_VERIFICATION = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION || '';
