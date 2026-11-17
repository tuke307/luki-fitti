import fs from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PublicApiModule } from './modules/public-api/public-api.module';
import { logger } from '@luki-fitti/logger';

async function exportOpenApiSpec() {
  let app: NestExpressApplication;
  try {
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
    });
  } catch (error) {
    // Nest hides the boot error when the logger is off — surface it before exiting.
    console.error('Failed to boot the app for OpenAPI export:', error);
    process.exitCode = 1;
    throw error;
  }

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('LukiFitti API')
    .setDescription('Personal Gym & Workout Tracker API')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('/')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outDir = path.resolve(process.cwd(), '../apple/Packages/LukiFittiKit/Sources/LukiFittiAPI');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'openapi.json');
  await fs.writeFile(outFile, JSON.stringify(document, null, 2) + '\n', 'utf8');

  logger.info(`Exported OpenAPI specification to ${outFile}`);

  const publicConfig = new DocumentBuilder()
    .setTitle('LukiFitti Public API')
    .setDescription(
      'Read-only public API v1. Authenticate with a personal API key ' +
        '(`lf_pat_…`) sent as `Authorization: Bearer lf_pat_…`. Create keys under ' +
        'Profile → Settings → API keys.',
    )
    .setVersion('1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'lf_pat_…',
        description: 'Personal API key `lf_pat_…`',
      },
      'bearer',
    )
    // The docs playground calls this origin directly (CORS is `*`); locally
    // `PUBLIC_API_SERVER_URL` points it at a dev API instead.
    .addServer(process.env.PUBLIC_API_SERVER_URL ?? 'https://app.luki-fitti.tony-luke.de/api')
    .build();

  const publicDocument = SwaggerModule.createDocument(app, publicConfig, {
    include: [PublicApiModule],
  });
  // Paths carry the Nest `/api` mount prefix; the server URL already ends in
  // `/api`, so drop it or playground calls would hit `/api/api/v1/…`.
  publicDocument.paths = Object.fromEntries(
    Object.entries(publicDocument.paths).map(([p, item]) => [p.replace(/^\/api/, ''), item]),
  ) as typeof publicDocument.paths;
  const publicOutDir = path.resolve(process.cwd(), '../../docs/openapi');
  await fs.mkdir(publicOutDir, { recursive: true });
  const publicOutFile = path.join(publicOutDir, 'public-api-v1.json');
  await fs.writeFile(publicOutFile, JSON.stringify(publicDocument, null, 2) + '\n', 'utf8');
  logger.info(`Exported public OpenAPI specification to ${publicOutFile}`);

  await app.close();
}

exportOpenApiSpec().catch((error) => {
  console.error('Failed to export OpenAPI specification:', error);
  process.exitCode = 1;
});
