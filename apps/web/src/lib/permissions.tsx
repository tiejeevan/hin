import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { PermissionKey } from '@hin/types';

type PermissionsValue = PermissionKey[] | 'all' | null;

const PermissionsContext = createContext<{
  permissions: PermissionsValue;
  role: 'user' | 'moderator' | 'admin' | null;
}>({ permissions: null, role: null });

export function PermissionsProvider({
  children,
  permissions,
  role,
}: {
  children: ReactNode;
  permissions: PermissionsValue;
  role: 'user' | 'moderator' | 'admin' | null;
}) {
  const value = useMemo(() => ({ permissions, role }), [permissions, role]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  const { permissions, role } = useContext(PermissionsContext);
  const can = useCallback(
    (key: PermissionKey) => {
      if (role === 'admin' || permissions === 'all') return true;
      if (!permissions) return false;
      return permissions.includes(key);
    },
    [permissions, role],
  );
  const canAny = useCallback(
    (keys: PermissionKey[]) => keys.some((k) => can(k)),
    [can],
  );
  return {
    can,
    canAny,
    permissions,
    role,
    isAdmin: role === 'admin',
    isModerator: role === 'moderator' && permissions !== null,
  };
}
