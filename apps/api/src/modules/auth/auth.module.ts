import { Module } from '@nestjs/common';
import { AppleTokenService } from './apple-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { PasskeyService } from './passkey.service';
import { RefreshTokenService } from './refresh-token.service';
import { SecurityController } from './security.controller';
import { TwoFactorService } from './two-factor.service';
import { EmailModule } from '../email/email.module';
import { BodyWeightModule } from '../body-weight/body-weight.module';

@Module({
  imports: [EmailModule, BodyWeightModule],
  controllers: [AuthController, SecurityController],
  providers: [
    AuthService,
    RefreshTokenService,
    TwoFactorService,
    PasskeyService,
    OAuthService,
    AppleTokenService,
  ],
  exports: [AuthService, RefreshTokenService],
})
export class AuthModule {}
