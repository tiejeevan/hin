import { User as UserType, AccountStatus } from '@hin/types';
import { AdminData } from '../../types/ui';

interface RegisteredAccountsProps {
  adminData: AdminData;
  currentUser: UserType;
  onImpersonateUser: (userId: number) => void;
  onUpdateUserRole: (userId: number, currentRole: 'user' | 'admin') => void;
  onDeleteUser: (userId: number, username: string) => void;
  onReinstateUser: (userId: number, username: string) => void;
}

function statusLabel(status: AccountStatus | undefined): string {
  switch (status) {
    case 'self_deleted':
      return 'Self-deleted';
    case 'admin_deleted':
      return 'Admin-deleted';
    default:
      return 'Active';
  }
}

function statusClass(status: AccountStatus | undefined): string {
  switch (status) {
    case 'self_deleted':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'admin_deleted':
      return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    default:
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  }
}

export function RegisteredAccounts({
  adminData,
  currentUser,
  onImpersonateUser,
  onUpdateUserRole,
  onDeleteUser,
  onReinstateUser,
}: RegisteredAccountsProps) {
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-bg-primary/30 border border-border-custom p-3 rounded-xl text-left">
          <p className="text-[10px] text-text-muted font-semibold uppercase">Active Users</p>
          <p className="text-xl font-bold text-text-primary mt-1">{adminData.stats.users}</p>
        </div>
        <div className="bg-bg-primary/30 border border-border-custom p-3 rounded-xl text-left">
          <p className="text-[10px] text-text-muted font-semibold uppercase">Deleted Users</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{adminData.stats.deletedUsers ?? 0}</p>
        </div>
        <div className="bg-bg-primary/30 border border-border-custom p-3 rounded-xl text-left">
          <p className="text-[10px] text-text-muted font-semibold uppercase">Total Posts</p>
          <p className="text-xl font-bold text-indigo-400 mt-1">{adminData.stats.posts}</p>
        </div>
        <div className="bg-bg-primary/30 border border-border-custom p-3 rounded-xl text-left">
          <p className="text-[10px] text-text-muted font-semibold uppercase">Comments</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{adminData.stats.comments}</p>
        </div>
        <div className="bg-bg-primary/30 border border-border-custom p-3 rounded-xl text-left">
          <p className="text-[10px] text-text-muted font-semibold uppercase">DMs Sent</p>
          <p className="text-xl font-bold text-violet-400 mt-1">{adminData.stats.messages}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-custom">
        <table className="w-full text-xs text-left text-text-secondary">
          <thead className="bg-bg-primary/30 text-text-muted border-b border-border-custom">
            <tr>
              <th className="p-3">User ID</th>
              <th className="p-3">Username</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created Date</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-custom">
            {adminData.users.map(u => {
              const isDeleted = u.accountStatus === 'self_deleted' || u.accountStatus === 'admin_deleted';
              return (
                <tr key={u.id} className={`hover:bg-bg-tertiary/40 ${isDeleted ? 'opacity-70' : ''}`}>
                  <td className="p-3 font-mono text-text-muted">#{u.id}</td>
                  <td className="p-3 font-semibold text-text-primary">@{u.username}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        u.role === 'admin'
                          ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                          : 'bg-bg-tertiary text-text-muted'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusClass(u.accountStatus)}`}>
                      {statusLabel(u.accountStatus)}
                    </span>
                  </td>
                  <td className="p-3 text-text-muted">
                    {new Date(u.createdAt).toLocaleDateString()}{' '}
                    {new Date(u.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="p-3 flex items-center justify-center gap-2 flex-wrap">
                    {u.id !== currentUser.id && !isDeleted && (
                      <>
                        <button
                          onClick={() => onImpersonateUser(u.id)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-semibold transition-colors cursor-pointer min-h-[44px]"
                          title={`Act as @${u.username}`}
                        >
                          Act As
                        </button>
                        <button
                          onClick={() => onUpdateUserRole(u.id, u.role)}
                          className="px-2.5 py-1 bg-bg-tertiary hover:bg-bg-primary text-text-secondary border border-border-custom rounded-lg text-[10px] font-semibold transition-colors cursor-pointer min-h-[44px]"
                        >
                          Toggle Role
                        </button>
                        <button
                          onClick={() => onDeleteUser(u.id, u.username)}
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer min-h-[44px]"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {isDeleted && (
                      <button
                        onClick={() => onReinstateUser(u.id, u.username)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-semibold transition-colors cursor-pointer min-h-[44px]"
                      >
                        Reinstate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
