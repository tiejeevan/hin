const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function loginAdminViaApi(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '087425' }),
  });
  if (!res.ok) throw new Error(`Admin login failed: ${await res.text()}`);
  const data = await res.json();
  return data.token;
}

export async function setGamificationEnabledViaApi(
  adminToken: string,
  enabled: boolean,
): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/admin/gamification/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ gamificationEnabled: enabled }),
  });
  return res.ok;
}

export async function getGamificationSettingsViaApi(adminToken: string) {
  const res = await fetch(`${API_URL}/api/admin/gamification/settings`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error(`Settings failed: ${await res.text()}`);
  return res.json() as Promise<{ gamificationEnabled: boolean }>;
}

export async function createBadgeViaApi(
  adminToken: string,
  payload: {
    name: string;
    description: string;
    metricKey: string;
    threshold: number;
  },
) {
  const res = await fetch(`${API_URL}/api/admin/gamification/badges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ ...payload, operator: '>=' }),
  });
  if (!res.ok) throw new Error(`Create badge failed: ${await res.text()}`);
  return res.json() as Promise<{ id: number; name: string }>;
}

export async function sessionTickViaApi(token: string, minutes = 5) {
  const res = await fetch(`${API_URL}/api/me/session-tick`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ minutes }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function getAdminUserGamificationViaApi(adminToken: string, userId: number) {
  const res = await fetch(`${API_URL}/api/admin/gamification/users/${userId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function createEventViaApi(
  adminToken: string,
  payload: {
    name: string;
    startsAt: string;
    endsAt: string;
    status: 'active';
    requiresOptIn: boolean;
    rules: Array<{
      metricKey: string;
      winType: string;
      config: Record<string, unknown>;
    }>;
  },
) {
  const res = await fetch(`${API_URL}/api/admin/gamification/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create event failed: ${await res.text()}`);
  return res.json() as Promise<{ id: number; name: string }>;
}

export async function updateEventViaApi(
  adminToken: string,
  eventId: number,
  patch: {
    endsAt?: string;
    status?: 'draft' | 'active' | 'ended';
  },
) {
  const res = await fetch(`${API_URL}/api/admin/gamification/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update event failed: ${await res.text()}`);
  return res.json();
}

export async function getAdminEventViaApi(adminToken: string, eventId: number) {
  const res = await fetch(`${API_URL}/api/admin/gamification/events`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error(`List events failed: ${await res.text()}`);
  const data = await res.json() as { events: Array<{ id: number; status: string; name: string }> };
  return data.events.find(e => e.id === eventId) ?? null;
}

export async function getActiveEventsViaApi(token: string) {
  const res = await fetch(`${API_URL}/api/events/active`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Active events failed: ${await res.text()}`);
  return res.json() as Promise<{ events: Array<{ id: number }> }>;
}

export async function countEventWinsViaD1(eventId: number): Promise<number> {
  const { execSync } = await import('node:child_process');
  const repoRoot = process.cwd().includes('e2e')
    ? `${process.cwd()}/..`
    : process.cwd();
  const out = execSync(
    `cd "${repoRoot}/apps/api" && npx wrangler d1 execute hin-d1 --local -c wrangler.toml --command "SELECT COUNT(*) AS n FROM event_wins WHERE event_id=${eventId};"`,
    { encoding: 'utf8' },
  );
  const match = out.match(/"n":\s*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function joinEventViaApi(token: string, eventId: number) {
  const res = await fetch(`${API_URL}/api/events/${eventId}/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export async function getMeGamificationViaApi(token: string) {
  const res = await fetch(`${API_URL}/api/me/gamification`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gamification failed: ${await res.text()}`);
  return res.json();
}

export async function bootstrapViaApi(token: string) {
  const res = await fetch(`${API_URL}/api/me/bootstrap`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Bootstrap failed: ${await res.text()}`);
  return res.json();
}
