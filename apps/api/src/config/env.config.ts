import { logger } from '@luki-fitti/logger';

export const API_PORT = process.env.API_PORT || 3001;
export const NODE_ENV = process.env.NODE_ENV || 'development';

const isProduction = NODE_ENV === 'production';

const INSECURE_SECRET_VALUES = new Set([
  'your-jwt-secret-key',
  'your-jwt-refresh-secret-key',
  'secret',
  '',
]);

function resolveJwtSecret(envValue: string | undefined, name: string): string {
  const value = (envValue ?? '').trim();
  if (value.length >= 32 && !INSECURE_SECRET_VALUES.has(value)) {
    return value;
  }
  if (isProduction) {
    throw new Error(
      `${name} must be set to a high-entropy secret of at least 32 characters in production. Refusing to start.`,
    );
  }
  logger.warn(
    `${name} is missing or insecure — falling back to a dev-only default. NEVER use this in production.`,
  );
  return `dev-only-insecure-${name.toLowerCase()}-do-not-use-in-production`;
}

export const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
export const ACCESS_TOKEN_EXPIRY_MS = Number(process.env.ACCESS_TOKEN_EXPIRY_MS) || 900000;

let _jwtSecret: string | undefined;
export function getJwtSecret(): string {
  if (_jwtSecret === undefined) _jwtSecret = resolveJwtSecret(process.env.JWT_SECRET, 'JWT_SECRET');
  return _jwtSecret;
}

let _jwtRefreshSecret: string | undefined;
export function getJwtRefreshSecret(): string {
  if (_jwtRefreshSecret === undefined) {
    _jwtRefreshSecret = resolveJwtSecret(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET');
  }
  return _jwtRefreshSecret;
}

export const REFRESH_TOKEN_EXPIRY_MS = Number(process.env.REFRESH_TOKEN_EXPIRY_MS) || 604800000;

export const DATABASE_URL =
  process.env.DATABASE_URL || `postgresql://postgres:postgres@localhost:5432/luki_fitti`;

export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Email & BullMQ Configuration
export const SMTP_HOST = process.env.SMTP_HOST || 'localhost';
export const SMTP_PORT = Number(process.env.SMTP_PORT) || 1025;
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const SMTP_REJECT_UNAUTHORIZED = process.env.SMTP_REJECT_UNAUTHORIZED !== 'false';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@lukifitti.app';
export const EMAIL_MAX_ATTEMPTS = Number(process.env.EMAIL_MAX_ATTEMPTS) || 3;
export const EMAIL_RETRY_DELAY_MS = Number(process.env.EMAIL_RETRY_DELAY_MS) || 5000;

export const EMAIL_VERIFICATION_EXPIRY_MS =
  Number(process.env.EMAIL_VERIFICATION_EXPIRY_MS) || 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_EXPIRY_MS =
  Number(process.env.PASSWORD_RESET_EXPIRY_MS) || 60 * 60 * 1000;
export const ACCOUNT_DELETION_EXPIRY_MS =
  Number(process.env.ACCOUNT_DELETION_EXPIRY_MS) || 60 * 60 * 1000;

// Web analytics (self-hosted Umami, pageviews only). Forwarding is disabled unless
// NODE_ENV=production and UMAMI_WEBSITE_ID is set.
const DEFAULT_UMAMI_URL = 'https://umami.tony-luke.de';

function resolveUmamiUrl(envValue: string | undefined): string {
  const raw = (envValue ?? '').trim();
  if (!raw) return DEFAULT_UMAMI_URL;
  try {
    const parsed = new URL(raw);
    // Operator-configured target only; still require HTTPS so pageview data
    // (incl. the visitor IP header) is never sent in clear text.
    if (parsed.protocol !== 'https:' && isProduction) {
      logger.warn('UMAMI_URL must use https — falling back to the default Umami URL.');
      return DEFAULT_UMAMI_URL;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    logger.warn('UMAMI_URL is not a valid URL — falling back to the default Umami URL.');
    return DEFAULT_UMAMI_URL;
  }
}

export const UMAMI_URL = resolveUmamiUrl(process.env.UMAMI_URL);
export const UMAMI_WEBSITE_ID = (process.env.UMAMI_WEBSITE_ID ?? '').trim();
export const UMAMI_ALLOWED_HOSTNAMES = (
  process.env.UMAMI_ALLOWED_HOSTNAMES || 'luki-fitti.tony-luke.de'
)
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

// AI (OpenRouter, OpenAI-compatible). There is no global provider key: every user brings their
// own key (or gets one assigned by an admin). Keys are stored AES-256-GCM encrypted with this
// 32-byte master key (base64 or hex; generate with `openssl rand -base64 32`).
// TODO: Configure AI_KEY_ENCRYPTION_KEY (and optionally AI_KEY_ENCRYPTION_KEY_PREVIOUS during a
// rotation) in your secret store. Without it, keys can't be stored and AI features stay off.
function parseEncryptionKey(envValue: string | undefined, name: string): Buffer | null {
  const raw = (envValue ?? '').trim();
  if (!raw) return null;
  const decoded = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (decoded.length !== 32) {
    // Never log the value itself.
    const message = `${name} must be 32 bytes (base64 or hex encoded).`;
    if (isProduction) throw new Error(`${message} Refusing to start.`);
    logger.warn(`${message} Per-user AI keys are disabled.`);
    return null;
  }
  return decoded;
}

export interface AiKeyEncryptionConfig {
  /** Current master key (encrypts new keys) with its version. */
  current: { version: number; key: Buffer } | null;
  /** Previous master key, only used to decrypt keys not yet re-encrypted. */
  previous: { version: number; key: Buffer } | null;
}

let _aiKeyEncryption: AiKeyEncryptionConfig | undefined;
export function getAiKeyEncryptionConfig(): AiKeyEncryptionConfig {
  if (_aiKeyEncryption === undefined) {
    const current = parseEncryptionKey(process.env.AI_KEY_ENCRYPTION_KEY, 'AI_KEY_ENCRYPTION_KEY');
    const previous = parseEncryptionKey(
      process.env.AI_KEY_ENCRYPTION_KEY_PREVIOUS,
      'AI_KEY_ENCRYPTION_KEY_PREVIOUS',
    );
    // Bump AI_KEY_ENCRYPTION_KEY_VERSION when rotating (old key → AI_KEY_ENCRYPTION_KEY_PREVIOUS).
    const version = Math.max(1, Math.trunc(Number(process.env.AI_KEY_ENCRYPTION_KEY_VERSION) || 1));
    if (!current) {
      logger.warn(
        'AI_KEY_ENCRYPTION_KEY is not set — per-user AI keys and AI features are disabled.',
      );
    }
    _aiKeyEncryption = {
      current: current ? { version, key: current } : null,
      previous: previous && current ? { version: version - 1, key: previous } : null,
    };
  }
  return _aiKeyEncryption;
}

/** Test hook: forget the cached encryption config so env changes take effect. */
export function resetAiKeyEncryptionConfigForTests(): void {
  _aiKeyEncryption = undefined;
}

export const OPENROUTER_BASE_URL = (() => {
  const raw = (process.env.OPENROUTER_BASE_URL ?? '').trim() || 'https://openrouter.ai/api/v1';
  try {
    const parsed = new URL(raw);
    // http is only accepted for a local mock outside production (tests); prompts carry user data.
    const isLocalMock = !isProduction && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !isLocalMock) {
      throw new Error('OPENROUTER_BASE_URL must use https');
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch (err) {
    logger.warn(`Invalid OPENROUTER_BASE_URL (${String(err)}) — using the default.`);
    return 'https://openrouter.ai/api/v1';
  }
})();
export const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS) || 60_000;

// Object storage for meal photos (SeaweedFS, S3-compatible; same variables as kds/marienmuehle).
// Photos are optional: without storage, analysis still works but photos are not kept.
// TODO: Configure SEAWEEDFS_* in your environment / secret store.
export const SEAWEEDFS_ENDPOINT = (process.env.SEAWEEDFS_ENDPOINT ?? '')
  .trim()
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');
export const SEAWEEDFS_USE_SSL = process.env.SEAWEEDFS_USE_SSL !== 'false';
export const SEAWEEDFS_PORT =
  Number(process.env.SEAWEEDFS_PORT) || (SEAWEEDFS_USE_SSL ? 443 : 8333);
export const SEAWEEDFS_ACCESS_KEY_API = (process.env.SEAWEEDFS_ACCESS_KEY_API ?? '').trim();
export const SEAWEEDFS_SECRET_KEY_API = (process.env.SEAWEEDFS_SECRET_KEY_API ?? '').trim();
export const SEAWEEDFS_BUCKET =
  (process.env.SEAWEEDFS_BUCKET ?? '').trim() || 'luki-fitti-meal-photos';
