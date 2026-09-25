import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { API_URL, TURNSTILE_SITE_KEY } from '../../config';
import { TurnstileWidget, type TurnstileWidgetHandle } from '../auth/TurnstileWidget';
import {
  CONTACT_INQUIRY_TOPICS,
  CONTACT_TOPIC_LABELS,
  type ContactInquiryTopic,
} from '@hin/types';
import '../welcome/welcomePage.css';
import './contactPage.css';

export interface ContactPageProps {
  isAuthenticated?: boolean;
  onStepInside?: () => void;
  onGoToApp?: () => void;
  onBack?: () => void;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

export function ContactPage({
  isAuthenticated,
  onStepInside,
  onGoToApp,
  onBack,
}: ContactPageProps) {
  const formId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<ContactInquiryTopic>('general');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turnstileEnabledSetting, setTurnstileEnabledSetting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/turnstile-config`);
        if (!res.ok) return;
        const data = (await res.json()) as { turnstileEnabled: boolean };
        if (!cancelled) setTurnstileEnabledSetting(data.turnstileEnabled);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const turnstileRequired = !!TURNSTILE_SITE_KEY && turnstileEnabledSetting;
  const year = new Date().getFullYear();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;

    if (company.trim()) {
      setStatus('success');
      setErrorMessage(null);
      return;
    }

    if (turnstileRequired && !turnstileToken) {
      setErrorMessage('Please complete the verification challenge');
      setStatus('error');
      errorRef.current?.focus();
      return;
    }

    setStatus('submitting');
    setErrorMessage(null);

    try {
      const res = await fetch(`${API_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          topic,
          message: message.trim(),
          company: company.trim() || undefined,
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };

      if (!res.ok) {
        setErrorMessage(data.error ?? 'Could not send your message. Please try again.');
        setStatus('error');
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        errorRef.current?.focus();
        return;
      }

      setStatus('success');
      setName('');
      setEmail('');
      setTopic('general');
      setMessage('');
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    } catch {
      setErrorMessage('Network error. Check your connection and try again.');
      setStatus('error');
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      errorRef.current?.focus();
    }
  };

  return (
    <div className="welcome-page contact-page">
      <div className="page-shell">
        <header className="welcome-header">
          <div className="welcome-header-top">
            <div className="welcome-brand" aria-label="Hin">
              <img src="/icons/hin-logo.png" alt="" aria-hidden="true" />
              <span>Hin</span>
            </div>
            {isAuthenticated ? (
              <button type="button" className="button primary welcome-sign-in" onClick={() => onGoToApp?.()}>
                Open Hin
              </button>
            ) : (
              <button type="button" className="button primary welcome-sign-in" onClick={() => onStepInside?.()}>
                Sign in
              </button>
            )}
          </div>
          <div className="welcome-header-sub">
            {onBack && (
              <button type="button" className="welcome-back" onClick={onBack}>
                <ArrowLeft aria-hidden="true" />
                Back
              </button>
            )}
          </div>
        </header>

        <main className="contact-main">
          <section className="contact-hero" aria-labelledby="contact-title">
            <p className="contact-eyebrow">Contact us</p>
            <h1 id="contact-title">We read every message.</h1>
            <p className="contact-lede">
              Questions, feedback, or account help — send a note below and we will reply to your email,
              usually within a few business days.
            </p>
            <div className="contact-direct">
              <a href="mailto:support@hingot.com">support@hingot.com</a>
              <span aria-hidden="true">·</span>
              <a href="mailto:admin@hingot.com">admin@hingot.com</a>
            </div>
          </section>

          <section className="contact-form-section" aria-labelledby="contact-form-title">
            <div className="contact-form-card">
              <h2 id="contact-form-title">Send a message</h2>

              {status === 'success' ? (
                <div className="contact-success" role="status" aria-live="polite">
                  <p>
                    <strong>Message sent.</strong> We will reply to the email address you provided.
                  </p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setStatus('idle')}
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form
                  className="contact-form"
                  onSubmit={handleSubmit}
                  noValidate
                  aria-describedby={errorMessage ? `${formId}-error` : undefined}
                >
                  <div className="contact-field">
                    <label htmlFor={`${formId}-name`}>Name</label>
                    <input
                      id={`${formId}-name`}
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                      maxLength={120}
                      value={name}
                      onChange={e => setName(e.target.value)}
                      disabled={status === 'submitting'}
                    />
                  </div>

                  <div className="contact-field">
                    <label htmlFor={`${formId}-email`}>Email</label>
                    <input
                      id={`${formId}-email`}
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      disabled={status === 'submitting'}
                    />
                  </div>

                  <div className="contact-field">
                    <label htmlFor={`${formId}-topic`}>Topic</label>
                    <select
                      id={`${formId}-topic`}
                      name="topic"
                      value={topic}
                      onChange={e => setTopic(e.target.value as ContactInquiryTopic)}
                      disabled={status === 'submitting'}
                    >
                      {CONTACT_INQUIRY_TOPICS.map(t => (
                        <option key={t} value={t}>
                          {CONTACT_TOPIC_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <p className="contact-field-hint">
                      {topic === 'general'
                        ? 'Routes to support@hingot.com'
                        : 'Routes to admin@hingot.com'}
                    </p>
                  </div>

                  <div className="contact-field">
                    <label htmlFor={`${formId}-message`}>Message</label>
                    <textarea
                      id={`${formId}-message`}
                      name="message"
                      required
                      minLength={10}
                      maxLength={5000}
                      rows={6}
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      disabled={status === 'submitting'}
                    />
                  </div>

                  <div className="contact-honeypot" aria-hidden="true">
                    <label htmlFor={`${formId}-company`}>Company</label>
                    <input
                      id={`${formId}-company`}
                      name="company"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                    />
                  </div>

                  {turnstileRequired && (
                    <TurnstileWidget
                      ref={turnstileRef}
                      onToken={token => {
                        setTurnstileToken(token);
                        setErrorMessage(null);
                      }}
                      onExpire={() => setTurnstileToken(null)}
                    />
                  )}

                  {errorMessage && (
                    <p
                      id={`${formId}-error`}
                      ref={errorRef}
                      className="contact-error"
                      role="alert"
                      tabIndex={-1}
                    >
                      {errorMessage}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="button primary contact-submit"
                    disabled={status === 'submitting' || (turnstileRequired && !turnstileToken)}
                  >
                    {status === 'submitting' ? 'Sending…' : 'Send message'}
                  </button>
                </form>
              )}
            </div>
          </section>
        </main>

        <footer className="contact-footer">
          <span>© {year} Hingot</span>
        </footer>
      </div>
    </div>
  );
}
