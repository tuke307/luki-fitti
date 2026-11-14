import { defineConfig } from 'prisma/config';
import { DATABASE_URL, SHADOW_DATABASE_URL } from './src/config/env.config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: DATABASE_URL,
    shadowDatabaseUrl: SHADOW_DATABASE_URL,
  },
});
