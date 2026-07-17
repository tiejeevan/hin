import { ReactNode } from 'react';
import { CollapsibleSection } from '../ui/CollapsibleSection';

interface AdminCollapsibleSectionProps {
  title: string;
  description: string;
  icon: ReactNode;
  iconClassName?: string;
  headerClassName?: string;
  open: boolean;
  loading?: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function AdminCollapsibleSection(props: AdminCollapsibleSectionProps) {
  return (
    <CollapsibleSection
      {...props}
      headerPaddingClassName="px-3 py-2.5"
      contentClassName="p-2"
    />
  );
}
