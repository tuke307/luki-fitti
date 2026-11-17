import { Module } from '@nestjs/common';
import { SocialAccessService } from './social-access.service';
import { SocialEnabledGuard } from './social-enabled.guard';

/**
 * Feature-gate module shared by the social, push and notifications modules without
 * creating a dependency cycle (social → notifications for fan-out, notifications →
 * this module for the guard).
 */
@Module({
  providers: [SocialAccessService, SocialEnabledGuard],
  exports: [SocialAccessService, SocialEnabledGuard],
})
export class SocialAccessModule {}
