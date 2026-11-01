import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { CsrfGuard } from '@/guards/csrf.guard';
import { AuthGuard, extractBearerToken } from '@/guards/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import {
  generateAccessToken,
  generateCsrfToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '@/utils/jwt.util';
import { getRedis } from '@/utils/redis.util';
import { ACCESS_TOKEN_EXPIRY_MS, REFRESH_TOKEN_EXPIRY_MS } from '@/config/env.config';
import {
  LoginSchema,
  RegisterSchema,
  ChangePasswordSchema,
  VerifyEmailSchema,
  ResendConfirmationSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  RequestAccountDeletionSchema,
  ConfirmAccountDeletionSchema,
  UpdatePreferencesSchema,
  RefreshTokenBodySchema,
  DeviceSessionSchema,
  type LoginDto,
  type RegisterDto,
  type RegisterResponseDto,
  type ChangePasswordDto,
  type VerifyEmailDto,
  type ResendConfirmationDto,
  type ForgotPasswordDto,
  type ResetPasswordDto,
  type RequestAccountDeletionDto,
  type ConfirmAccountDeletionDto,
  type UpdatePreferencesDto,
  type RefreshTokenBodyDto,
  type DeviceSessionDto,
  type AuthTokensDto,
  type UserDto,
} from '@luki-fitti/common/schemas';
import {
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  csrfCookieOptions,
  setCookie,
} from '@/utils/cookie.util';

@ApiTags('Authentication & Account')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  /** Overridable in tests (avoids a Redis connection). */
  public denylistJti = async (jti: string, ttlSec: number): Promise<void> => {
    await getRedis().set(`access_denylist:${jti}`, '1', 'EX', ttlSec);
  };

  private async issueSessionCookies(
    user: { id: string; email: string },
    res: Response,
    opts: { familyId?: string; deviceLabel?: string | null; setCookies?: boolean } = {},
  ): Promise<AuthTokensDto> {
    const familyId = opts.familyId ?? randomUUID();
    const accessToken = generateAccessToken(user, familyId);
    const refreshToken = generateRefreshToken(user, familyId);

    await this.refreshTokenService.create({
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      familyId,
      deviceLabel: opts.deviceLabel ?? null,
    });

    if (opts.setCookies ?? true) {
      setCookie(res, 'accessToken', accessToken, accessTokenCookieOptions);
      setCookie(res, 'refreshToken', refreshToken, refreshTokenCookieOptions);
      setCookie(res, 'csrfToken', generateCsrfToken(), csrfCookieOptions);
    }

    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS).toISOString(),
    };
  }

  private resolveDeviceLabel(req: Request): string {
    const raw = (req.header('x-device-label') ?? req.header('x-client-platform') ?? 'web')
      .trim()
      .toLowerCase();
    return /^[a-z0-9-]{1,32}$/.test(raw) ? raw : 'unknown';
  }

  private async denylistAccessToken(req: Request): Promise<{ sid?: string }> {
    const accessToken = extractBearerToken(req) ?? (req.cookies?.accessToken as string | undefined);
    if (!accessToken) return {};
    try {
      const decoded = verifyAccessToken(accessToken);
      if (decoded.jti && decoded.exp) {
        const remainingSec = decoded.exp - Math.floor(Date.now() / 1000);
        if (remainingSec > 0) await this.denylistJti(decoded.jti, remainingSec);
      }
      return { sid: typeof decoded.sid === 'string' && decoded.sid ? decoded.sid : undefined };
    } catch {
      // Ignore already expired token
      return {};
    }
  }

  private clearSessionCookies(res: Response) {
    setCookie(res, 'accessToken', null, accessTokenCookieOptions);
    setCookie(res, 'refreshToken', null, refreshTokenCookieOptions);
    setCookie(res, 'csrfToken', null, csrfCookieOptions);
  }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({
    summary:
      'Register a new user account, initialize starter templates, and send confirmation email',
  })
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterResponseDto> {
    const result = await this.authService.registerUser(body);
    if (!result.requiresEmailConfirmation) {
      const tokens = await this.issueSessionCookies(result, res, {
        deviceLabel: this.resolveDeviceLabel(req),
      });
      return { ...result, tokens };
    }
    return result;
  }

  @Post('verify-email')
  @Throttle({ default: { limit: 15, ttl: 600_000 } })
  @ApiOperation({ summary: 'Confirm user email address via token and sign in' })
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailSchema)) body: VerifyEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const user = await this.authService.verifyEmail(body.token);
    const tokens = await this.issueSessionCookies(user, res, {
      deviceLabel: this.resolveDeviceLabel(req),
    });
    return { ...user, tokens };
  }

  @Post('resend-confirmation')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Resend account confirmation email' })
  async resendConfirmation(
    @Body(new ZodValidationPipe(ResendConfirmationSchema)) body: ResendConfirmationDto,
  ) {
    return this.authService.resendConfirmationEmail(body.email);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Request a password reset email link' })
  async forgotPassword(@Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Reset account password using a valid reset token' })
  async resetPassword(@Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Authenticate user with email & password' })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const user = await this.authService.authenticateUser(body.email, body.password);
    const tokens = await this.issueSessionCookies(user, res, {
      deviceLabel: this.resolveDeviceLabel(req),
    });
    return { ...user, tokens };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get authenticated user profile and preferences' })
  async getMe(@CurrentUser() currentUser: AuthenticatedUser): Promise<UserDto> {
    const user = await this.authService.getUserById(currentUser.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Patch('preferences')
  @UseGuards(AuthGuard, CsrfGuard)
  @ApiOperation({ summary: 'Update user profile name and training preferences' })
  async updatePreferences(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdatePreferencesSchema)) body: UpdatePreferencesDto,
  ): Promise<UserDto> {
    return this.authService.updatePreferences(currentUser.id, body);
  }

  @Post('change-password')
  @UseGuards(AuthGuard, CsrfGuard)
  @ApiOperation({ summary: 'Change account password and revoke other refresh tokens' })
  async changePassword(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) body: ChangePasswordDto,
  ) {
    return this.authService.changePassword(currentUser.id, body.currentPassword, body.newPassword);
  }

  @Post('request-delete-account')
  @UseGuards(AuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Verify password and send an account deletion confirmation link via email',
  })
  async requestDeleteAccount(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(RequestAccountDeletionSchema)) body: RequestAccountDeletionDto,
  ) {
    return this.authService.requestAccountDeletion(currentUser.id, body.password);
  }

  @Post('confirm-delete-account')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Confirm and permanently execute account deletion using the email confirmation token',
  })
  async confirmDeleteAccount(
    @Body(new ZodValidationPipe(ConfirmAccountDeletionSchema)) body: ConfirmAccountDeletionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.confirmAccountDeletion(body.token);
    await this.denylistAccessToken(req);

    this.clearSessionCookies(res);
    return {
      success: result.success,
      message: result.message,
    };
  }

  @Post('logout')
  @UseGuards(AuthGuard, CsrfGuard)
  @ApiOperation({ summary: 'Log out this device and revoke only its session' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(RefreshTokenBodySchema.optional())) body?: RefreshTokenBodyDto,
  ) {
    const { sid } = await this.denylistAccessToken(req);
    const refreshToken =
      body?.refreshToken?.trim() || (req.cookies?.refreshToken as string | undefined);
    if (sid) {
      await this.refreshTokenService.deleteByFamilyId(sid);
    } else if (refreshToken) {
      await this.refreshTokenService.deleteByHashedTokenOf(refreshToken);
    }
    this.clearSessionCookies(res);

    return { success: true };
  }

  @Post('logout-all')
  @UseGuards(AuthGuard, CsrfGuard)
  @ApiOperation({ summary: 'Log out all devices and revoke every refresh token of the user' })
  async logoutAll(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Other devices' access tokens stay valid until they expire (ACCESS_TOKEN_EXPIRY_MS).
    await this.denylistAccessToken(req);
    await this.refreshTokenService.deleteByUserId(currentUser.id);
    this.clearSessionCookies(res);

    return { success: true };
  }

  @Post('device-session')
  @UseGuards(AuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Issue an independent session for a companion device (e.g. Apple Watch)',
  })
  async createDeviceSession(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(DeviceSessionSchema)) body: DeviceSessionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.issueSessionCookies(currentUser, res, {
      deviceLabel: body.deviceLabel,
      setCookies: false,
    });
    return { success: true, tokens };
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(RefreshTokenBodySchema)) body?: RefreshTokenBodyDto,
  ) {
    const refreshToken =
      body?.refreshToken?.trim() || (req.cookies?.refreshToken as string | undefined);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    let payload: { id: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      this.clearSessionCookies(res);
      throw new ForbiddenException('Invalid refresh token');
    }

    if (!payload || typeof payload.id !== 'string' || !payload.id.trim()) {
      this.clearSessionCookies(res);
      throw new ForbiddenException('Invalid refresh token payload');
    }

    const user = await this.authService.getUserById(payload.id);
    if (!user) {
      this.clearSessionCookies(res);
      throw new NotFoundException('User not found');
    }

    const rotation = await this.refreshTokenService.rotate(refreshToken);
    if (rotation.status !== 'ok') {
      this.clearSessionCookies(res);
      throw new ForbiddenException('Refresh token not found or already used');
    }

    const tokens = await this.issueSessionCookies(user, res, {
      familyId: rotation.familyId,
      deviceLabel: rotation.deviceLabel,
    });
    return { success: true, tokens };
  }
}
