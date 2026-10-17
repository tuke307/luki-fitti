# Database

for local development, execute these statements ONCE;

```bash
yarn run db:push
yarn run db:seed
```

# Migrations

## create a new migration

to create a new migration, execute this command;

```bash
yarn run db:migrate:local -- <migration-name>
```

## deploy

to deploy the latest migration, execute this command;

```bash
yarn run db:deploy:local
```
