import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type WriteModerationAuditInput = {
  actorId: number | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: number | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
};

export async function writeModerationAuditLog(db: Db, input: WriteModerationAuditInput): Promise<number | null> {
  const [row] = await db
    .insert(schema.moderationAuditLogs)
    .values({
      actorId: input.actorId ?? null,
      actorRole: input.actorRole,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      beforeState: input.beforeState ? JSON.stringify(input.beforeState) : null,
      afterState: input.afterState ? JSON.stringify(input.afterState) : null,
    })
    .returning({ id: schema.moderationAuditLogs.id });
  return row?.id ?? null;
}
