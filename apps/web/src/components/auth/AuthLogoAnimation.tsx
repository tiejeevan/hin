import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

interface AuthLogoAnimationProps {
  className?: string;
  /** Smaller variant for inside the auth card header. */
  size?: 'default' | 'compact';
}

export function AuthLogoAnimation({ className = '', size = 'default' }: AuthLogoAnimationProps) {
  const reducedMotion = usePrefersReducedMotion();
  const sizeClass = size === 'compact' ? 'auth-logo-animation-compact' : '';

  if (reducedMotion) {
    return (
      <img
        src="/icons/hin-logo.png"
        alt="Hin"
        className={`${size === 'compact' ? 'h-12' : 'h-16'} w-auto mx-auto object-contain ${className}`}
      />
    );
  }

  return (
    <div
      className={`auth-logo-animation ${sizeClass} ${className}`.trim()}
      role="img"
      aria-label="Hin logo"
    >
      <img
        src="/icons/layer_ribbon.png"
        alt=""
        aria-hidden
        className="auth-logo-layer auth-logo-ribbon"
        draggable={false}
      />
      <img
        src="/icons/layer_dot.png"
        alt=""
        aria-hidden
        className="auth-logo-layer auth-logo-dot"
        draggable={false}
      />
      <img
        src="/icons/layer_flame.png"
        alt=""
        aria-hidden
        className="auth-logo-layer auth-logo-flame"
        draggable={false}
      />
    </div>
  );
}
