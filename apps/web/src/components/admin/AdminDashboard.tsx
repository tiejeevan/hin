import { useState } from 'react';
import { History, Megaphone, Shield, Users } from 'lucide-react';
import { BroadcastDelivery, SystemBroadcast as SystemBroadcastRecord, User as UserType } from '@hin/types';
import { AdminData } from '../../types/ui';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';
import { BroadcastAuditLog } from './BroadcastAuditLog';
import { RegisteredAccounts } from './RegisteredAccounts';
import { SystemBroadcast } from './SystemBroadcast';

interface AdminDashboardProps {
  adminData: AdminData | null;
  broadcastHistory: SystemBroadcastRecord[] | null;
  currentUser: UserType;
  onImpersonateUser: (userId: number) => void;
  onUpdateUserRole: (userId: number, currentRole: 'user' | 'admin') => void;
  onDeleteUser: (userId: number, username: string) => void;
  onLoadAdminData: () => Promise<void>;
  onLoadBroadcastHistory: () => Promise<void>;
  onBroadcast: (message: string, delivery: BroadcastDelivery) => Promise<{
    success: boolean;
    notificationsCreated?: number;
    error?: string;
  }>;
}

export function AdminDashboard({
  adminData,
  broadcastHistory,
  currentUser,
  onImpersonateUser,
  onUpdateUserRole,
  onDeleteUser,
  onLoadAdminData,
  onLoadBroadcastHistory,
  onBroadcast,
}: AdminDashboardProps) {
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const toggleBroadcast = () => {
    setBroadcastOpen(prev => !prev);
  };

  const toggleAudit = async () => {
    if (auditOpen) {
      setAuditOpen(false);
      return;
    }

    setAuditOpen(true);
    if (broadcastHistory !== null) return;

    setAuditLoading(true);
    try {
      await onLoadBroadcastHistory();
    } finally {
      setAuditLoading(false);
    }
  };

  const toggleAccounts = async () => {
    if (accountsOpen) {
      setAccountsOpen(false);
      return;
    }

    setAccountsOpen(true);
    if (adminData !== null) return;

    setAccountsLoading(true);
    try {
      await onLoadAdminData();
    } finally {
      setAccountsLoading(false);
    }
  };

  return (
    <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-border-custom pb-4">
        <div className="h-10 w-10 bg-amber-600/10 border border-amber-600/20 text-amber-500 flex items-center justify-center rounded-xl">
          <Shield className="h-6 w-6" />
        </div>
        <div className="text-left">
          <h2 className="text-lg font-bold text-text-primary">Admin Dashboard</h2>
          <p className="text-xs text-text-muted">
            Expand a section to load its data. Nothing is fetched until you open it.
          </p>
        </div>
      </div>

      <AdminCollapsibleSection
        title="System Broadcast"
        description="Send news or announcements to every account as a system message."
        icon={<Megaphone className="h-5 w-5" />}
        iconClassName="bg-violet-600/15 border-violet-500/25 text-violet-400"
        headerClassName="bg-gradient-to-r from-violet-500/10 via-indigo-500/5 to-transparent"
        open={broadcastOpen}
        onToggle={toggleBroadcast}
      >
        <SystemBroadcast onBroadcast={onBroadcast} />
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Broadcast Audit Log"
        description="Review every system broadcast, including toast-only sends."
        icon={<History className="h-5 w-5" />}
        iconClassName="bg-violet-600/15 border-violet-500/25 text-violet-400"
        open={auditOpen}
        loading={auditLoading}
        onToggle={toggleAudit}
      >
        <BroadcastAuditLog history={broadcastHistory ?? []} />
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Registered Accounts"
        description="Platform metrics and user administration."
        icon={<Users className="h-5 w-5" />}
        iconClassName="bg-indigo-500/15 border-indigo-500/25 text-indigo-400"
        open={accountsOpen}
        loading={accountsLoading}
        onToggle={toggleAccounts}
      >
        {adminData ? (
          <RegisteredAccounts
            adminData={adminData}
            currentUser={currentUser}
            onImpersonateUser={onImpersonateUser}
            onUpdateUserRole={onUpdateUserRole}
            onDeleteUser={onDeleteUser}
          />
        ) : (
          <div className="p-6 text-center text-xs text-text-muted">Unable to load accounts.</div>
        )}
      </AdminCollapsibleSection>
    </div>
  );
}
