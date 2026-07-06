const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function getSystemSettingsViaApi(token: string) {
  const res = await fetch(`${API_URL}/api/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function setPostLimitsViaApi(
  adminToken: string,
  limits: { maxPostLength?: number; maxMediaPerPost?: number },
) {
  const res = await fetch(`${API_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(limits),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function createPostRawViaApi(
  token: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(`${API_URL}/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function editPostViaApi(token: string, postId: number, content: string) {
  const res = await fetch(`${API_URL}/api/posts/${postId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
