const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function repostViaApi(token: string, postId: number) {
  const res = await fetch(`${API_URL}/api/posts/${postId}/repost`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Repost failed: ${await res.text()}`);
  return res.json();
}

export async function unrepostViaApi(token: string, postId: number) {
  const res = await fetch(`${API_URL}/api/posts/${postId}/repost`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Undo repost failed: ${await res.text()}`);
  return res.json();
}

export async function quoteViaApi(token: string, postId: number, content: string) {
  const res = await fetch(`${API_URL}/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content, quotePostId: postId }),
  });
  if (!res.ok) throw new Error(`Quote failed: ${await res.text()}`);
  return res.json();
}

export async function getFeedViaApi(token: string) {
  const res = await fetch(`${API_URL}/api/posts?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Feed failed: ${await res.text()}`);
  return res.json() as Promise<{ posts: Array<Record<string, unknown>> }>;
}

export async function getPostViaApi(token: string, postId: number) {
  const res = await fetch(`${API_URL}/api/posts/${postId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get post failed: ${await res.text()}`);
  return res.json();
}

export async function createThreadReplyStillRejected(token: string, parentId: number) {
  const res = await fetch(`${API_URL}/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content: 'legacy thread reply', replyToPostId: parentId }),
  });
  return res;
}
