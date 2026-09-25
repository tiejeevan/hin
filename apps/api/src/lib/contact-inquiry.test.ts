import { describe, expect, it } from 'vitest';
import {
  ContactInquirySchema,
  contactInquiryRecipient,
  CONTACT_TOPIC_LABELS,
} from '@hin/types';
import {
  buildContactInquiryHtml,
  buildContactInquirySubject,
  buildContactInquiryText,
} from './email/templates';

describe('ContactInquirySchema', () => {
  it('accepts valid payloads', () => {
    const result = ContactInquirySchema.safeParse({
      name: 'Max',
      email: 'max@example.com',
      topic: 'general',
      message: 'Hello from the contact form.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short messages', () => {
    const result = ContactInquirySchema.safeParse({
      name: 'Max',
      email: 'max@example.com',
      topic: 'account',
      message: 'Hi',
    });
    expect(result.success).toBe(false);
  });

  it('maps topics to hingot inboxes', () => {
    expect(contactInquiryRecipient('general')).toBe('support@hingot.com');
    expect(contactInquiryRecipient('account')).toBe('admin@hingot.com');
    expect(CONTACT_TOPIC_LABELS.general).toBeTruthy();
  });
});

describe('contact inquiry email templates', () => {
  it('builds subject and bodies with escaped html', () => {
    const params = {
      name: 'Alex',
      email: 'alex@example.com',
      topicLabel: 'General support',
      message: 'Line one\n<script>alert(1)</script>',
    };
    expect(buildContactInquirySubject('Alex', 'General support')).toContain('[Hin Contact]');
    const text = buildContactInquiryText(params);
    expect(text).toContain('alex@example.com');
    expect(text).toContain('Line one');

    const html = buildContactInquiryHtml(params);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
