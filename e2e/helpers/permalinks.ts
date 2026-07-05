const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function createCommentViaApi(token: string, postId: number, content: string) {
  const res = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Create comment failed: ${await res.text()}`);
  return res.json();
}

export async function likePostViaApi(token: string, postId: number) {
  const res = await fetch(`${API_URL}/api/posts/${postId}/like`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Like post failed: ${await res.text()}`);
  return res.json();
}

export async function likeCommentViaApi(token: string, commentId: number) {
  const res = await fetch(`${API_URL}/api/comments/${commentId}/like`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Like comment failed: ${await res.text()}`);
  return res.json();
}

export async function deletePostViaApi(token: string, postId: number) {
  const res = await fetch(`${API_URL}/api/posts/${postId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Delete post failed: ${await res.text()}`);
}

export async function approveFollowRequestViaApi(ownerToken: string, requesterId: number) {
  const res = await fetch(`${API_URL}/api/follows/requests/${requesterId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
  });
  if (!res.ok) throw new Error(`Approve follow failed: ${await res.text()}`);
}

export async function getPostViaApi(token: string | null, postId: number) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/posts/${postId}`, { headers });
  return { status: res.status, data: res.ok ? await res.json() : await res.json().catch(() => ({})) };
}
