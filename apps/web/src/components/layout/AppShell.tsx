import React from 'react';

interface AppShellProps {
  impersonationBanner?: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
  overlay?: React.ReactNode;
}

export function AppShell({
  impersonationBanner,
  header,
  children,
  overlay,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col font-sans select-none text-text-primary transition-colors duration-200">
      {impersonationBanner}
      {header}
      <main className="flex-1 min-h-0 max-w-6xl w-full mx-auto flex overflow-hidden">
        {children}
      </main>
      {overlay}
    </div>
  );
}
