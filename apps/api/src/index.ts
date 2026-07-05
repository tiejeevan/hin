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

const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

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
app.route('/api/admin', adminRoutes);

// WebSocket entrypoint -> route to Durable Object
app.get('/ws', async (c) => {
  const doId = c.env.REALTIME_DO.idFromName('global');
  const doStub = c.env.REALTIME_DO.get(doId);
  return doStub.fetch(c.req.raw);
});

export default app;
export { RealtimeDO } from './durable-objects/realtime';
