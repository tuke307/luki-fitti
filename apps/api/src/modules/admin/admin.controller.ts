import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@luki-fitti/common/enums';
import {
  AdminReportsQuerySchema,
  AdminUserQuerySchema,
  AiUsageQuerySchema,
  ResolveReportSchema,
  SetAiKeySchema,
  UpdateAiSettingsSchema,
  UpdateLeagueSettingsSchema,
  UpdateSocialSettingsSchema,
  UpdateUserAccessSchema,
  type AdminReportsQueryDto,
  type AdminUserQueryDto,
  type AdminUserAiKeyDto,
  type AiModelCatalogDto,
  type AiUsageQueryDto,
  type ResolveReportDto,
  type SetAiKeyDto,
  type UpdateAiSettingsDto,
  type UpdateLeagueSettingsDto,
  type UpdateSocialSettingsDto,
  type UpdateUserAccessDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { PermissionsGuard } from '@/guards/permissions.guard';
import { RequirePermissions } from '@/decorators/permissions.decorator';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AiKeyService } from '../ai/ai-key.service';
import { OpenRouterModelsService } from '../ai/openrouter-models.service';
import { LeagueService } from '../league/league.service';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly appSettings: AppSettingsService,
    private readonly aiKeys: AiKeyService,
    private readonly modelCatalog: OpenRouterModelsService,
    private readonly leagueService: LeagueService,
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

  @Get('users/:id/ai-key')
  @RequirePermissions(AdminPermission.USERS_MANAGE)
  @ApiOperation({ summary: "Status of a user's OpenRouter keys (never the key values)" })
  getUserAiKey(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminUserAiKeyDto> {
    return this.aiKeys.adminStatus(id);
  }

  @Put('users/:id/ai-key')
  @UseGuards(CsrfGuard)
  @RequirePermissions(AdminPermission.USERS_MANAGE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Assign an OpenRouter key to a user (stored encrypted, ADMIN slot)' })
  setUserAiKey(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(SetAiKeySchema)) body: SetAiKeyDto,
  ): Promise<AdminUserAiKeyDto> {
    return this.aiKeys.setAdminKey(actor.id, id, body.apiKey);
  }

  @Delete('users/:id/ai-key')
  @UseGuards(CsrfGuard)
  @RequirePermissions(AdminPermission.USERS_MANAGE)
  @ApiOperation({ summary: "Remove the admin-assigned OpenRouter key (the user's own key stays)" })
  clearUserAiKey(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdminUserAiKeyDto> {
    return this.aiKeys.clearAdminKey(actor.id, id);
  }

  @Get('settings/ai')
  @RequirePermissions(AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Get AI feature switches, models and limits' })
  getAiSettings() {
    return this.appSettings.getAiSettings();
  }

  @Get('settings/ai/models')
  @RequirePermissions(AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'OpenRouter model catalog for the user model allowlist editor' })
  async getAiModelCatalog(): Promise<AiModelCatalogDto> {
    const { available, models } = await this.modelCatalog.catalog();
    return { catalogAvailable: available, models };
  }

  @Put('settings/ai')
  @UseGuards(CsrfGuard)
  @RequirePermissions(AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update AI feature switches, models and limits' })
  updateAiSettings(@Body(new ZodValidationPipe(UpdateAiSettingsSchema)) body: UpdateAiSettingsDto) {
    return this.appSettings.updateAiSettings(body);
  }

  @Get('settings/social')
  @RequirePermissions(AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Social kill switch and beta allowlist' })
  getSocialSettings() {
    return this.appSettings.getSocialSettings();
  }

  @Put('settings/social')
  @UseGuards(CsrfGuard)
  @RequirePermissions(AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update social kill switch and beta allowlist' })
  updateSocialSettings(
    @Body(new ZodValidationPipe(UpdateSocialSettingsSchema)) body: UpdateSocialSettingsDto,
  ) {
    return this.appSettings.updateSocialSettings(body);
  }

  @Get('reports')
  @RequirePermissions(AdminPermission.USERS_MANAGE)
  @ApiOperation({ summary: 'UGC moderation queue (user reports)' })
  listReports(@Query(new ZodValidationPipe(AdminReportsQuerySchema)) query: AdminReportsQueryDto) {
    return this.adminService.listReports(query);
  }

  @Get('reports/:id/avatar')
  @RequirePermissions(AdminPermission.USERS_MANAGE)
  @ApiOperation({ summary: "Stream a report's avatar evidence copy" })
  async getReportAvatar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const body = await this.adminService.getReportAvatar(id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Stored avatars are always re-encoded JPEGs; never echo a stored content type.
    return new StreamableFile(body, { type: 'image/jpeg', disposition: 'inline' });
  }

  @Patch('reports/:id')
  @UseGuards(CsrfGuard)
  @RequirePermissions(AdminPermission.USERS_MANAGE)
  @ApiOperation({ summary: 'Resolve/dismiss a report, optionally clearing avatar or handle' })
  resolveReport(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ResolveReportSchema)) body: ResolveReportDto,
  ) {
    return this.adminService.resolveReport(actor.id, id, body);
  }

  @Get('settings/leagues')
  @RequirePermissions(AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'League rollout settings (kill switch, stage, cohort size, caps)' })
  getLeagueSettings() {
    return this.appSettings.getLeagueSettings();
  }

  @Put('settings/leagues')
  @UseGuards(CsrfGuard)
  @RequirePermissions(AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update league rollout settings' })
  updateLeagueSettings(
    @Body(new ZodValidationPipe(UpdateLeagueSettingsSchema)) body: UpdateLeagueSettingsDto,
  ) {
    return this.appSettings.updateLeagueSettings(body);
  }

  @Get('leagues/preview')
  @RequirePermissions(AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Dry-run of the next weekly league rollover' })
  leaguePreview() {
    return this.leagueService.adminPreview();
  }

  @Get('ai-usage')
  @RequirePermissions(AdminPermission.DASHBOARD_VIEW, AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'AI run counts, tokens and cost over the last N days' })
  getAiUsage(@Query(new ZodValidationPipe(AiUsageQuerySchema)) query: AiUsageQueryDto) {
    return this.adminService.getAiUsage(query.days);
  }

  @Get('ai-usage/users/:userId')
  @RequirePermissions(AdminPermission.DASHBOARD_VIEW, AdminPermission.AI_SETTINGS_MANAGE)
  @ApiOperation({ summary: "One user's AI runs, tokens and cost over the last N days" })
  getUserAiUsage(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query(new ZodValidationPipe(AiUsageQuerySchema)) query: AiUsageQueryDto,
  ) {
    return this.adminService.getUserAiUsage(userId, query.days);
  }
}
