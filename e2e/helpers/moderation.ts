const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

function e2eSyntheticIp(): string {
  const a = Math.floor(Math.random() * 200) + 1;
  const b = Math.floor(Math.random() * 200) + 1;
  return `10.254.${a}.${b}`;
}

export async function loginAdminViaApi(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': e2eSyntheticIp(),
    },
    body: JSON.stringify({
      username: 'admin',
      password: '087425',
      clientLocalTime: new Date().toISOString(),
      sessionId: `e2e-admin-${Date.now()}`,
    }),
  });
  if (!res.ok) throw new Error(`Admin login failed: ${await res.text()}`);
  const data = await res.json();
  return data.token as string;
}

export async function loginViaApi(username: string, password: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': e2eSyntheticIp(),
    },
    body: JSON.stringify({
      username,
      password,
      clientLocalTime: new Date().toISOString(),
      sessionId: `e2e-${Date.now()}`,
    }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function bootstrapViaApi(token: string) {
  const res = await fetch(`${API_URL}/api/me/bootstrap`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function promoteModeratorViaApi(
  adminToken: string,
  userId: number,
  permissionKeys: string[],
) {
  const res = await fetch(`${API_URL}/api/admin/moderators`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ userId, permissionKeys }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function removeModeratorViaApi(adminToken: string, userId: number) {
  const res = await fetch(`${API_URL}/api/admin/moderators/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function moderationDashboardViaApi(token: string) {
  const res = await fetch(`${API_URL}/api/moderation/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function hidePostViaApi(token: string, postId: number, reason: string) {
  const res = await fetch(`${API_URL}/api/moderation/posts/${postId}/hide`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function restrictUserViaApi(token: string, userId: number, reason: string) {
  const res = await fetch(`${API_URL}/api/moderation/users/${userId}/restrict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function suspendUserViaApi(token: string, userId: number, reason: string) {
  const res = await fetch(`${API_URL}/api/moderation/users/${userId}/suspend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function unsuspendUserViaApi(token: string, userId: number) {
  const res = await fetch(`${API_URL}/api/moderation/users/${userId}/unsuspend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function reviewReportExtendedViaApi(
  token: string,
  reportId: number,
  action: string,
  reason?: string,
) {
  const res = await fetch(`${API_URL}/api/admin/reports/${reportId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function createPostRawViaApi(token: string, content: string) {
  const res = await fetch(`${API_URL}/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
