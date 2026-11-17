'use client';

import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { trackEvent } from '@/lib/analytics/track';
import { clearAllLocalData } from '@/lib/offline/offline-store';
import { disablePushOnThisDevice } from '@/lib/push/web-push';
import type { RegisterDto, UpdatePreferencesDto, UserDto } from '@luki-fitti/common/schemas';
import {
  GUEST_USER_ID,
  applyPreferencesPatch,
  buildGuestUser,
  clearGuestPreferences,
  guestPreferencesToSync,
  readGuestPreferences,
  writeGuestPreferences,
  type GuestMergeMode,
} from '@/lib/auth/guest-preferences';

export type AuthMode = 'AUTHENTICATED' | 'OFFLINE_LOCAL' | 'UNAUTHENTICATED';

interface AuthContextProps {
  isAuthenticated: boolean;
  authMode: AuthMode;
  user: UserDto | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: RegisterDto) => Promise<boolean>;
  verifyEmail: (token: string) => Promise<boolean>;
  resendConfirmation: (email: string) => Promise<boolean>;
  requestAccountDeletion: (password: string) => Promise<boolean>;
  confirmAccountDeletion: (token: string) => Promise<boolean>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<boolean>;
  updatePreferences: (data: UpdatePreferencesDto) => Promise<void>;
  continueOfflineLocal: () => void;
  refreshUser: () => Promise<void>;
  error: string | null;
  infoMessage: string | null;
  loading: boolean;
}

/** Guest user with the preferences saved on this device (see `lib/auth/guest-preferences`). */
const loadGuestUser = (): UserDto => buildGuestUser(readGuestPreferences());

/** A cached guest profile (older builds cached it) picks up the device's guest preferences. */
const fromCache = (cached: UserDto): UserDto =>
  cached.id === GUEST_USER_ID ? loadGuestUser() : cached;

export const AuthContext = createContext<AuthContextProps>({
  isAuthenticated: false,
  authMode: 'UNAUTHENTICATED',
  user: null,
  login: async () => false,
  register: async () => false,
  verifyEmail: async () => false,
  resendConfirmation: async () => false,
  requestAccountDeletion: async () => false,
  confirmAccountDeletion: async () => false,
  logout: async () => {},
  logoutAll: async () => false,
  updatePreferences: async () => {},
  continueOfflineLocal: () => {},
  refreshUser: async () => {},
  error: null,
  infoMessage: null,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('UNAUTHENTICATED');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
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
              setUser(fromCache(JSON.parse(cached)));
              setAuthMode('OFFLINE_LOCAL');
              setLoading(false);
              return;
            } catch {
              // Fall through
            }
          }
        } else if (err instanceof ApiClientError && err.isAuthError) {
          // A rejected session signs the person out. Drop local data only when this device
          // actually belonged to a signed-in account — a guest's workouts, weigh-ins and
          // cached content are theirs and survive every reload.
          if (localStorage.getItem('luki_cached_user_profile')) {
            await clearAllLocalData().catch(() => undefined);
            localStorage.removeItem('luki_cached_user_profile');
          }
          setUser(loadGuestUser());
          setAuthMode('OFFLINE_LOCAL');
          setLoading(false);
          return;
        }
      }

      const cached = localStorage.getItem('luki_cached_user_profile');
      if (cached) {
        try {
          setUser(fromCache(JSON.parse(cached)));
          setAuthMode('OFFLINE_LOCAL');
          setLoading(false);
          return;
        } catch {
          // Ignore invalid JSON
        }
      }

      setUser(loadGuestUser());
      setAuthMode('OFFLINE_LOCAL');
      setLoading(false);
    };

    checkAuth();
  }, []);

  /** Signs in `signedIn`, first moving the guest's device preferences onto the account. */
  const adoptSignedInUser = async (signedIn: UserDto, mode: GuestMergeMode) => {
    let next = signedIn;
    const patch = guestPreferencesToSync(signedIn.preferences, readGuestPreferences(), mode);
    try {
      if (Object.keys(patch).length > 0) {
        const res = await api.auth.updatePreferences(patch);
        if (res.success && res.data) next = res.data;
      }
      clearGuestPreferences();
    } catch {
      // Keep the guest preferences on this device; the next sign-in tries again.
    }
    setUser(next);
    setAuthMode('AUTHENTICATED');
    localStorage.setItem('luki_cached_user_profile', JSON.stringify(next));
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const response = await api.auth.login({ email, password });
      if (response.success && response.data) {
        trackEvent('login', { status: 'success' });
        await adoptSignedInUser(response.data, 'fill');
        return true;
      }
      trackEvent('login', { status: 'error' });
      setError(response.error || 'Invalid email or password');
      return false;
    } catch (err) {
      trackEvent('login', { status: 'error' });
      setError(err instanceof Error ? err.message : 'Unable to sign in');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (data: RegisterDto): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const response = await api.auth.register(data);
      if (response.success && response.data) {
        if (response.data.requiresEmailConfirmation) {
          trackEvent('signup', { status: 'pending_confirmation' });
          setInfoMessage(
            response.data.message ||
              'Account created! Please check your email and click the confirmation link to activate your account.',
          );
          return false;
        }
        trackEvent('signup', { status: 'success' });
        await adoptSignedInUser(response.data, 'replace');
        return true;
      }
      trackEvent('signup', { status: 'error' });
      setError(response.error || 'Registration failed');
      return false;
    } catch (err) {
      trackEvent('signup', { status: 'error' });
      setError(err instanceof Error ? err.message : 'Unable to register account');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const verifyEmail = async (token: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const response = await api.auth.verifyEmail({ token });
      if (response.success && response.data) {
        await adoptSignedInUser(response.data, 'replace');
        return true;
      }
      setError(response.error || 'Email verification failed');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired verification link');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const resendConfirmation = async (email: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.auth.resendConfirmation({ email });
      if (response.success && response.data) {
        setInfoMessage(response.data.message);
        return true;
      }
      setError(response.error || 'Failed to resend confirmation email');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend confirmation email');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const clearSignedInState = async () => {
    await disablePushOnThisDevice().catch(() => undefined);
    await clearAllLocalData().catch(() => undefined);
    localStorage.removeItem('luki_cached_user_profile');
    setUser(loadGuestUser());
    setAuthMode('OFFLINE_LOCAL');
  };

  const logout = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.auth.logout();
    } catch {
      // Clear local profile regardless of network availability
    } finally {
      await clearSignedInState();
      setLoading(false);
    }
  };

  const logoutAll = async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await api.auth.logoutAll();
      await clearSignedInState();
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  };

  const requestAccountDeletion = async (password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const response = await api.auth.requestAccountDeletion({ password });
      if (response.success) {
        trackEvent('account_delete_request');
        setInfoMessage(
          response.data?.message ||
            'A confirmation link has been sent to your email address. Click the link in the email and confirm in your browser to permanently delete your account.',
        );
        return true;
      }
      setError(response.error || 'Failed to request account deletion');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request account deletion');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const confirmAccountDeletion = async (token: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const response = await api.auth.confirmAccountDeletion({ token });
      if (response.success) {
        await clearAllLocalData().catch(() => undefined);
        localStorage.removeItem('luki_cached_user_profile');
        setUser(loadGuestUser());
        setAuthMode('OFFLINE_LOCAL');
        setInfoMessage(
          response.data?.message ||
            'Your account and all associated workout data have been permanently deleted.',
        );
        return true;
      }
      setError(response.error || 'Failed to confirm account deletion');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired account deletion link');
      return false;
    } finally {
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

    if (!user) return;
    if (user.id === GUEST_USER_ID) {
      setUser(buildGuestUser(writeGuestPreferences(data)));
      return;
    }
    const next = applyPreferencesPatch(user, data);
    setUser(next);
    localStorage.setItem('luki_cached_user_profile', JSON.stringify(next));
  };

  const continueOfflineLocal = () => {
    const guest = loadGuestUser();
    setUser(guest);
    setAuthMode('OFFLINE_LOCAL');
    localStorage.setItem('luki_cached_user_profile', JSON.stringify(guest));
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
        verifyEmail,
        resendConfirmation,
        requestAccountDeletion,
        confirmAccountDeletion,
        logout,
        logoutAll,
        updatePreferences,
        continueOfflineLocal,
        refreshUser,
        error,
        infoMessage,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
