import { Shield, Users } from 'lucide-react';
import { User as UserType } from '@hin/types';
import { AdminData } from '../../types/ui';

interface AdminDashboardProps {
  adminData: AdminData | null;
  currentUser: UserType;
  onImpersonateUser: (userId: number) => void;
  onUpdateUserRole: (userId: number, currentRole: 'user' | 'admin') => void;
  onDeleteUser: (userId: number, username: string) => void;
}

export function AdminDashboard({
  adminData,
  currentUser,
  onImpersonateUser,
  onUpdateUserRole,
  onDeleteUser,
}: AdminDashboardProps) {
  return (
    <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3 border-b border-border-custom pb-4">
        <div className="h-10 w-10 bg-amber-600/10 border border-amber-600/20 text-amber-500 flex items-center justify-center rounded-xl">
          <Shield className="h-6 w-6" />
        </div>
        <div className="text-left">
          <h2 className="text-lg font-bold text-text-primary">Admin Dashboard</h2>
          <p className="text-xs text-text-muted">Moderator metrics and platform user administration</p>
        </div>
      </div>

      {adminData ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-bg-secondary border border-border-custom p-4 rounded-2xl text-left shadow-sm">
              <p className="text-xs text-text-muted font-semibold uppercase">Total Users</p>
              <p className="text-2xl font-bold text-text-primary mt-1.5">{adminData.stats.users}</p>
            </div>
            <div className="bg-bg-secondary border border-border-custom p-4 rounded-2xl text-left shadow-sm">
              <p className="text-xs text-text-muted font-semibold uppercase">Total Posts</p>
              <p className="text-2xl font-bold text-indigo-400 mt-1.5">{adminData.stats.posts}</p>
            </div>
            <div className="bg-bg-secondary border border-border-custom p-4 rounded-2xl text-left shadow-sm">
              <p className="text-xs text-text-muted font-semibold uppercase">Comments</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1.5">{adminData.stats.comments}</p>
            </div>
            <div className="bg-bg-secondary border border-border-custom p-4 rounded-2xl text-left shadow-sm">
              <p className="text-xs text-text-muted font-semibold uppercase">DMs Sent</p>
              <p className="text-2xl font-bold text-violet-400 mt-1.5">{adminData.stats.messages}</p>
            </div>
          </div>

          <div className="bg-bg-secondary border border-border-custom rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border-custom bg-bg-primary/20 text-left">
              <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <Users className="h-4.5 w-4.5 text-indigo-400" />
                Registered Accounts
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-text-secondary">
                <thead className="bg-bg-primary/30 text-text-muted border-b border-border-custom">
                  <tr>
                    <th className="p-3">User ID</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Created Date</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom">
                  {adminData.users.map(u => (
                    <tr key={u.id} className="hover:bg-bg-tertiary/40">
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
                      <td className="p-3 text-text-muted">
                        {new Date(u.createdAt).toLocaleDateString()}{' '}
                        {new Date(u.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="p-3 flex items-center justify-center gap-2 flex-wrap">
                        {u.id !== currentUser.id && (
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-text-muted text-xs">Loading Admin Panel statistics...</div>
      )}
    </div>
  );
}
