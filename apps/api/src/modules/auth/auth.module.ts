import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, RefreshTokenService],
  exports: [AuthService, RefreshTokenService],
})
export class AuthModule {}
