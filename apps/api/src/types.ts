export interface Env {
  DB: D1Database;
  REALTIME_DO: DurableObjectNamespace;
  MEDIA: R2Bucket;
  GOOGLE_CLIENT_ID?: string;
  TURNSTILE_SECRET_KEY?: string;
  OLABID_API_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  OTP_PEPPER?: string;
  /** Prefer Worker secret in production; local .dev.vars may set this. */
  JWT_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** mailto:… or https://… subject for VAPID JWT */
  VAPID_SUBJECT?: string;
}
