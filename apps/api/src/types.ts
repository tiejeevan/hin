export interface Env {
  DB: D1Database;
  REALTIME_DO: DurableObjectNamespace;
  MEDIA: R2Bucket;
  GOOGLE_CLIENT_ID?: string;
}
