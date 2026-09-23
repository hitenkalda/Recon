'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type MeFirm, type MeUser, type MeIndividual } from './api';

interface AuthState {
  me: MeUser | null;
  firm: MeFirm | null;
  individual: MeIndividual | null;
  sessionType: 'enterprise' | 'individual' | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null,
  firm: null,
  individual: null,
  sessionType: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeUser | null>(null);
  const [firm, setFirm] = useState<MeFirm | null>(null);
  const [individual, setIndividual] = useState<MeIndividual | null>(null);
  const [sessionType, setSessionType] = useState<'enterprise' | 'individual' | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Try enterprise session first
    try {
      const res = await api.get<{ user: MeUser; firm: MeFirm | null }>('/auth/me');
      setMe(res.user);
      setFirm(res.firm);
      setIndividual(null);
      setSessionType('enterprise');
      return;
    } catch {
      // Not an enterprise session, try individual
    }

    // Try individual session
    try {
      const res = await api.get<MeIndividual>('/individual/auth/me');
      setIndividual(res);
      setMe(null);
      setFirm(null);
      setSessionType('individual');
    } catch {
      setMe(null);
      setFirm(null);
      setIndividual(null);
      setSessionType(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    // Try both logout endpoints
    await Promise.allSettled([
      api.post('/auth/logout').catch(() => {}),
      api.post('/individual/auth/logout').catch(() => {}),
    ]);
    setMe(null);
    setFirm(null);
    setIndividual(null);
    setSessionType(null);
  }, []);

  const value = useMemo(
    () => ({ me, firm, individual, sessionType, loading, refresh, logout }),
    [me, firm, individual, sessionType, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}