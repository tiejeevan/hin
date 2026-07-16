import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import mediaRoutes from './routes/media';
import postsRoutes from './routes/posts';
import commentsRoutes from './routes/comments';
import messagesRoutes from './routes/messages';
import notificationsRoutes from './routes/notifications';
import adminRoutes from './routes/admin';
import followsRoutes from './routes/follows';
import blocksRoutes from './routes/blocks';
import mutesRoutes from './routes/mutes';
import reportsRoutes from './routes/reports';
import settingsRoutes from './routes/settings';
import meRoutes from './routes/me';
import hashtagsRoutes from './routes/hashtags';
import searchRoutes from './routes/search';
import adminGamificationRoutes from './routes/admin-gamification';
import eventsRoutes from './routes/events';
import auditLogsRoutes from './routes/audit-logs';
import olabidRoutes from './routes/olabid';
import itemCommentsRoutes from './routes/item-comments';
import linkPreviewRoutes from './routes/link-preview';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Response sanitization: Strip sensitive headers from all responses
app.use('*', async (c, next) => {
  await next();
  
  // Skip sanitization for WebSocket upgrades and other special responses
  if (!c.res || c.res.status === 101 || c.res.webSocket) {
    return;
  }
  
  const sensitiveHeaders = [
    'x-api-key',
    'x-client-version',
    'authorization',
    'x-auth-token',
    'cookie',
    'set-cookie',
  ];
  
  const headers = new Headers(c.res.headers);
  let hasChanges = false;
  
  sensitiveHeaders.forEach(header => {
    if (headers.has(header)) {
      headers.delete(header);
      hasChanges = true;
    }
  });
  
  // Only create a new Response if we actually removed headers
  if (hasChanges) {
    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  }
});

// Rewrite absolute media URLs in responses to match the current request's origin dynamically
app.use('*', async (c, next) => {
  await next();
  const contentType = c.res.headers.get('content-type');
  if (
    c.res.status !== 204 &&
    c.res.status !== 304 &&
    contentType &&
    contentType.includes('application/json')
  ) {
    const origin = new URL(c.req.url).origin;
    const bodyText = await c.res.text();
    const modifiedBodyText = bodyText.replace(/https?:\/\/[^\/]+\/api\/media\//g, `${origin}/api/media/`);
    const headers = new Headers(c.res.headers);
    headers.delete('content-length');
    c.res = new Response(modifiedBodyText, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  }
});

// Basic test endpoint
app.get('/', (c) => c.text('Hin API is running!'));

app.route('/api/auth', authRoutes);
app.route('/api/users', usersRoutes);
app.route('/', mediaRoutes);
app.route('/api/posts', postsRoutes);
app.route('/api/comments', commentsRoutes);
app.route('/api/messages', messagesRoutes);
app.route('/api/notifications', notificationsRoutes);
app.route('/api/follows', followsRoutes);
app.route('/api/blocks', blocksRoutes);
app.route('/api/mutes', mutesRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/me', meRoutes);
app.route('/api/hashtags', hashtagsRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/admin/gamification', adminGamificationRoutes);
app.route('/api/events', eventsRoutes);
app.route('/api/olabid', olabidRoutes);
app.route('/api/item-comments', itemCommentsRoutes);
app.route('/api/link-preview', linkPreviewRoutes);
// Audit logs: admin full view at /api/admin/audit-logs, user partial at /api/me/audit-logs
app.route('/api', auditLogsRoutes);

// WebSocket entrypoint -> route to Durable Object
app.get('/ws', async (c) => {
  const doId = c.env.REALTIME_DO.idFromName('global');
  const doStub = c.env.REALTIME_DO.get(doId);
  return doStub.fetch(c.req.raw);
});

export default app;
export { RealtimeDO } from './durable-objects/realtime';
