# `@luki-fitti/database`

Prisma 7 PostgreSQL schema, migrations, and seed data for LukiFitti.

## Local Setup

```bash
cp .env.sample .env.local
yarn db:push
yarn db:seed
```

## Migrations

Read [docs/migrations.md](../../docs/migrations.md) before writing one: every migration has to
keep working with older app versions and with a rolled-back API.

```bash
# Create a new migration in development
yarn db:migrate:local -- <migration-name>

# Apply pending migrations
yarn db:deploy:local

# Regenerate Prisma Client
yarn db:generate
```
