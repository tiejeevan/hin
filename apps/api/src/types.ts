export interface Env {
  DB: D1Database;
  REALTIME_DO: DurableObjectNamespace;
  MEDIA: R2Bucket;
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
}
