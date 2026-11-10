import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  AttachProgressPhotoSchema,
  MEAL_PHOTO_MAX_BYTES,
  MEAL_PHOTO_MIME_TYPES,
  ProgressCheckInRangeQuerySchema,
  UpsertProgressCheckInSchema,
  type AttachProgressPhotoDto,
  type ProgressCheckInRangeQueryDto,
  type UpsertProgressCheckInDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { ProgressService } from './progress.service';

const ALLOWED_UPLOAD_TYPES = new Set<string>(MEAL_PHOTO_MIME_TYPES);

/** Dated body check-ins with pose photos: available to every signed-in user. */
@ApiTags('Progress')
@Controller('progress')
@UseGuards(AuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('check-ins')
  @ApiOperation({ summary: 'List progress check-ins taken in [from, to)' })
  listCheckIns(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ProgressCheckInRangeQuerySchema))
    query: ProgressCheckInRangeQueryDto,
  ) {
    return this.progressService.listCheckIns(user.id, query.from, query.to);
  }

  @Put('check-ins')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create or replace a check-in by its client id (offline-safe)' })
  upsertCheckIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpsertProgressCheckInSchema)) body: UpsertProgressCheckInDto,
  ) {
    return this.progressService.upsertCheckIn(user.id, body);
  }

  @Delete('check-ins/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete a check-in (row id or clientEntryId) including its photos' })
  deleteCheckIn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.progressService.deleteCheckIn(user.id, id);
  }

  @Post('check-ins/:clientEntryId/photos')
  @UseGuards(CsrfGuard)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload or replace one pose photo of a check-in' })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: MEAL_PHOTO_MAX_BYTES },
      // First-line filter only; the real check is magic-byte detection + re-encoding.
      fileFilter: (_req, file, cb) => cb(null, ALLOWED_UPLOAD_TYPES.has(file.mimetype)),
    }),
  )
  attachPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientEntryId') clientEntryId: string,
    @Body(new ZodValidationPipe(AttachProgressPhotoSchema)) body: AttachProgressPhotoDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.progressService.attachPhoto(user.id, clientEntryId, body, file);
  }

  @Get('photos/:id')
  @ApiOperation({ summary: "Stream one of the user's progress photos" })
  async getPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.progressService.getPhoto(user.id, id);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Stored objects are always re-encoded JPEGs; never echo an arbitrary stored content type.
    return new StreamableFile(photo.body, { type: 'image/jpeg', disposition: 'inline' });
  }

  @Delete('photos/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete a single progress photo' })
  deletePhoto(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.progressService.deletePhoto(user.id, id);
  }
}
