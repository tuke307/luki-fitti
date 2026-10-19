import fs from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { logger } from '@luki-fitti/logger';

async function exportOpenApiSpec() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('LukiFitti API')
    .setDescription('Personal Gym & Workout Tracker API')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('/')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outDir = path.resolve(
    process.cwd(),
    '../apple/Packages/LukiFittiKit/Sources/LukiFittiAPI',
  );
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'openapi.json');
  await fs.writeFile(outFile, JSON.stringify(document, null, 2), 'utf8');

  logger.info(`Exported OpenAPI specification to ${outFile}`);
  await app.close();
}

exportOpenApiSpec().catch((error) => {
  logger.error('Failed to export OpenAPI specification:', error);
  process.exit(1);
});
