const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function deleteAccountViaApi(
  token: string,
  password: string,
): Promise<{ status: number; data: { success?: boolean; error?: string } }> {
  const res = await fetch(`${API_URL}/api/users/me`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function reinstateUserViaApi(
  adminToken: string,
  userId: number,
): Promise<{ status: number; data: { success?: boolean; error?: string } }> {
  const res = await fetch(`${API_URL}/api/admin/users/${userId}/reinstate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function getAdminStatsViaApi(adminToken: string) {
  const res = await fetch(`${API_URL}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error(`Admin stats failed: ${await res.text()}`);
  return res.json();
}

export async function getUserProfileViaApi(token: string | null, userId: number) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/users/${userId}`, { headers });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
