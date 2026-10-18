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
