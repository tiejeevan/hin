import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import { CreateReportSchema } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { createReport } from '../lib/reports';

const reports = new Hono<{ Bindings: Env }>();

reports.post('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateReportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const result = await createReport(db, authUser.id, {
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    reason: parsed.data.reason,
    details: parsed.data.details,
  });

  if (!result.ok) {
    return c.json({ error: result.error }, result.code as 400 | 404 | 409);
  }

  return c.json({ success: true, report: result.report });
});

export default reports;
