import { Body, Controller, Delete, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DeletePushDeviceSchema,
  RegisterPushDeviceSchema,
  UpdatePushPreferencesSchema,
  type DeletePushDeviceDto,
  type RegisterPushDeviceDto,
  type UpdatePushPreferencesDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { SocialEnabledGuard } from '../social/social-enabled.guard';
import { PushService } from './push.service';

@ApiTags('Push')
@Controller('push')
@UseGuards(AuthGuard, SocialEnabledGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('config')
  @ApiOperation({ summary: 'Push channel availability + Web Push public key' })
  getConfig() {
    return this.push.getConfig();
  }

  @Put('devices')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Register/update a push device (upsert by token)' })
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(RegisterPushDeviceSchema)) body: RegisterPushDeviceDto,
  ) {
    return this.push.registerDevice(user.id, body);
  }

  @Delete('devices')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Unregister one of the own push devices by token' })
  deleteDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(DeletePushDeviceSchema)) body: DeletePushDeviceDto,
  ) {
    return this.push.deleteDevice(user.id, body);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Push category preferences' })
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.push.getPreferences(user.id);
  }

  @Patch('preferences')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Update push category preferences' })
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdatePushPreferencesSchema)) body: UpdatePushPreferencesDto,
  ) {
    return this.push.updatePreferences(user.id, body);
  }
}
