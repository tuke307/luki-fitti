import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { Throttle } from '@nestjs/throttler';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  ContactMatchSchema,
  CreateBlockSchema,
  CreateReportSchema,
  FriendRequestSchema,
  SocialSearchQuerySchema,
  UpdateSocialProfileSchema,
  type ContactMatchDto,
  type CreateBlockDto,
  type CreateReportDto,
  type FriendRequestDto,
  type SocialSearchQueryDto,
  type UpdateSocialProfileDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { SocialEnabledGuard } from './social-enabled.guard';
import { SocialService } from './social.service';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

@ApiTags('Social')
@Controller('social')
@UseGuards(AuthGuard, SocialEnabledGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('me')
  @ApiOperation({ summary: 'Own social profile' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.social.getMe(user.id);
  }

  @Patch('me')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Update handle (30-day cooldown), name, discovery and pause flags' })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateSocialProfileSchema)) body: UpdateSocialProfileDto,
  ) {
    return this.social.updateMe(user.id, body);
  }

  @Get('handles/:handle/availability')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check whether a handle is free and allowed' })
  handleAvailability(@CurrentUser() user: AuthenticatedUser, @Param('handle') handle: string) {
    return this.social.handleAvailability(user.id, handle);
  }

  @Put('me/avatar')
  @UseGuards(CsrfGuard)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload or replace the avatar (≤ 2 MB, re-encoded 512px JPEG)' })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_BYTES },
    }),
  )
  setAvatar(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: Express.Multer.File) {
    return this.social.setAvatar(user.id, file);
  }

  @Delete('me/avatar')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Remove the avatar' })
  deleteAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.social.deleteAvatar(user.id);
  }

  @Get('avatars/:userId')
  @ApiOperation({ summary: "Stream a user's avatar (hidden when blocked/no handle)" })
  async getAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const body = await this.social.getAvatar(user.id, userId);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Stored avatars are always re-encoded JPEGs; never echo a stored content type.
    return new StreamableFile(body, { type: 'image/jpeg', disposition: 'inline' });
  }

  @Get('users/:handle')
  @ApiOperation({ summary: 'Public card + relation for a @handle' })
  getUser(@CurrentUser() user: AuthenticatedUser, @Param('handle') handle: string) {
    return this.social.getUserByHandle(user.id, handle);
  }

  @Get('search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Handle prefix search (min 2 chars, max 20 results)' })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(SocialSearchQuerySchema)) query: SocialSearchQueryDto,
  ) {
    return this.social.search(user.id, query.q);
  }

  @Get('friends')
  @ApiOperation({ summary: 'Friends, incoming and outgoing requests' })
  listFriends(@CurrentUser() user: AuthenticatedUser) {
    return this.social.listFriends(user.id);
  }

  @Post('friends/requests')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Send a friend request (auto-accepts a reverse pending request)' })
  sendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(FriendRequestSchema)) body: FriendRequestDto,
  ) {
    return this.social.sendRequest(user.id, body.userId);
  }

  @Post('friends/requests/:userId/accept')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Accept an incoming friend request' })
  acceptRequest(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.social.acceptRequest(user.id, userId);
  }

  @Post('friends/requests/:userId/decline')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Decline an incoming friend request (silent)' })
  declineRequest(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.social.declineRequest(user.id, userId);
  }

  @Delete('friends/:userId')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Unfriend or cancel an outgoing request (silent)' })
  removeFriend(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.social.removeFriend(user.id, userId);
  }

  @Post('invites')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create a friend-invite link (token stored as SHA-256 only)' })
  createInvite(@CurrentUser() user: AuthenticatedUser) {
    return this.social.createInvite(user.id);
  }

  @Get('invites/:token')
  @ApiOperation({ summary: "Preview the inviter's card for an invite token" })
  previewInvite(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.social.previewInvite(user.id, token);
  }

  @Post('invites/:token/accept')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Accept an invite → instant ACCEPTED friendship' })
  acceptInvite(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.social.acceptInvite(user.id, token);
  }

  @Post('contacts/match')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Match SHA-256 email hashes against opted-in users (hashes never stored)',
  })
  matchContacts(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ContactMatchSchema)) body: ContactMatchDto,
  ) {
    return this.social.matchContacts(user.id, body.hashes);
  }

  @Get('blocks')
  @ApiOperation({ summary: 'Users blocked by me' })
  listBlocks(@CurrentUser() user: AuthenticatedUser) {
    return this.social.listBlocks(user.id);
  }

  @Post('blocks')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Block a user (also removes the friendship in one transaction)' })
  createBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateBlockSchema)) body: CreateBlockDto,
  ) {
    return this.social.createBlock(user.id, body.userId);
  }

  @Delete('blocks/:userId')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Unblock a user' })
  deleteBlock(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.social.deleteBlock(user.id, userId);
  }

  @Post('reports')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Report a user for moderation (snapshots handle/name/avatar)' })
  createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateReportSchema)) body: CreateReportDto,
  ) {
    return this.social.createReport(user.id, body.userId, body.reason, body.details);
  }
}
