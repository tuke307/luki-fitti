'use client';

import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { trackEvent } from '@/lib/analytics/track';
import { clearAllLocalData } from '@/lib/offline/offline-store';
import { disablePushOnThisDevice } from '@/lib/push/web-push';
import type {
  MfaRequiredDto,
  OAuthLoginDto,
  OAuthProviderName,
  RegisterDto,
  UpdatePreferencesDto,
  UserDto,
} from '@luki-fitti/common/schemas';
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
import { PROFILE_CACHE_KEY, toCachedProfile } from '@/lib/auth/cached-profile';

export type AuthMode = 'AUTHENTICATED' | 'OFFLINE_LOCAL' | 'UNAUTHENTICATED';

interface AuthContextProps {
  isAuthenticated: boolean;
  authMode: AuthMode;
  user: UserDto | null;
  /** `'mfa'` means the first factor passed and a 2FA code is now required (`mfaPending`). */
  login: (email: string, password: string) => Promise<'ok' | 'mfa' | 'error'>;
  /** A first factor succeeded; the API waits for a TOTP/recovery code with this token. */
  mfaPending: boolean;
  verifyMfa: (code: string) => Promise<boolean>;
  cancelMfa: () => void;
  loginWithOAuth: (
    provider: OAuthProviderName,
    data: OAuthLoginDto,
  ) => Promise<'ok' | 'mfa' | 'error'>;
  /** Platform/passkey sign-in; `false` also covers a dismissed authenticator prompt. */
  loginWithPasskey: () => Promise<boolean>;
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
  error: ApiClientError | null;
  infoMessage: string | null;
  loading: boolean;
}

/** Guest user with the preferences saved on this device (see `lib/auth/guest-preferences`). */
const loadGuestUser = (): UserDto => buildGuestUser(readGuestPreferences());

/** A cached guest profile (older builds cached it) picks up the device's guest preferences. */
const fromCache = (cached: UserDto): UserDto =>
  cached.id === GUEST_USER_ID ? loadGuestUser() : cached;

/** Writes the profile cache without the sign-in tokens (HttpOnly cookies carry the session). */
const writeProfileCache = (user: UserDto) => {
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(toCachedProfile(user)));
};

/** Reads the profile cache; strips and rewrites it once if an older build left tokens in it. */
const readProfileCache = (): UserDto | null => {
  const raw = localStorage.getItem(PROFILE_CACHE_KEY);
  if (!raw) return null;
  let parsed: UserDto;
  try {
    parsed = JSON.parse(raw) as UserDto;
  } catch {
    localStorage.removeItem(PROFILE_CACHE_KEY);
    return null;
  }
  if (parsed.tokens) {
    const cleaned = toCachedProfile(parsed);
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cleaned));
    return cleaned;
  }
  return parsed;
};

export const AuthContext = createContext<AuthContextProps>({
  isAuthenticated: false,
  authMode: 'UNAUTHENTICATED',
  user: null,
  login: async () => 'error',
  mfaPending: false,
  verifyMfa: async () => false,
  cancelMfa: () => {},
  loginWithOAuth: async () => 'error',
  loginWithPasskey: async () => false,
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
  const [error, setError] = useState<ApiClientError | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.auth.me();
        if (res.success && res.data) {
          setUser(toCachedProfile(res.data));
          setAuthMode('AUTHENTICATED');
          writeProfileCache(res.data);
          setLoading(false);
          return;
        }
      } catch (err) {
        if (err instanceof ApiClientError && err.isNetworkError) {
          const cached = readProfileCache();
          if (cached) {
            try {
              setUser(fromCache(cached));
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
          if (localStorage.getItem(PROFILE_CACHE_KEY)) {
            await clearAllLocalData().catch(() => undefined);
            localStorage.removeItem(PROFILE_CACHE_KEY);
          }
          setUser(loadGuestUser());
          setAuthMode('OFFLINE_LOCAL');
          setLoading(false);
          return;
        }
      }

      const cached = readProfileCache();
      if (cached) {
        try {
          setUser(fromCache(cached));
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
    setUser(toCachedProfile(next));
    setAuthMode('AUTHENTICATED');
    writeProfileCache(next);
  };

  const isMfaRequired = (data: UserDto | MfaRequiredDto): data is MfaRequiredDto =>
    (data as MfaRequiredDto).mfaRequired === true;

  /** Shared tail of every sign-in: either adopt the user or park the MFA challenge. */
  const finishSignIn = async (
    data: UserDto | MfaRequiredDto,
    method: string,
  ): Promise<'ok' | 'mfa'> => {
    if (isMfaRequired(data)) {
      trackEvent('login', { status: 'mfa_required', method });
      setMfaToken(data.mfaToken);
      return 'mfa';
    }
    trackEvent('login', { status: 'success', method });
    await adoptSignedInUser(data, 'fill');
    return 'ok';
  };

  const login = async (email: string, password: string): Promise<'ok' | 'mfa' | 'error'> => {
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    setMfaToken(null);
    try {
      const response = await api.auth.login({ email, password });
      if (response.success && response.data) {
        return await finishSignIn(response.data, 'password');
      }
      trackEvent('login', { status: 'error', method: 'password' });
      setError(new ApiClientError(response.error ?? ''));
      return 'error';
    } catch (err) {
      trackEvent('login', { status: 'error', method: 'password' });
      setError(err instanceof ApiClientError ? err : new ApiClientError(''));
      return 'error';
    } finally {
      setLoading(false);
    }
  };

  /** Second factor after `login`/`loginWithOAuth` returned 'mfa'. */
  const verifyMfa = async (code: string): Promise<boolean> => {
    if (!mfaToken) {
      setError(new ApiClientError('Sign-in expired. Please start again.'));
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.auth.verifyTwoFactor({ mfaToken, code });
      if (response.success && response.data) {
        trackEvent('login', { status: 'success', method: '2fa' });
        setMfaToken(null);
        await adoptSignedInUser(response.data, 'fill');
        return true;
      }
      setError(new ApiClientError(response.error ?? 'Invalid code'));
      return false;
    } catch (err) {
      setError(err instanceof ApiClientError ? err : new ApiClientError(''));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const cancelMfa = () => {
    setMfaToken(null);
    setError(null);
  };

  const loginWithOAuth = async (
    provider: OAuthProviderName,
    data: OAuthLoginDto,
  ): Promise<'ok' | 'mfa' | 'error'> => {
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    setMfaToken(null);
    try {
      const response = await api.auth.signInWithProvider(provider, data);
      if (response.success && response.data) {
        return await finishSignIn(response.data, provider);
      }
      trackEvent('login', { status: 'error', method: provider });
      setError(new ApiClientError(response.error ?? 'Unable to sign in'));
      return 'error';
    } catch (err) {
      trackEvent('login', { status: 'error', method: provider });
      setError(err instanceof ApiClientError ? err : new ApiClientError(''));
      return 'error';
    } finally {
      setLoading(false);
    }
  };

  const loginWithPasskey = async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    setMfaToken(null);
    try {
      const optionsRes = await api.auth.passkeyLoginOptions();
      if (!optionsRes.success || !optionsRes.data) {
        setError(new ApiClientError(optionsRes.error ?? 'Unable to start passkey sign-in'));
        return false;
      }
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const response = await startAuthentication({
        optionsJSON: optionsRes.data.options as never,
      });
      const verifyRes = await api.auth.passkeyLoginVerify({
        challengeId: optionsRes.data.challengeId,
        response: response as unknown as Record<string, unknown>,
      });
      if (verifyRes.success && verifyRes.data) {
        trackEvent('login', { status: 'success', method: 'passkey' });
        await adoptSignedInUser(verifyRes.data, 'fill');
        return true;
      }
      trackEvent('login', { status: 'error', method: 'passkey' });
      setError(new ApiClientError(verifyRes.error ?? 'Passkey sign-in failed'));
      return false;
    } catch (err) {
      // A dismissed authenticator prompt is not an error worth showing.
      if (err instanceof Error && err.name === 'NotAllowedError') return false;
      trackEvent('login', { status: 'error', method: 'passkey' });
      setError(err instanceof ApiClientError ? err : new ApiClientError(''));
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
      setError(new ApiClientError(response.error ?? 'Registration failed'));
      return false;
    } catch (err) {
      trackEvent('signup', { status: 'error' });
      setError(err instanceof ApiClientError ? err : new ApiClientError(''));
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
      setError(new ApiClientError(response.error ?? 'Email verification failed'));
      return false;
    } catch (err) {
      setError(err instanceof ApiClientError ? err : new ApiClientError(''));
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
      setError(new ApiClientError(response.error ?? 'Failed to resend confirmation email'));
      return false;
    } catch (err) {
      setError(err instanceof ApiClientError ? err : new ApiClientError(''));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const clearSignedInState = async () => {
    await disablePushOnThisDevice().catch(() => undefined);
    await clearAllLocalData().catch(() => undefined);
    localStorage.removeItem(PROFILE_CACHE_KEY);
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
      setError(new ApiClientError(response.error ?? 'Failed to request account deletion'));
      return false;
    } catch (err) {
      setError(err instanceof ApiClientError ? err : new ApiClientError(''));
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
        localStorage.removeItem(PROFILE_CACHE_KEY);
        setUser(loadGuestUser());
        setAuthMode('OFFLINE_LOCAL');
        setInfoMessage(
          response.data?.message ||
            'Your account and all associated workout data have been permanently deleted.',
        );
        return true;
      }
      setError(new ApiClientError(response.error ?? 'Failed to confirm account deletion'));
      return false;
    } catch (err) {
      setError(err instanceof ApiClientError ? err : new ApiClientError(''));
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
          setUser(toCachedProfile(res.data));
          writeProfileCache(res.data);
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
    writeProfileCache(next);
  };

  const continueOfflineLocal = () => {
    const guest = loadGuestUser();
    setUser(guest);
    setAuthMode('OFFLINE_LOCAL');
    writeProfileCache(guest);
  };

  const refreshUser = async () => {
    try {
      const res = await api.auth.me();
      if (res.success && res.data) {
        setUser(toCachedProfile(res.data));
        setAuthMode('AUTHENTICATED');
        writeProfileCache(res.data);
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
        mfaPending: mfaToken !== null,
        verifyMfa,
        cancelMfa,
        loginWithOAuth,
        loginWithPasskey,
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
