'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type MeFirm, type MeUser } from './api';

interface AuthState {
  me: MeUser | null;
  firm: MeFirm | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null,
  firm: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeUser | null>(null);
  const [firm, setFirm] = useState<MeFirm | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ user: MeUser; firm: MeFirm | null }>('/auth/me');
      setMe(res.user);
      setFirm(res.firm);
    } catch {
      setMe(null);
      setFirm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setMe(null);
      setFirm(null);
    }
  }, []);

  const value = useMemo(
    () => ({ me, firm, loading, refresh, logout }),
    [me, firm, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}