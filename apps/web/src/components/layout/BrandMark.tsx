interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: { height: 'h-7', text: 'text-[1.75rem]' },
  md: { height: 'h-8', text: 'text-[2rem]' },
  lg: { height: 'h-10', text: 'text-[2.5rem]' },
};

export function BrandMark({ size = 'md', className = '' }: BrandMarkProps) {
  const sizes = sizeClasses[size];

  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${sizes.height} ${className}`}>
      <img
        src="/icons/hin-logo.png"
        alt=""
        aria-hidden
        className="h-full w-auto aspect-[597/360] object-contain shrink-0"
      />
      <span
        className={`${sizes.text} font-bold leading-none tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-text-primary via-text-secondary to-text-muted`}
      >
        Hin
      </span>
    </span>
  );
}
