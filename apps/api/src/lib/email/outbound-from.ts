import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import { getSystemSettings } from '../system-settings';

type Db = ReturnType<typeof drizzle<typeof schema>>;
import { DEFAULT_OUTBOUND_FROM_EMAIL } from '@hin/types';

/** Resolve the outbound From address from admin settings (falls back to default). */
export async function getOutboundFromEmail(db: Db): Promise<string> {
  const settings = await getSystemSettings(db);
  return settings.outboundFromEmail || DEFAULT_OUTBOUND_FROM_EMAIL;
}
