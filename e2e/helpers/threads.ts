const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function createThreadReplyViaApi(
  token: string,
  replyToPostId: number,
  content: string,
) {
  const res = await fetch(`${API_URL}/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content, replyToPostId }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function getThreadViaApi(token: string | null, postId: number) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/posts/${postId}/thread`, { headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function getFeedPostsViaApi(token: string) {
  const res = await fetch(`${API_URL}/api/posts?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Feed posts failed: ${await res.text()}`);
  return res.json();
}
