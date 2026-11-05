import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '@/decorators/current-user.decorator';

const IMPORT_RATE_LIMIT = 'importRateLimit';
const HOUR_MS = 60 * 60 * 1000;

export interface ImportRateLimit {
  name: string;
  limit: number;
  ttlMs?: number;
}

export const ImportRateLimited = (options: ImportRateLimit) =>
  SetMetadata(IMPORT_RATE_LIMIT, options);

/**
 * Per-user limit for the import routes. The global ThrottlerGuard runs before authentication
 * and can only key by IP, so this guard runs after AuthGuard and keys by the session user.
 */
@Injectable()
export class ImportRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly storage: ThrottlerStorageService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<ImportRateLimit | undefined>(
      IMPORT_RATE_LIMIT,
      context.getHandler(),
    );
    if (!options) return true;
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('User session required');

    const ttl = options.ttlMs ?? HOUR_MS;
    const { totalHits } = await this.storage.increment(
      `import:${options.name}:${userId}`,
      ttl,
      options.limit,
      ttl,
      options.name,
    );
    if (totalHits > options.limit) throw new ThrottlerException();
    return true;
  }
}
