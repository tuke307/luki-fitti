import jwt, { JwtPayload } from 'jsonwebtoken';
import {
  ACCESS_TOKEN_EXPIRY_MS,
  getJwtRefreshSecret,
  getJwtSecret,
  MFA_TOKEN_EXPIRY_MS,
  REFRESH_TOKEN_EXPIRY_MS,
} from '@/config/env.config';
import crypto from 'crypto';
import type { UserPayloadDto } from '@luki-fitti/common/schemas';

export const JWT_ALGORITHM = 'HS512';

export const generateAccessToken = (user: { id: string; email: string }, sid?: string): string => {
  const payload = {
    id: user.id,
    email: user.email,
    ...(sid ? { sid } : {}),
    jti: crypto.randomBytes(16).toString('hex'),
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: Math.floor(ACCESS_TOKEN_EXPIRY_MS / 1000),
    algorithm: JWT_ALGORITHM,
  });
};

export const generateRefreshToken = (
  user: { id: string; email?: string },
  sid?: string,
): string => {
  const payload = {
    id: user.id,
    ...(sid ? { sid } : {}),
    jti: crypto.randomBytes(16).toString('hex'),
  };

  return jwt.sign(payload, getJwtRefreshSecret(), {
    expiresIn: Math.floor(REFRESH_TOKEN_EXPIRY_MS / 1000),
    algorithm: JWT_ALGORITHM,
  });
};

export const verifyAccessToken = (token: string): UserPayloadDto & JwtPayload => {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
  }) as UserPayloadDto & JwtPayload;
};

export const verifyRefreshToken = (token: string): UserPayloadDto & JwtPayload => {
  return jwt.verify(token, getJwtRefreshSecret(), {
    algorithms: [JWT_ALGORITHM],
  }) as UserPayloadDto & JwtPayload;
};

export const generateCsrfToken = (): string => {
  return crypto.randomBytes(24).toString('hex');
};

/**
 * Short-lived proof that the first factor (password / Google / Apple) succeeded and a 2FA
 * code is still owed. Signed with a key derived from the refresh secret, so it can never be
 * accepted as an access or refresh token.
 */
const mfaKey = () => `${getJwtRefreshSecret()}:mfa`;

export const generateMfaToken = (userId: string): string =>
  jwt.sign({ id: userId, purpose: 'mfa' }, mfaKey(), {
    expiresIn: Math.floor(MFA_TOKEN_EXPIRY_MS / 1000),
    algorithm: JWT_ALGORITHM,
  });

export const verifyMfaToken = (token: string): { id: string } => {
  const decoded = jwt.verify(token, mfaKey(), { algorithms: [JWT_ALGORITHM] }) as JwtPayload;
  if (decoded.purpose !== 'mfa' || typeof decoded.id !== 'string') {
    throw new Error('Invalid MFA token');
  }
  return { id: decoded.id };
};
