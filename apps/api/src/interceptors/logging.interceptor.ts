import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { logger } from '@luki-fitti/logger';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    logger.info(`Method: ${request.method}`);
    logger.info(`OriginalUrl: ${request.originalUrl}`);
    logger.info(`Headers: ${JSON.stringify(request.headers)}`);
    logger.info(`Query: ${JSON.stringify(request.query)}`);
    logger.info(`Body: ${JSON.stringify(request.body)}`);

    return next.handle();
  }
}
