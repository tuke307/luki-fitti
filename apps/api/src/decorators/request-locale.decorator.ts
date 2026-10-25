import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { resolveSupportedLocale } from '@luki-fitti/common/catalog';
import type { SupportedLocale } from '@luki-fitti/common/enums';

/** Locale for localized catalog content, taken from the `Accept-Language` header. */
export const RequestLocale = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SupportedLocale =>
    resolveSupportedLocale(ctx.switchToHttp().getRequest<Request>().headers['accept-language']),
);
