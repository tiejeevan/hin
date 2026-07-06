const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function pinPostViaApi(token: string, postId: number) {
  const res = await fetch(`${API_URL}/api/posts/${postId}/pin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function unpinPostViaApi(token: string, postId: number) {
  const res = await fetch(`${API_URL}/api/posts/${postId}/pin`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function setMaxPinsViaApi(adminToken: string, maxPinnedPostsPerUser: number) {
  const res = await fetch(`${API_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ maxPinnedPostsPerUser }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function getProfilePostsViaApi(token: string, userId: number) {
  const res = await fetch(`${API_URL}/api/posts?userId=${userId}&limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Profile posts failed: ${await res.text()}`);
  return res.json();
}
