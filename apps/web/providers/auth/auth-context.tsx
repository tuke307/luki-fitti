'use client';

import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { RegisterDto, UpdatePreferencesDto, UserDto } from '@luki-fitti/common/schemas';
import { DistanceUnit, WeightUnit } from '@luki-fitti/common/enums';

export type AuthMode = 'AUTHENTICATED' | 'OFFLINE_LOCAL' | 'UNAUTHENTICATED';

interface AuthContextProps {
  isAuthenticated: boolean;
  authMode: AuthMode;
  user: UserDto | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: RegisterDto) => Promise<boolean>;
  logout: () => Promise<void>;
  updatePreferences: (data: UpdatePreferencesDto) => Promise<void>;
  continueOfflineLocal: () => void;
  refreshUser: () => Promise<void>;
  error: string | null;
  loading: boolean;
}

const DEFAULT_LOCAL_USER: UserDto = {
  id: 'local-athlete',
  email: 'guest@gymbuddy.local',
  name: 'GymBuddy (Guest)',
  lastLoginAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  preferences: {
    id: 'pref-local',
    userId: 'local-athlete',
    weightUnit: WeightUnit.KG,
    distanceUnit: DistanceUnit.KM,
    defaultRestSeconds: 90,
    theme: 'dark',
    restTimerSound: true,
    weeklyGoalSessions: 4,
  },
};

export const AuthContext = createContext<AuthContextProps>({
  isAuthenticated: false,
  authMode: 'UNAUTHENTICATED',
  user: null,
  login: async () => false,
  register: async () => false,
  logout: async () => {},
  updatePreferences: async () => {},
  continueOfflineLocal: () => {},
  refreshUser: async () => {},
  error: null,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('UNAUTHENTICATED');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.auth.me();
        if (res.success && res.data) {
          setUser(res.data);
          setAuthMode('AUTHENTICATED');
          localStorage.setItem('luki_cached_user_profile', JSON.stringify(res.data));
          setLoading(false);
          return;
        }
      } catch (err) {
        if (err instanceof ApiClientError && err.isNetworkError) {
          const cached = localStorage.getItem('luki_cached_user_profile');
          if (cached) {
            try {
              setUser(JSON.parse(cached));
              setAuthMode('OFFLINE_LOCAL');
              setLoading(false);
              return;
            } catch {
              // Fall through
            }
          }
        }
      }

      const cached = localStorage.getItem('luki_cached_user_profile');
      if (cached) {
        try {
          setUser(JSON.parse(cached));
          setAuthMode('OFFLINE_LOCAL');
          setLoading(false);
          return;
        } catch {
          // Ignore invalid JSON
        }
      }

      setUser(DEFAULT_LOCAL_USER);
      setAuthMode('OFFLINE_LOCAL');
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.auth.login({ email, password });
      if (response.success && response.data) {
        setUser(response.data);
        setAuthMode('AUTHENTICATED');
        localStorage.setItem('luki_cached_user_profile', JSON.stringify(response.data));
        return true;
      }
      setError(response.error || 'Invalid email or password');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (data: RegisterDto): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.auth.register(data);
      if (response.success && response.data) {
        setUser(response.data);
        setAuthMode('AUTHENTICATED');
        localStorage.setItem('luki_cached_user_profile', JSON.stringify(response.data));
        return true;
      }
      setError(response.error || 'Registration failed');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register account');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.auth.logout();
    } catch {
      // Clear local profile regardless of network availability
    } finally {
      localStorage.removeItem('luki_cached_user_profile');
      setUser(DEFAULT_LOCAL_USER);
      setAuthMode('OFFLINE_LOCAL');
      setLoading(false);
    }
  };

  const updatePreferences = async (data: UpdatePreferencesDto) => {
    if (authMode === 'AUTHENTICATED') {
      try {
        const res = await api.auth.updatePreferences(data);
        if (res.success && res.data) {
          setUser(res.data);
          localStorage.setItem('luki_cached_user_profile', JSON.stringify(res.data));
          return;
        }
      } catch {
        // Fall back to local preference update
      }
    }

    if (user) {
      const next: UserDto = {
        ...user,
        name: data.name ?? user.name,
        preferences: {
          id: user.preferences?.id ?? 'pref-local',
          userId: user.id,
          weightUnit: data.weightUnit ?? user.preferences?.weightUnit ?? WeightUnit.KG,
          distanceUnit: data.distanceUnit ?? user.preferences?.distanceUnit ?? DistanceUnit.KM,
          defaultRestSeconds:
            data.defaultRestSeconds ?? user.preferences?.defaultRestSeconds ?? 90,
          theme: data.theme ?? user.preferences?.theme ?? 'dark',
          restTimerSound: data.restTimerSound ?? user.preferences?.restTimerSound ?? true,
          weeklyGoalSessions:
            data.weeklyGoalSessions ?? user.preferences?.weeklyGoalSessions ?? 4,
        },
      };
      setUser(next);
      localStorage.setItem('luki_cached_user_profile', JSON.stringify(next));
    }
  };

  const continueOfflineLocal = () => {
    setUser(DEFAULT_LOCAL_USER);
    setAuthMode('OFFLINE_LOCAL');
    localStorage.setItem('luki_cached_user_profile', JSON.stringify(DEFAULT_LOCAL_USER));
  };

  const refreshUser = async () => {
    try {
      const res = await api.auth.me();
      if (res.success && res.data) {
        setUser(res.data);
        setAuthMode('AUTHENTICATED');
        localStorage.setItem('luki_cached_user_profile', JSON.stringify(res.data));
      }
    } catch {
      // Keep existing state
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: authMode === 'AUTHENTICATED',
        authMode,
        user,
        login,
        register,
        logout,
        updatePreferences,
        continueOfflineLocal,
        refreshUser,
        error,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
