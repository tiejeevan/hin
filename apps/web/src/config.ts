const origin = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : 'http://localhost:5173';
export const API_URL = import.meta.env.VITE_API_URL || origin;
export const WS_URL = import.meta.env.VITE_WS_URL || origin.replace(/^http/, 'ws') + '/ws';
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
