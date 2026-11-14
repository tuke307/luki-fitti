import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  MarkNotificationsReadSchema,
  NotificationsQuerySchema,
  type MarkNotificationsReadDto,
  type NotificationListDto,
  type NotificationsQueryDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { SocialEnabledGuard } from '../social/social-enabled.guard';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(AuthGuard, SocialEnabledGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'In-app inbox, newest first (keyset pagination via cursor)' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(NotificationsQuerySchema)) query: NotificationsQueryDto,
  ): Promise<NotificationListDto> {
    return this.notifications.list(user.id, query.cursor, query.limit);
  }

  @Post('read')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Mark notifications read: { ids } or { all: true }' })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(MarkNotificationsReadSchema)) body: MarkNotificationsReadDto,
  ) {
    return this.notifications.markRead(user.id, body);
  }
}
