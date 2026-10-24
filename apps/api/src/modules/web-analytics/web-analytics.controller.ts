import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AnalyticsCollectSchema, type AnalyticsCollectDto } from '@luki-fitti/common/schemas';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { WebAnalyticsService } from './web-analytics.service';

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Public first-party pageview collector. Intentionally has no AuthGuard/CsrfGuard: it accepts
 * anonymous pageviews only, never touches user data and always answers 204.
 */
@ApiTags('Web Analytics')
@Controller('analytics')
export class WebAnalyticsController {
  constructor(private readonly webAnalyticsService: WebAnalyticsService) {}

  @Post('collect')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Collect an anonymous pageview and forward it to Umami' })
  collect(
    @Body(new ZodValidationPipe(AnalyticsCollectSchema)) body: AnalyticsCollectDto,
    @Req() req: Request,
  ): void {
    // Fire-and-forget: the browser never waits on Umami; forwardPageview never throws.
    void this.webAnalyticsService.forwardPageview(body, {
      hostname: headerValue(req.headers['x-forwarded-host']) ?? headerValue(req.headers.host),
      clientIp: req.ip,
      userAgent: headerValue(req.headers['user-agent']),
      acceptLanguage: headerValue(req.headers['accept-language']),
      fetchSite: headerValue(req.headers['sec-fetch-site']),
    });
  }
}
