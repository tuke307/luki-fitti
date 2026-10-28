import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionService } from './session.service';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { RequestLocale } from '@/decorators/request-locale.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import {
  StartSessionSchema,
  SyncSessionPayloadSchema,
  type StartSessionDto,
  type SyncSessionPayloadDto,
} from '@luki-fitti/common/schemas';
import type { SessionStatus, SupportedLocale } from '@luki-fitti/common/enums';

@ApiTags('Active Gym Sessions & Diary Sync')
@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get the current in-progress or paused workout session' })
  async getActive(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionService.getActiveSession(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List training sessions for the workout diary' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: SessionStatus,
  ) {
    return this.sessionService.listSessions(user.id, { from, to, status });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Inspect a historical or active workout session' })
  async getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessionService.getSessionById(user.id, id);
  }

  @Post('start')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Start a persistent training session from a template or routine' })
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(StartSessionSchema)) body: StartSessionDto,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.sessionService.startSession(user.id, body, locale);
  }

  @Post('sync')
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Idempotently synchronize an active or completed offline session with conflict checks',
  })
  async sync(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SyncSessionPayloadSchema)) body: SyncSessionPayloadDto,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.sessionService.syncSession(user.id, body, locale);
  }

  @Put(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Correct or update a historical session' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SyncSessionPayloadSchema)) body: SyncSessionPayloadDto,
  ) {
    return this.sessionService.syncSession(user.id, { ...body, forceOverwrite: true });
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete or abandon a workout session' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessionService.deleteSession(user.id, id);
  }
}
