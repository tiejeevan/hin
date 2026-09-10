import type { Env } from '../../types';
import { signOciRequest, type OciCredentials } from './oci-sign';

export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

const DEFAULT_SUBMIT_ENDPOINT = 'https://cell0.submit.email.us-chicago-1.oci.oraclecloud.com';
const EMAIL_API_VERSION = '20241201';

function getOciCredentials(env: Env): OciCredentials | null {
  const tenancyOcid = env.OCI_TENANCY_OCID;
  const userOcid = env.OCI_USER_OCID;
  const fingerprint = env.OCI_FINGERPRINT;
  const privateKeyPem = env.OCI_PRIVATE_KEY;
  if (!tenancyOcid || !userOcid || !fingerprint || !privateKeyPem) return null;
  return { tenancyOcid, userOcid, fingerprint, privateKeyPem };
}

function parseSenderName(from: string): { email: string; name: string } {
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1]!.trim(), email: match[2]!.trim().toLowerCase() };
  }
  return { name: 'Hin', email: from.trim().toLowerCase() };
}

export async function sendOracleEmail(env: Env, params: SendEmailParams): Promise<SendEmailResult> {
  const creds = getOciCredentials(env);
  const compartmentId = env.OCI_COMPARTMENT_OCID;
  if (!creds || !compartmentId) {
    console.error('[oracle-email] OCI credentials not configured');
    return { ok: false, error: 'Email is not configured' };
  }

  const base = (env.OCI_EMAIL_SUBMIT_ENDPOINT ?? DEFAULT_SUBMIT_ENDPOINT).replace(/\/$/, '');
  const url = `${base}/${EMAIL_API_VERSION}/actions/submitEmail`;
  const sender = parseSenderName(params.from);

  const body = JSON.stringify({
    sender: {
      senderAddress: { email: sender.email, name: sender.name },
      compartmentId,
    },
    recipients: {
      to: [{ email: params.to.trim().toLowerCase(), name: params.to }],
      cc: [],
      bcc: [],
    },
    subject: params.subject,
    bodyText: params.text,
    bodyHtml: params.html,
  });

  try {
    const headers = await signOciRequest(creds, 'POST', url, body);
    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[oracle-email] submit failed', res.status, errBody);
      return { ok: false, error: 'Failed to send email' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[oracle-email] network error', err);
    return { ok: false, error: 'Failed to send email' };
  }
}
