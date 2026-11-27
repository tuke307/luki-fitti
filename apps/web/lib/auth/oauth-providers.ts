/**
 * Browser-side helpers for third-party sign-in: Google Identity Services and
 * Sign in with Apple JS. Scripts are lazy-loaded on demand so the login page
 * only pays for providers that are actually configured.
 */

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_SCRIPT_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

/** The fields the Google credential callback hands back. */
export interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  nonce?: string;
  use_fedcm_for_prompt?: boolean;
}

export interface GoogleButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  /** Pixels, 200–400 per GIS. Omit to size the button to its label. */
  width?: number;
  locale?: string;
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
}

export interface AppleSignInResponse {
  authorization: {
    id_token: string;
    code?: string;
    state?: string;
  };
  user?: {
    name?: { firstName?: string; lastName?: string };
    email?: string;
  };
}

interface AppleAuthInit {
  clientId: string;
  scope: string;
  redirectURI: string;
  usePopup: boolean;
  nonce?: string;
}

interface AppleAuth {
  init: (config: AppleAuthInit) => void;
  signIn: () => Promise<AppleSignInResponse>;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
    AppleID?: { auth: AppleAuth };
  }
}

const loadedScripts = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  let pending = loadedScripts.get(src);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loadedScripts.delete(src);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(script);
    });
    loadedScripts.set(src, pending);
  }
  return pending;
}

/** 32 random bytes, base64url — a fresh nonce per sign-in attempt. */
export function generateOAuthNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Renders the official Google button into `container`. Resolves when the button
 * exists; sign-in completion arrives via `onCredential` (ID token in
 * `response.credential`).
 */
export async function renderGoogleButton(
  container: HTMLElement,
  clientId: string,
  nonce: string,
  onCredential: (response: GoogleCredentialResponse) => void,
  options: GoogleButtonOptions = {},
): Promise<void> {
  await loadScript(GIS_SCRIPT_SRC);
  const id = window.google?.accounts.id;
  if (!id) throw new Error('Google Identity Services unavailable');
  id.initialize({
    client_id: clientId,
    callback: onCredential,
    nonce,
    use_fedcm_for_prompt: true,
  });
  container.replaceChildren();
  id.renderButton(container, { type: 'standard', size: 'large', ...options });
}

/** Resolves with Apple's authorization payload (`id_token`, optional profile on first consent). */
export async function signInWithApple(opts: {
  clientId: string;
  redirectURI: string;
  nonce: string;
}): Promise<AppleSignInResponse> {
  await loadScript(APPLE_SCRIPT_SRC);
  const auth = window.AppleID?.auth;
  if (!auth) throw new Error('Sign in with Apple JS unavailable');
  auth.init({
    clientId: opts.clientId,
    scope: 'name email',
    redirectURI: opts.redirectURI,
    usePopup: true,
    nonce: opts.nonce,
  });
  return auth.signIn();
}

/** Display name from Apple's (one-time) `user.name` payload, if present. */
export function appleUserName(response: AppleSignInResponse): string | undefined {
  const name = response.user?.name;
  const full = [name?.firstName, name?.lastName].filter(Boolean).join(' ').trim();
  return full || undefined;
}
