import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { logger } from '@luki-fitti/logger';
import { AppModule, mcp } from './app.module';
import { MCP_SERVER_PORT } from './config';

async function bootstrap() {
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    // Behind Caddy: trust one proxy hop so req.ip is the real client IP, which
    // the guard forwards to the API (its failed-key counter is per IP).
    app.set('trust proxy', 1);
    mcp.setHttpAdapter(app.getHttpAdapter()); // mount the MCP HTTP route(s)
    app.connectMicroservice({ strategy: mcp });
    await app.startAllMicroservices(); // BEFORE listen() so routes are mounted
    await app.listen(MCP_SERVER_PORT);
    logger.info(`MCP server started on port ${MCP_SERVER_PORT}`);
  } catch (error) {
    logger.error(`Failed to start MCP server: ${error}`);
    process.exit(1);
  }
}

void bootstrap();
