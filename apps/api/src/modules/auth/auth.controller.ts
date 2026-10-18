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
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { CsrfGuard } from '@/guards/csrf.guard';
import { AuthGuard } from '@/guards/auth.guard';
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
import { REFRESH_TOKEN_EXPIRY_MS } from '@/config/env.config';
import {
  LoginSchema,
  RegisterSchema,
  ChangePasswordSchema,
  VerifyEmailSchema,
  ResendConfirmationSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  UpdatePreferencesSchema,
  type LoginDto,
  type RegisterDto,
  type RegisterResponseDto,
  type ChangePasswordDto,
  type VerifyEmailDto,
  type ResendConfirmationDto,
  type ForgotPasswordDto,
  type ResetPasswordDto,
  type UpdatePreferencesDto,
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

  private async issueSessionCookies(user: { id: string; email: string }, res: Response) {
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    const csrfToken = generateCsrfToken();

    await this.refreshTokenService.create({
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    });

    setCookie(res, 'accessToken', accessToken, accessTokenCookieOptions);
    setCookie(res, 'refreshToken', refreshToken, refreshTokenCookieOptions);
    setCookie(res, 'csrfToken', csrfToken, csrfCookieOptions);
  }

  private clearSessionCookies(res: Response) {
    setCookie(res, 'accessToken', null, accessTokenCookieOptions);
    setCookie(res, 'refreshToken', null, refreshTokenCookieOptions);
    setCookie(res, 'csrfToken', null, csrfCookieOptions);
  }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Register a new user account, initialize starter templates, and send confirmation email',
  })
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) body: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterResponseDto> {
    const result = await this.authService.registerUser(body);
    if (!result.requiresEmailConfirmation) {
      await this.issueSessionCookies(result, res);
    }
    return result;
  }

  @Post('verify-email')
  @Throttle({ default: { limit: 15, ttl: 600_000 } })
  @ApiOperation({ summary: 'Confirm user email address via token and sign in' })
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailSchema)) body: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const user = await this.authService.verifyEmail(body.token);
    await this.issueSessionCookies(user, res);
    return user;
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
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordDto,
  ) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Reset account password using a valid reset token' })
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Authenticate user with email & password' })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const user = await this.authService.authenticateUser(body.email, body.password);
    await this.issueSessionCookies(user, res);
    return user;
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

  @Post('logout')
  @UseGuards(AuthGuard, CsrfGuard)
  @ApiOperation({ summary: 'Log out and invalidate current session tokens' })
  async logout(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accessToken = req.cookies?.accessToken;
    if (accessToken) {
      try {
        const decoded = verifyAccessToken(accessToken);
        if (decoded.jti && decoded.exp) {
          const remainingSec = decoded.exp - Math.floor(Date.now() / 1000);
          if (remainingSec > 0) {
            await getRedis().set(`access_denylist:${decoded.jti}`, '1', 'EX', remainingSec);
          }
        }
      } catch {
        // Ignore already expired token
      }
    }

    await this.refreshTokenService.deleteByUserId(currentUser.id);
    this.clearSessionCookies(res);

    return { success: true };
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  async refreshToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;
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

    const claimed = await this.refreshTokenService.claimToken(refreshToken);
    if (!claimed) {
      await this.refreshTokenService.deleteByUserId(payload.id);
      this.clearSessionCookies(res);
      throw new ForbiddenException('Refresh token not found or already used');
    }

    await this.issueSessionCookies(user, res);
    return { success: true };
  }
}
