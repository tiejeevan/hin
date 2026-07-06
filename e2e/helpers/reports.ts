const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function getProfileByUsernameViaApi(token: string | null, username: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/users/username/${encodeURIComponent(username)}`, { headers });
  return { status: res.status, data: res.ok ? await res.json() : await res.json().catch(() => ({})) };
}

export async function createReportViaApi(
  token: string,
  body: { targetType: 'user' | 'post' | 'comment'; targetId: number; reason: string; details?: string },
) {
  const res = await fetch(`${API_URL}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function listReportsViaApi(adminToken: string, status = 'pending') {
  const res = await fetch(`${API_URL}/api/admin/reports?status=${status}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
  });
  if (!res.ok) throw new Error(`List reports failed: ${await res.text()}`);
  return res.json();
}

export async function reviewReportViaApi(
  adminToken: string,
  reportId: number,
  action: 'dismiss' | 'delete_content' | 'delete_user',
) {
  const res = await fetch(`${API_URL}/api/admin/reports/${reportId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ action }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
