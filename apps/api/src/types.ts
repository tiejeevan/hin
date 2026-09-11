export interface Env {
  DB: D1Database;
  REALTIME_DO: DurableObjectNamespace;
  MEDIA: R2Bucket;
  /** Public web origin, e.g. https://hingot.com */
  SITE_URL?: string;
  /** Public API origin for absolute media URLs; defaults to SITE_URL */
  API_PUBLIC_URL?: string;
  /** Google Search Console verification token */
  GOOGLE_SITE_VERIFICATION?: string;
  GOOGLE_CLIENT_ID?: string;
  TURNSTILE_SECRET_KEY?: string;
  OLABID_API_KEY?: string;
  OTP_PEPPER?: string;
  /** Oracle Cloud Email Delivery (SMTP — primary). */
  OCI_SMTP_HOST?: string;
  OCI_SMTP_PORT?: string;
  OCI_SMTP_USERNAME?: string;
  OCI_SMTP_PASSWORD?: string;
  /** Oracle HTTPS submit API (optional future path). */
  OCI_TENANCY_OCID?: string;
  OCI_USER_OCID?: string;
  OCI_FINGERPRINT?: string;
  OCI_PRIVATE_KEY?: string;
  OCI_COMPARTMENT_OCID?: string;
  OCI_EMAIL_SUBMIT_ENDPOINT?: string;
  /** Prefer Worker secret in production; local .dev.vars may set this. */
  JWT_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** mailto:… or https://… subject for VAPID JWT */
  VAPID_SUBJECT?: string;
  /** Cloudflare RealtimeKit — create via dashboard, set via wrangler secret. */
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  REALTIMEKIT_APP_ID?: string;
  /** Preset name configured in RealtimeKit dashboard (both peers need publish/subscribe). */
  REALTIMEKIT_DM_PRESET?: string;
  /** Audio-only preset for voice calls (no video publish/subscribe). */
  REALTIMEKIT_AUDIO_PRESET?: string;
}
