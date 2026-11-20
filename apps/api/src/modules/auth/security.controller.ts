import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { generateMfaToken, verifyMfaToken } from '@/utils/jwt.util';
import {
  OAuthLoginSchema,
  OAuthProviderSchema,
  PasskeyLoginVerifySchema,
  PasskeyRegisterVerifySchema,
  PasskeyRenameSchema,
  TwoFactorCodeSchema,
  TwoFactorVerifySchema,
  type MfaRequiredDto,
  type OAuthLoginDto,
  type OAuthProviderName,
  type PasskeyDto,
  type PasskeyLoginOptionsDto,
  type PasskeyLoginVerifyDto,
  type PasskeyRegisterVerifyDto,
  type PasskeyRenameDto,
  type RecoveryCodesDto,
  type SecurityStatusDto,
  type TwoFactorCodeDto,
  type TwoFactorSetupDto,
  type TwoFactorVerifyDto,
  type UserDto,
} from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { PasskeyService } from './passkey.service';
import { RefreshTokenService } from './refresh-token.service';
import { issueSession, resolveDeviceLabel } from './session.helper';
import { TwoFactorService } from './two-factor.service';

const providerPipe = new ZodValidationPipe(OAuthProviderSchema);

@ApiTags('Account security')
@Controller('auth')
export class SecurityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly oauth: OAuthService,
    private readonly passkeys: PasskeyService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  /** Session for a first factor that passed; accounts with 2FA get an MFA challenge instead. */
  private async completeLogin(
    user: UserDto,
    req: Request,
    res: Response,
    { skipMfa = false } = {},
  ): Promise<UserDto | MfaRequiredDto> {
    if (!skipMfa && (await this.twoFactor.isEnabled(user.id))) {
      return { mfaRequired: true, mfaToken: generateMfaToken(user.id) };
    }
    const tokens = await issueSession(this.refreshTokens, user, res, {
      deviceLabel: resolveDeviceLabel(req),
    });
    return { ...user, tokens };
  }

  // ── Overview ───────────────────────────────────────────────────────────────

  @Get('security')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Sign-in methods, passkeys and 2FA state of the signed-in user' })
  async status(@CurrentUser() current: AuthenticatedUser): Promise<SecurityStatusDto> {
    const [user, accounts, passkeys, twoFactorEnabled, recoveryCodesRemaining] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: current.id },
        select: { passwordHash: true },
      }),
      this.prisma.oAuthAccount.findMany({ where: { userId: current.id } }),
      this.passkeys.list(current.id),
      this.twoFactor.isEnabled(current.id),
      this.twoFactor.recoveryCodesRemaining(current.id),
    ]);
    if (!user) throw new NotFoundException('User not found');
    return {
      hasPassword: !!user.passwordHash,
      providers: accounts.map((a) => a.provider.toLowerCase() as OAuthProviderName),
      passkeys,
      twoFactorEnabled,
      recoveryCodesRemaining,
    };
  }

  // ── Google / Apple ─────────────────────────────────────────────────────────

  @Post('oauth/:provider')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Sign in or up with a Google/Apple ID token' })
  async oauthLogin(
    @Param('provider', providerPipe) provider: OAuthProviderName,
    @Body(new ZodValidationPipe(OAuthLoginSchema)) body: OAuthLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.oauth.signIn(provider, body);
    return this.completeLogin(user, req, res);
  }

  @Post('oauth/:provider/link')
  @UseGuards(AuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Link a Google/Apple account to the signed-in user' })
  async oauthLink(
    @CurrentUser() current: AuthenticatedUser,
    @Param('provider', providerPipe) provider: OAuthProviderName,
    @Body(new ZodValidationPipe(OAuthLoginSchema)) body: OAuthLoginDto,
  ) {
    await this.oauth.link(current.id, provider, body);
    return { success: true };
  }

  @Delete('oauth/:provider')
  @UseGuards(AuthGuard, CsrfGuard)
  @ApiOperation({ summary: 'Unlink a Google/Apple account' })
  async oauthUnlink(
    @CurrentUser() current: AuthenticatedUser,
    @Param('provider', providerPipe) provider: OAuthProviderName,
  ) {
    await this.oauth.unlink(current.id, provider);
    return { success: true };
  }

  // ── Two-factor (optional TOTP) ─────────────────────────────────────────────

  @Post('2fa/verify')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Finish a login that asked for a second factor' })
  async verifyTwoFactor(
    @Body(new ZodValidationPipe(TwoFactorVerifySchema)) body: TwoFactorVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let userId: string;
    try {
      userId = verifyMfaToken(body.mfaToken).id;
    } catch {
      throw new UnauthorizedException('Sign-in expired. Please start again.');
    }
    if (!(await this.twoFactor.verify(userId, body.code))) {
      throw new UnauthorizedException('Invalid code');
    }
    const user = await this.authService.getUserById(userId);
    if (!user) throw new UnauthorizedException('Sign-in expired. Please start again.');
    return this.completeLogin(user, req, res, { skipMfa: true });
  }

  @Post('2fa/setup')
  @UseGuards(AuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Start 2FA setup: returns the secret and the otpauth URL' })
  setupTwoFactor(@CurrentUser() current: AuthenticatedUser): Promise<TwoFactorSetupDto> {
    return this.twoFactor.setup(current);
  }

  @Post('2fa/enable')
  @UseGuards(AuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Confirm the first code, turn 2FA on and get recovery codes' })
  enableTwoFactor(
    @CurrentUser() current: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorCodeSchema)) body: TwoFactorCodeDto,
  ): Promise<RecoveryCodesDto> {
    return this.twoFactor.enable(current.id, body.code);
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Turn 2FA off (needs a current code or recovery code)' })
  async disableTwoFactor(
    @CurrentUser() current: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorCodeSchema)) body: TwoFactorCodeDto,
  ) {
    await this.twoFactor.disable(current.id, body.code);
    return { success: true };
  }

  @Post('2fa/recovery-codes')
  @UseGuards(AuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Replace the recovery codes (needs a current code)' })
  regenerateRecoveryCodes(
    @CurrentUser() current: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorCodeSchema)) body: TwoFactorCodeDto,
  ): Promise<RecoveryCodesDto> {
    return this.twoFactor.regenerateRecoveryCodes(current.id, body.code);
  }

  // ── Passkeys ───────────────────────────────────────────────────────────────

  @Post('passkeys/register/options')
  @UseGuards(AuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @ApiOperation({ summary: 'WebAuthn creation options for a new passkey' })
  async passkeyRegisterOptions(@CurrentUser() current: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: current.id },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.passkeys.registrationOptions(user);
  }

  @Post('passkeys/register/verify')
  @UseGuards(AuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @ApiOperation({ summary: 'Verify the authenticator response and store the passkey' })
  passkeyRegisterVerify(
    @CurrentUser() current: AuthenticatedUser,
    @Body(new ZodValidationPipe(PasskeyRegisterVerifySchema)) body: PasskeyRegisterVerifyDto,
  ): Promise<PasskeyDto> {
    return this.passkeys.verifyRegistration(current.id, body.response, body.name);
  }

  @Post('passkeys/login/options')
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  @ApiOperation({ summary: 'WebAuthn request options for passwordless sign-in' })
  passkeyLoginOptions(): Promise<PasskeyLoginOptionsDto> {
    return this.passkeys.loginOptions();
  }

  @Post('passkeys/login/verify')
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @ApiOperation({ summary: 'Sign in with a passkey (user verification replaces 2FA)' })
  async passkeyLoginVerify(
    @Body(new ZodValidationPipe(PasskeyLoginVerifySchema)) body: PasskeyLoginVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.passkeys.verifyLogin(body.challengeId, body.response);
    const user = await this.authService.getUserById(userId);
    if (!user) throw new UnauthorizedException('Unknown passkey');
    return this.completeLogin(user, req, res, { skipMfa: true });
  }

  @Patch('passkeys/:id')
  @UseGuards(AuthGuard, CsrfGuard)
  @ApiOperation({ summary: 'Rename a passkey' })
  renamePasskey(
    @CurrentUser() current: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PasskeyRenameSchema)) body: PasskeyRenameDto,
  ): Promise<PasskeyDto> {
    return this.passkeys.rename(current.id, id, body.name);
  }

  @Delete('passkeys/:id')
  @UseGuards(AuthGuard, CsrfGuard)
  @ApiOperation({ summary: 'Remove a passkey' })
  async deletePasskey(@CurrentUser() current: AuthenticatedUser, @Param('id') id: string) {
    await this.passkeys.remove(current.id, id);
    return { success: true };
  }
}
