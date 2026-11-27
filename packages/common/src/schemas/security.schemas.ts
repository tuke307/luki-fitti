import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Account security: Google/Apple sign-in, passkeys and optional TOTP 2FA
// ─────────────────────────────────────────────────────────────────────────────

export const OAUTH_PROVIDERS = ['google', 'apple'] as const;
export const OAuthProviderSchema = z.enum(OAUTH_PROVIDERS);
export type OAuthProviderName = z.infer<typeof OAuthProviderSchema>;

/** `idToken` is the provider's OpenID token; `nonce` the raw nonce the client put into the request. */
export const OAuthLoginSchema = z.object({
  idToken: z.string().min(20).max(8192),
  nonce: z.string().min(8).max(256),
  /** Apple only sends the name on the very first sign-in, and only to the client. */
  name: z.string().trim().min(1).max(80).optional(),
  /** Apple's authorization code — exchanged for a revocable refresh token server-side. */
  authorizationCode: z.string().min(1).max(4096).optional(),
});
export type OAuthLoginDto = z.infer<typeof OAuthLoginSchema>;

/** TOTP code (6 digits) or a recovery code (`xxxxx-xxxxx`). */
export const SecondFactorCodeSchema = z.string().trim().min(6).max(24);

export const TwoFactorCodeSchema = z.object({ code: SecondFactorCodeSchema });
export type TwoFactorCodeDto = z.infer<typeof TwoFactorCodeSchema>;

export const TwoFactorVerifySchema = z.object({
  mfaToken: z.string().min(20).max(2048),
  code: SecondFactorCodeSchema,
});
export type TwoFactorVerifyDto = z.infer<typeof TwoFactorVerifySchema>;

/** WebAuthn JSON payloads are validated by @simplewebauthn/server; only the envelope is checked here. */
const WebAuthnResponseSchema = z.record(z.string(), z.unknown());

export const PasskeyRegisterVerifySchema = z.object({
  response: WebAuthnResponseSchema,
  name: z.string().trim().min(1).max(40).optional(),
});
export type PasskeyRegisterVerifyDto = z.infer<typeof PasskeyRegisterVerifySchema>;

export const PasskeyLoginVerifySchema = z.object({
  challengeId: z.string().min(16).max(128),
  response: WebAuthnResponseSchema,
});
export type PasskeyLoginVerifyDto = z.infer<typeof PasskeyLoginVerifySchema>;

export const PasskeyRenameSchema = z.object({ name: z.string().trim().min(1).max(40) });
export type PasskeyRenameDto = z.infer<typeof PasskeyRenameSchema>;

/** Returned by login/oauth instead of a session when the account has 2FA enabled. */
export interface MfaRequiredDto {
  mfaRequired: true;
  /** Short-lived token to be sent together with the code to `POST /auth/2fa/verify`. */
  mfaToken: string;
}

export interface PasskeyDto {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface SecurityStatusDto {
  hasPassword: boolean;
  providers: OAuthProviderName[];
  passkeys: PasskeyDto[];
  twoFactorEnabled: boolean;
  recoveryCodesRemaining: number;
}

export interface TwoFactorSetupDto {
  /** `otpauth://` URI to render as a QR code. */
  otpauthUrl: string;
  /** Base32 secret for manual entry. */
  secret: string;
}

export interface RecoveryCodesDto {
  /** Shown exactly once. */
  recoveryCodes: string[];
}

export interface PasskeyLoginOptionsDto {
  challengeId: string;
  options: Record<string, unknown>;
}
