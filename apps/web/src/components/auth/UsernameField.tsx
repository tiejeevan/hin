import { useEffect, useRef, useState } from 'react';
import { USERNAME_MIN_LENGTH } from '@hin/types';
import { API_URL } from '../../config';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

interface UsernameFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}

export function UsernameField({
  value,
  onChange,
  disabled,
  label = 'Username',
}: UsernameFieldProps) {
  const [availability, setAvailability] = useState<Availability>('idle');
  const [reason, setReason] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < USERNAME_MIN_LENGTH) {
      setAvailability(trimmed.length === 0 ? 'idle' : 'invalid');
      setReason(trimmed.length > 0 ? `At least ${USERNAME_MIN_LENGTH} characters` : null);
      return;
    }

    setAvailability('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/auth/username-available?username=${encodeURIComponent(trimmed)}`,
        );
        const data = await res.json() as { available?: boolean; reason?: string };
        if (data.available) {
          setAvailability('available');
          setReason(null);
        } else {
          setAvailability(res.status === 429 ? 'invalid' : 'taken');
          setReason(data.reason ?? 'Username not available');
        }
      } catch {
        setAvailability('idle');
        setReason(null);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const statusColor =
    availability === 'available'
      ? 'text-emerald-400'
      : availability === 'taken' || availability === 'invalid'
        ? 'text-rose-400'
        : 'text-text-muted';

  const statusText =
    availability === 'checking'
      ? 'Checking…'
      : availability === 'available'
        ? 'Available'
        : reason;

  return (
    <div>
      <label className="block text-xs font-semibold text-text-secondary mb-1.5">{label}</label>
      <input
        type="text"
        required
        autoComplete="username"
        placeholder="your_username"
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        disabled={disabled}
        className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
      />
      {statusText && (
        <p className={`mt-1.5 text-[11px] ${statusColor}`}>{statusText}</p>
      )}
    </div>
  );
}

export function isUsernameFieldReady(value: string, availability: Availability): boolean {
  return value.trim().length >= USERNAME_MIN_LENGTH && availability === 'available';
}
