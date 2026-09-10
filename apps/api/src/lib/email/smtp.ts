import { connect } from 'cloudflare:sockets';
import type { Env } from '../../types';

export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

const DEFAULT_SMTP_HOST = 'smtp.email.us-chicago-1.oci.oraclecloud.com';
const DEFAULT_SMTP_PORT = 587;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function parseSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1]! : from).trim().toLowerCase();
}

function toBase64(value: string): string {
  const bytes = encoder.encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function sanitizeBody(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n\./g, '\n..');
}

export function isSmtpConfigured(env: Env): boolean {
  return !!(
    env.OCI_SMTP_USERNAME
    && env.OCI_SMTP_PASSWORD
    && (env.OCI_SMTP_HOST || DEFAULT_SMTP_HOST)
  );
}

class SmtpSession {
  private buffer = '';

  constructor(
    private socket: Socket,
    private reader: ReadableStreamDefaultReader<Uint8Array>,
    private writer: WritableStreamDefaultWriter<Uint8Array>,
  ) {}

  static create(host: string, port: number, secureTransport: 'starttls' | 'tls' | 'off'): SmtpSession {
    const socket = connect(
      { hostname: host, port },
      { secureTransport: secureTransport === 'tls' ? 'on' : secureTransport === 'starttls' ? 'starttls' : 'off' },
    );
    return new SmtpSession(
      socket,
      socket.readable.getReader(),
      socket.writable.getWriter(),
    );
  }

  private async readResponse(expectedCodes: number[]): Promise<string> {
    while (true) {
      const { value, done } = await this.reader.read();
      if (done) throw new Error('SMTP connection closed unexpectedly');
      this.buffer += decoder.decode(value, { stream: true });
      if (!this.buffer.endsWith('\r\n')) continue;
      const lines = this.buffer.split('\r\n').filter(Boolean);
      const lastLine = lines.at(-1);
      const match = lastLine?.match(/^(\d{3})\s/);
      if (!match) continue;
      const code = Number(match[1]);
      const response = this.buffer.trimEnd();
      this.buffer = '';
      if (!expectedCodes.includes(code)) {
        throw new Error(`SMTP error ${code}: ${response}`);
      }
      return response;
    }
  }

  private async command(command: string, expectedCodes: number[]): Promise<string> {
    await this.writer.write(encoder.encode(`${command}\r\n`));
    return this.readResponse(expectedCodes);
  }

  private async writeData(data: string): Promise<void> {
    await this.writer.write(encoder.encode(data));
  }

  private async startTls(): Promise<void> {
    this.reader.releaseLock();
    this.writer.releaseLock();
    this.socket = this.socket.startTls();
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
    this.buffer = '';
  }

  async authenticate(username: string, password: string): Promise<void> {
    // Oracle Email Delivery supports PLAIN (Python smtplib default), not LOGIN.
    const auth = toBase64(`\0${username}\0${password}`);
    await this.command(`AUTH PLAIN ${auth}`, [235]);
  }

  async close(): Promise<void> {
    try {
      await this.command('QUIT', [221]);
    } finally {
      this.reader.releaseLock();
      this.writer.releaseLock();
      this.socket.close();
    }
  }

  async send(params: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    heloName: string;
    username: string;
    password: string;
    useStartTls: boolean;
  }): Promise<void> {
    await this.readResponse([220]);
    await this.command(`EHLO ${params.heloName}`, [250]);
    if (params.useStartTls) {
      await this.command('STARTTLS', [220]);
      await this.startTls();
      await this.command(`EHLO ${params.heloName}`, [250]);
    }
    await this.authenticate(params.username, params.password);
    await this.command(`MAIL FROM:<${params.from}>`, [250]);
    await this.command(`RCPT TO:<${params.to}>`, [250, 251]);
    await this.command('DATA', [354]);

    const messageBody = params.html
      ? buildMultipartBody(params.text, params.html)
      : sanitizeBody(params.text);

    const contentType = params.html
      ? `multipart/alternative; boundary="${MULTIPART_BOUNDARY}"`
      : 'text/plain; charset=UTF-8';

    const headers = [
      `From: ${params.from}`,
      `To: ${params.to}`,
      `Subject: ${sanitizeHeader(params.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@hingot.com>`,
      'MIME-Version: 1.0',
      `Content-Type: ${contentType}`,
      ...(params.html ? [] : ['Content-Transfer-Encoding: 8bit']),
    ];
    const body = `${headers.join('\r\n')}\r\n\r\n${messageBody}\r\n`;
    await this.writeData(`${body}\r\n.\r\n`);
    await this.readResponse([250]);
  }
}

const MULTIPART_BOUNDARY = 'hin-email-boundary';

function buildMultipartBody(text: string, html: string): string {
  const plain = sanitizeBody(text);
  const htmlBody = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return [
    `--${MULTIPART_BOUNDARY}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    plain,
    `--${MULTIPART_BOUNDARY}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    `--${MULTIPART_BOUNDARY}--`,
  ].join('\r\n');
}

export async function sendSmtpEmail(env: Env, params: SendEmailParams): Promise<SendEmailResult> {
  if (!isSmtpConfigured(env)) {
    console.error('[smtp-email] OCI SMTP credentials not configured');
    return { ok: false, error: 'Email is not configured' };
  }

  const host = env.OCI_SMTP_HOST ?? DEFAULT_SMTP_HOST;
  const port = env.OCI_SMTP_PORT ? parseInt(env.OCI_SMTP_PORT, 10) : DEFAULT_SMTP_PORT;
  if (Number.isNaN(port)) {
    return { ok: false, error: 'Invalid SMTP port' };
  }

  const from = parseSenderEmail(params.from);
  const to = params.to.trim().toLowerCase();
  const useStartTls = port === 587;
  const secureTransport = port === 465 ? 'tls' : useStartTls ? 'starttls' : 'off';

  const session = SmtpSession.create(host, port, secureTransport);
  try {
    await session.send({
      from,
      to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      heloName: 'hingot.com',
      username: env.OCI_SMTP_USERNAME!,
      password: env.OCI_SMTP_PASSWORD!,
      useStartTls,
    });
    return { ok: true };
  } catch (err) {
    console.error('[smtp-email] send failed', err);
    return { ok: false, error: 'Failed to send email' };
  } finally {
    await session.close().catch(() => {});
  }
}
