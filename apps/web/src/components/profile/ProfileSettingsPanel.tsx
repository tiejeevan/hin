import { useCallback, useEffect, useState } from 'react';
import { Bell, Lock, MessageSquare, Settings, UserX, AlertTriangle, ShieldCheck } from 'lucide-react';
import {
  ChatIconPage,
  FollowRequest,
  UserSettings,
} from '@hin/types';
import { API_URL } from '../../config';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { SettingsToggle } from '../settings/SettingsToggle';
import { FollowRequestsPanel } from './FollowRequestsPanel';
import { BlockedMutedList } from './BlockedMutedList';
import { LoginHistory } from '../settings/LoginHistory';

const CHAT_PAGE_OPTIONS: { value: ChatIconPage; label: string }[] = [
  { value: 'feed', label: 'Feed' },
  { value: 'profile', label: 'Profile' },
  { value: 'post', label: 'Post view' },
];

interface ProfileSettingsPanelProps {
  settings: UserSettings;
  token: string;
  username: string;
  requests: FollowRequest[];
  highlighted?: boolean;
  onSettingsChange: (settings: UserSettings) => void;
  onApprove: (requesterId: number) => Promise<void>;
  onReject: (requesterId: number) => Promise<void>;
  onViewProfile: (userId: number) => void;
  onClose: () => void;
  onUnblockUser: (userId: number) => void | Promise<void>;
  onUnmuteUser: (userId: number) => void | Promise<void>;
  onDeleteAccount: (password: string) => Promise<{ success: boolean; error?: string }>;
}

export function ProfileSettingsPanel({
  settings,
  token,
  username,
  requests,
  highlighted = false,
  onSettingsChange,
  onApprove,
  onReject,
  onViewProfile,
  onClose,
  onUnblockUser,
  onUnmuteUser,
  onDeleteAccount,
}: ProfileSettingsPanelProps) {
  const [openSection, setOpenSection] = useState<'privacy' | 'notifications' | 'chat' | 'blocked' | 'security' | 'danger' | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (highlighted) setOpenSection('privacy');
  }, [highlighted]);

  const patchSettings = useCallback(
    async (patch: Partial<UserSettings>, key: string) => {
      const previous = settings;
      const optimistic = { ...settings, ...patch, updatedAt: new Date().toISOString() };
      onSettingsChange(optimistic);
      setSavingKey(key);
      setError(null);

      try {
        const res = await fetch(`${API_URL}/api/users/me/settings`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(patch),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to save settings');
        }

        onSettingsChange(await res.json());
      } catch (e) {
        onSettingsChange(previous);
        setError(e instanceof Error ? e.message : 'Failed to save settings');
      } finally {
        setSavingKey(null);
      }
    },
    [settings, token, onSettingsChange],
  );

  const toggleSection = (section: 'privacy' | 'notifications' | 'chat' | 'blocked' | 'security' | 'danger') => {
    setOpenSection(prev => (prev === section ? null : section));
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmUsername !== username) {
      setDeleteError('Username does not match');
      return;
    }
    if (!deletePassword) {
      setDeleteError('Password is required');
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const result = await onDeleteAccount(deletePassword);
      if (!result.success) {
        setDeleteError(result.error || 'Failed to delete account');
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const toggleChatPage = (page: ChatIconPage) => {
    const pages = settings.chatIconPages.includes(page)
      ? settings.chatIconPages.filter(p => p !== page)
      : [...settings.chatIconPages, page];
    void patchSettings({ chatIconPages: pages }, `chat-page-${page}`);
  };

  return (
    <div
      className={`bg-bg-secondary border rounded-2xl p-4 space-y-3 transition-colors ${
        highlighted ? 'border-indigo-500/50 animate-blink-border' : 'border-border-custom'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">Profile settings</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer min-h-[44px] px-2"
        >
          Close
        </button>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="space-y-3">
        <CollapsibleSection
          title="Privacy"
          description="Account visibility and follow requests"
          icon={<Lock className="h-4 w-4" />}
          iconClassName="bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
          open={openSection === 'privacy'}
          onToggle={() => toggleSection('privacy')}
          badge={
            requests.length > 0 && openSection !== 'privacy' ? (
              <span className="h-5 min-w-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {requests.length > 9 ? '9+' : requests.length}
              </span>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <SettingsToggle
              label="Private account"
              description="Only approved followers can see your posts."
              checked={settings.isPrivate}
              disabled={savingKey === 'isPrivate'}
              onChange={checked => void patchSettings({ isPrivate: checked }, 'isPrivate')}
            />

            <section id="follow-requests-panel" className="space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Follow requests
                </h4>
                <p className="text-xs text-text-muted mt-1">
                  Approve or decline users who want to follow you.
                </p>
              </div>
              {requests.length > 0 ? (
                <FollowRequestsPanel
                  requests={requests}
                  onApprove={onApprove}
                  onReject={onReject}
                  onViewProfile={onViewProfile}
                />
              ) : (
                <p className="text-sm text-text-muted py-6 text-center border border-dashed border-border-custom rounded-xl">
                  No pending follow requests.
                </p>
              )}
            </section>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Notifications"
          description="Choose what you receive and how alerts appear"
          icon={<Bell className="h-4 w-4" />}
          iconClassName="bg-amber-500/10 text-amber-400 border-amber-500/20"
          open={openSection === 'notifications'}
          onToggle={() => toggleSection('notifications')}
        >
          <div className="space-y-3">
            <SettingsToggle
              label="Likes"
              description="When someone likes your post or comment."
              checked={settings.notifyLikes}
              disabled={savingKey === 'notifyLikes'}
              onChange={checked => void patchSettings({ notifyLikes: checked }, 'notifyLikes')}
            />
            <SettingsToggle
              label="Comments"
              description="When someone comments on your post or replies to you."
              checked={settings.notifyComments}
              disabled={savingKey === 'notifyComments'}
              onChange={checked => void patchSettings({ notifyComments: checked }, 'notifyComments')}
            />
            <SettingsToggle
              label="Mentions"
              description="When someone @mentions you."
              checked={settings.notifyMentions}
              disabled={savingKey === 'notifyMentions'}
              onChange={checked => void patchSettings({ notifyMentions: checked }, 'notifyMentions')}
            />
            <SettingsToggle
              label="Direct messages"
              description="When you receive a new DM."
              checked={settings.notifyDms}
              disabled={savingKey === 'notifyDms'}
              onChange={checked => void patchSettings({ notifyDms: checked }, 'notifyDms')}
            />
            <SettingsToggle
              label="System broadcasts"
              description="Admin announcements and system messages."
              checked={settings.notifySystem}
              disabled={savingKey === 'notifySystem'}
              onChange={checked => void patchSettings({ notifySystem: checked }, 'notifySystem')}
            />

            <div className="pt-2 border-t border-border-custom">
              <SettingsToggle
                label="Mute all toasts"
                description="Notifications still appear in your inbox."
                checked={settings.muteAllToasts}
                disabled={savingKey === 'muteAllToasts'}
                onChange={checked => void patchSettings({ muteAllToasts: checked }, 'muteAllToasts')}
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Chat"
          description="Control where the messages icon appears"
          icon={<MessageSquare className="h-4 w-4" />}
          iconClassName="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          open={openSection === 'chat'}
          onToggle={() => toggleSection('chat')}
        >
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                Show messages icon
              </legend>
              <label className="flex items-center gap-2 p-3 rounded-xl border border-border-custom bg-bg-primary/50 cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="chat-icon-mode"
                  checked={settings.chatIconMode === 'global'}
                  onChange={() => void patchSettings({ chatIconMode: 'global' }, 'chatIconMode-global')}
                  className="accent-indigo-600"
                />
                <span className="text-sm text-text-primary">Everywhere</span>
              </label>
              <label className="flex items-center gap-2 p-3 rounded-xl border border-border-custom bg-bg-primary/50 cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="chat-icon-mode"
                  checked={settings.chatIconMode === 'selected_pages'}
                  onChange={() =>
                    void patchSettings({ chatIconMode: 'selected_pages' }, 'chatIconMode-selected')
                  }
                  className="accent-indigo-600"
                />
                <span className="text-sm text-text-primary">Only on selected pages</span>
              </label>
            </fieldset>

            {settings.chatIconMode === 'selected_pages' && (
              <div className="space-y-2 pl-1">
                <p className="text-xs text-text-muted">Select pages where the messages icon should appear.</p>
                {CHAT_PAGE_OPTIONS.map(option => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 p-3 rounded-xl border border-border-custom bg-bg-primary/50 cursor-pointer min-h-[44px]"
                  >
                    <input
                      type="checkbox"
                      checked={settings.chatIconPages.includes(option.value)}
                      onChange={() => toggleChatPage(option.value)}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm text-text-primary">{option.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Blocked & muted"
          description="Manage accounts you have blocked or muted"
          icon={<UserX className="h-4 w-4" />}
          iconClassName="bg-rose-500/10 text-rose-400 border-rose-500/20"
          open={openSection === 'blocked'}
          onToggle={() => toggleSection('blocked')}
        >
          <div className="space-y-6">
            <section className="space-y-3">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Blocked accounts</h4>
              <BlockedMutedList
                token={token}
                type="blocked"
                onUnblock={onUnblockUser}
                onViewProfile={onViewProfile}
              />
            </section>
            <section className="space-y-3">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Muted accounts</h4>
              <BlockedMutedList
                token={token}
                type="muted"
                onUnmute={onUnmuteUser}
                onViewProfile={onViewProfile}
              />
            </section>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Login history & security"
          description="View your recent sign-ins, logouts, and failed attempts"
          icon={<ShieldCheck className="h-4 w-4" />}
          iconClassName="bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
          open={openSection === 'security'}
          onToggle={() => toggleSection('security')}
        >
          <LoginHistory token={token} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Danger zone"
          description="Permanently delete your account and all your content"
          icon={<AlertTriangle className="h-4 w-4" />}
          iconClassName="bg-rose-500/10 text-rose-400 border-rose-500/20"
          open={openSection === 'danger'}
          onToggle={() => toggleSection('danger')}
        >
          <div className="space-y-4">
            <p className="text-xs text-text-muted">
              This will soft-delete your account, posts, comments, and related profile data.
              Contact an admin if you need your account restored.
            </p>
            {deleteError && <p className="text-xs text-rose-400">{deleteError}</p>}
            <label className="block space-y-1">
              <span className="text-xs text-text-muted">Type your username to confirm</span>
              <input
                type="text"
                value={deleteConfirmUsername}
                onChange={e => setDeleteConfirmUsername(e.target.value)}
                placeholder={username}
                className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm text-text-primary"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-text-muted">Password</span>
              <input
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm text-text-primary"
              />
            </label>
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => void handleDeleteAccount()}
              className="w-full px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition-colors cursor-pointer min-h-[44px]"
            >
              {deleteBusy ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
