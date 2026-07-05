interface SettingsToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function SettingsToggle({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: SettingsToggleProps) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-border-custom bg-bg-primary/50">
      <div>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          checked ? 'bg-indigo-600' : 'bg-bg-tertiary border border-border-custom'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
