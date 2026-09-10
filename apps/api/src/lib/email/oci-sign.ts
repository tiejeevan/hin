/**
 * Minimal OCI request signer for Cloudflare Workers (Web Crypto).
 * @see https://docs.oracle.com/iaas/Content/API/Concepts/signingrequests.htm
 */

export interface OciCredentials {
  tenancyOcid: string;
  userOcid: string;
  fingerprint: string;
  privateKeyPem: string;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN[^-]+-----/g, '')
    .replace(/-----END[^-]+-----/g, '')
    .replace(/\s/g, '');
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function toBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!);
  return btoa(binary);
}

export async function signOciRequest(
  creds: OciCredentials,
  method: string,
  url: string,
  body: string,
): Promise<Headers> {
  const parsed = new URL(url);
  const bodyBytes = new TextEncoder().encode(body);
  const bodyHash = await crypto.subtle.digest('SHA-256', bodyBytes);
  const bodyHashB64 = toBase64(bodyHash);

  const date = new Date().toUTCString();
  const requestTarget = `${method.toLowerCase()} ${parsed.pathname}`;
  const host = parsed.host;
  const contentType = 'application/json';
  const contentLength = String(bodyBytes.length);

  const signingString = [
    `(request-target): ${requestTarget}`,
    `host: ${host}`,
    `date: ${date}`,
    `x-content-sha256: ${bodyHashB64}`,
    `content-type: ${contentType}`,
    `content-length: ${contentLength}`,
  ].join('\n');

  const key = await importPrivateKey(creds.privateKeyPem);
  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingString),
  );
  const signature = toBase64(signatureBytes);

  const keyId = `${creds.tenancyOcid}/${creds.userOcid}/${creds.fingerprint}`;
  const authorization = [
    'Signature version="1"',
    `keyId="${keyId}"`,
    'algorithm="rsa-sha256"',
    'headers="(request-target) host date x-content-sha256 content-type content-length"',
    `signature="${signature}"`,
  ].join(',');

  const headers = new Headers();
  headers.set('authorization', authorization);
  headers.set('date', date);
  headers.set('host', host);
  headers.set('x-content-sha256', bodyHashB64);
  headers.set('content-type', contentType);
  headers.set('content-length', contentLength);
  return headers;
}
