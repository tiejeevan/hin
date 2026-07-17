import { ChevronDown } from 'lucide-react';
import { ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  iconClassName?: string;
  headerClassName?: string;
  headerPaddingClassName?: string;
  contentClassName?: string;
  badge?: ReactNode;
  open: boolean;
  loading?: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  description,
  icon,
  iconClassName = 'bg-bg-tertiary text-text-muted border-border-custom',
  headerClassName = 'bg-bg-primary/20',
  headerPaddingClassName = 'p-4',
  contentClassName = 'p-4',
  badge,
  open,
  loading = false,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="bg-bg-secondary border border-border-custom rounded-2xl overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full ${headerPaddingClassName} text-left flex items-start gap-3 cursor-pointer transition-colors hover:bg-bg-tertiary/30 ${headerClassName} ${
          open ? 'border-b border-border-custom' : ''
        }`}
      >
        {icon && (
          <div
            className={`h-10 w-10 shrink-0 border flex items-center justify-center rounded-xl ${iconClassName}`}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-text-primary">{title}</h3>
            {badge}
          </div>
          {description && (
            <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 mt-1 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className={contentClassName}>
          {loading ? (
            <div className="py-4 text-center text-xs text-text-muted">Loading…</div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
