import { useEffect, useState } from 'react';

interface AuthLogoAnimationProps {
  className?: string;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return reduced;
}

export function AuthLogoAnimation({ className = '' }: AuthLogoAnimationProps) {
  const reducedMotion = usePrefersReducedMotion();

  if (reducedMotion) {
    return (
      <img
        src="/icons/hin-logo.png"
        alt="Hin"
        className={`h-16 w-auto mx-auto object-contain ${className}`}
      />
    );
  }

  return (
    <div
      className={`auth-logo-animation ${className}`}
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
