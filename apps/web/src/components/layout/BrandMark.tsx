interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: { logo: 'h-7', text: 'text-lg' },
  md: { logo: 'h-8', text: 'text-xl' },
  lg: { logo: 'h-10', text: 'text-2xl' },
};

export function BrandMark({ size = 'md', className = '' }: BrandMarkProps) {
  const sizes = sizeClasses[size];

  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`}>
      <img
        src="/icons/hin-logo.png"
        alt=""
        aria-hidden
        className={`${sizes.logo} w-auto object-contain shrink-0`}
      />
      <span
        className={`font-bold bg-clip-text text-transparent bg-gradient-to-r from-text-primary via-text-secondary to-text-muted ${sizes.text}`}
      >
        Hin
      </span>
    </span>
  );
}
