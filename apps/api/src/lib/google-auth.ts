export interface GoogleTokenPayload {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  aud: string;
  exp?: string;
}

export async function verifyGoogleIdToken(
  credential: string,
  clientId: string,
): Promise<GoogleTokenPayload | null> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  );
  if (!res.ok) return null;

  const payload = await res.json() as GoogleTokenPayload & { error?: string; error_description?: string };
  if (payload.error) return null;
  if (payload.aud !== clientId) return null;
  if (payload.email_verified !== 'true' && payload.email_verified !== true) return null;
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) return null;

  return payload;
}

export function deriveUsernameFromGoogle(email?: string, name?: string): string {
  const fromEmail = email?.split('@')[0] ?? '';
  const base = (fromEmail || name || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30);
  return base || 'user';
}
