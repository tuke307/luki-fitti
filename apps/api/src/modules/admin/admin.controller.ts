import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@luki-fitti/common/enums';
import {
  AdminUserQuerySchema,
  AiUsageQuerySchema,
  UpdateAiSettingsSchema,
  UpdateUserAccessSchema,
  type AdminUserQueryDto,
  type AiUsageQueryDto,
  type UpdateAiSettingsDto,
  type UpdateUserAccessDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { PermissionsGuard } from '@/guards/permissions.guard';
import { RequirePermissions } from '@/decorators/permissions.decorator';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly appSettings: AppSettingsService,
  ) {}

  @Get('dashboard')
  @RequirePermissions(AdminPermission.DASHBOARD_VIEW)
  @ApiOperation({ summary: 'Admin overview: users, activity and AI usage counters' })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  @RequirePermissions(AdminPermission.USERS_MANAGE)
  @ApiOperation({ summary: 'List users with their permissions and feature grants' })
  listUsers(@Query(new ZodValidationPipe(AdminUserQuerySchema)) query: AdminUserQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id/access')
  @UseGuards(CsrfGuard)
  @RequirePermissions(AdminPermission.USERS_MANAGE)
  @ApiOperation({ summary: "Replace a user's admin permissions and/or feature grants" })
  updateUserAccess(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserAccessSchema)) body: UpdateUserAccessDto,
  ) {
    return this.adminService.updateUserAccess(actor.id, id, body);
  }

  @Get('settings/ai')
  @RequirePermissions(AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Get AI feature switches, models and limits' })
  getAiSettings() {
    return this.appSettings.getAiSettings();
  }

  @Put('settings/ai')
  @UseGuards(CsrfGuard)
  @RequirePermissions(AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update AI feature switches, models and limits' })
  updateAiSettings(@Body(new ZodValidationPipe(UpdateAiSettingsSchema)) body: UpdateAiSettingsDto) {
    return this.appSettings.updateAiSettings(body);
  }

  @Get('ai-usage')
  @RequirePermissions(AdminPermission.DASHBOARD_VIEW, AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'AI run counts, tokens and cost over the last N days' })
  getAiUsage(@Query(new ZodValidationPipe(AiUsageQuerySchema)) query: AiUsageQueryDto) {
    return this.adminService.getAiUsage(query.days);
  }
}
