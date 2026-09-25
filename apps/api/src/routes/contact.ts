import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import {
  ContactInquirySchema,
  CONTACT_TOPIC_LABELS,
  contactInquiryRecipient,
  type ContactInquiryTopic,
} from '@hin/types';
import type { Env } from '../types';
import { getSystemSettings } from '../lib/system-settings';
import { verifyTurnstileToken } from '../lib/turnstile';
import { isDisposableEmail } from '../lib/email/disposable';
import { getOutboundFromEmail } from '../lib/email/outbound-from';
import { isSmtpConfigured, sendSmtpEmail } from '../lib/email/smtp';
import {
  buildContactInquiryHtml,
  buildContactInquirySubject,
  buildContactInquiryText,
} from '../lib/email/templates';
import { normalizeEmail } from '../lib/otp';
import {
  buildBucketKey,
  CONTACT_INQUIRY_IP_DAY,
  CONTACT_INQUIRY_IP_HOUR,
  resolveClientIp,
} from '../lib/rate-limit-policy';
import { enforceRateLimit } from '../lib/rate-limit-middleware';

const contact = new Hono<{ Bindings: Env }>();

contact.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = ContactInquirySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0]?.message ?? 'Invalid request';
    return c.json({ error: first }, 400);
  }

  const data = parsed.data;
  if (data.company?.trim()) {
    return c.json({ ok: true });
  }

  const ip = resolveClientIp(c.req.raw);
  const hourKey = buildBucketKey('contact:send', 'ip', `${ip}:hour`);
  const dayKey = buildBucketKey('contact:send', 'ip', `${ip}:day`);

  const hourBlocked = await enforceRateLimit(
    c,
    hourKey,
    CONTACT_INQUIRY_IP_HOUR,
    'Too many contact requests. Try again later.',
  );
  if (hourBlocked) return hourBlocked;

  const dayBlocked = await enforceRateLimit(
    c,
    dayKey,
    CONTACT_INQUIRY_IP_DAY,
    'Too many contact requests today. Try again tomorrow.',
  );
  if (dayBlocked) return dayBlocked;

  const db = drizzle(c.env.DB, { schema });
  const settings = await getSystemSettings(db);
  const secret = c.env.TURNSTILE_SECRET_KEY;
  if (secret && settings.turnstileEnabled) {
    if (!data.turnstileToken) {
      return c.json({ error: 'Verification required' }, 400);
    }
    const remoteip = c.req.header('CF-Connecting-IP');
    const ok = await verifyTurnstileToken(data.turnstileToken, secret, remoteip);
    if (!ok) {
      return c.json({ error: 'Verification failed' }, 403);
    }
  }

  const email = normalizeEmail(data.email);
  if (isDisposableEmail(email)) {
    return c.json({ error: 'Temporary email addresses are not allowed' }, 400);
  }

  if (!isSmtpConfigured(c.env)) {
    return c.json({ error: 'Contact form is temporarily unavailable' }, 503);
  }

  const topic = data.topic as ContactInquiryTopic;
  const topicLabel = CONTACT_TOPIC_LABELS[topic];
  const to = contactInquiryRecipient(topic);
  const from = await getOutboundFromEmail(db);
  const templateParams = {
    name: data.name.trim(),
    email,
    topicLabel,
    message: data.message.trim(),
  };

  const result = await sendSmtpEmail(c.env, {
    from,
    to,
    replyTo: email,
    subject: buildContactInquirySubject(templateParams.name, topicLabel),
    text: buildContactInquiryText(templateParams),
    html: buildContactInquiryHtml(templateParams),
  });

  if (!result.ok) {
    console.error('[contact] send failed', result.error);
    return c.json({ error: 'Could not send your message. Please try again later.' }, 502);
  }

  return c.json({ ok: true });
});

export default contact;
