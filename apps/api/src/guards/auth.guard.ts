import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyAccessToken } from '@/utils/jwt.util';
import { getRedis } from '@/utils/redis.util';
import { PrismaService } from '@/modules/database/prisma.service';
import { logger } from '@luki-fitti/logger';
import type { AuthenticatedUser } from '@/decorators/current-user.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const accessToken = request.cookies?.accessToken;

    if (!accessToken) {
      throw new UnauthorizedException('Access token missing');
    }

    try {
      const decoded = verifyAccessToken(accessToken);

      if (decoded.jti) {
        try {
          const denied = await getRedis().get(`access_denylist:${decoded.jti}`);
          if (denied) {
            throw new UnauthorizedException('Session revoked');
          }
        } catch (err) {
          if (err instanceof HttpException) throw err;
          logger.debug(`Access-token denylist check skipped: ${err}`);
        }
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new UnauthorizedException('User account not found');
      }

      request.user = {
        id: user.id,
        email: user.email,
      };

      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      logger.debug('Auth guard error:', err);
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
