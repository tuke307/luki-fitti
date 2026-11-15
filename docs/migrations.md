# Writing migrations and API changes

Publishing a release deploys the database, API and web app within minutes. The iOS app follows
about a day later, after App Review, and many users update days or weeks after that. Every schema
and API change therefore has to work for clients that are older than the server.

## Who talks to the server at the same time

| Client                             | How long it stays old                                                  |
| :--------------------------------- | :--------------------------------------------------------------------- |
| iOS + Watch app, previous version  | at least the ~1 day of App Review, then until each user updates        |
| Older iOS versions                 | until the user updates (the update notice asks; nothing forces it yet) |
| Web PWA with a cached bundle       | until the service worker picks up the new build and the page reloads   |
| Offline outboxes (web, iOS, Watch) | queued changes are replayed later, in the shape of the old client      |
| Previous API container             | briefly during a deploy, and again if you roll back to an older tag    |

`db-migrate` runs `prisma migrate deploy` before the new API starts. Prisma has no down migrations:
rolling back means redeploying the old tag against the **new** schema.

## The rule: expand, then contract

Every release must work with:

1. the previous app versions talking to the new API, and
2. the previous API running against the new schema (rollback).

So a breaking change is split across releases:

- **Expand** (release N): add the new table, column, field or endpoint next to the old one. Write
  both, read the new one, and backfill.
- **Contract** (release N+1 or later): remove the old one, but only once the app versions that need it
  are no longer in use.

## Safe in one release

- New table.
- New nullable column, or a column with a default (`ADD COLUMN ... DEFAULT ...`).
- New optional request field. The API must treat "missing" as "leave unchanged", not as "clear":
  `...(dto.field !== undefined ? { field: dto.field } : {})`. Old clients never send the field and
  must not wipe what newer clients saved.
- New response field. Swift's `Codable` ignores unknown keys, and the web reads by name.
- New endpoint.
- New index. Prisma wraps migrations in a transaction, so `CREATE INDEX CONCURRENTLY` isn't
  possible; our tables are small enough for a normal index.

## Needs more than one release

| Change                            | Release N (expand)                                                                       | Later release (contract)                      |
| :-------------------------------- | :--------------------------------------------------------------------------------------- | :-------------------------------------------- |
| Rename a column or field          | add the new one, write both, backfill, read the new one, keep returning the old one      | stop returning the old field, drop the column |
| Remove a column or response field | stop reading or writing it; keep returning it (null or last value) if old apps decode it | drop it                                       |
| Make a column `NOT NULL`          | backfill and add a default; the API always writes it                                     | add `NOT NULL`                                |
| Change a column type              | add a new column with the new type, write both, backfill                                 | drop the old column                           |
| New **required** request field    | optional, with a server-side default for clients that don't send it                      | make it required once old apps are gone       |
| Stricter validation               | accept the old values and map them to the new ones                                       | reject them                                   |
| Rename or remove an endpoint      | keep the old path as an alias                                                            | remove the alias                              |
| New value in an existing enum     | see below                                                                                |                                               |

### Enum values

Most iOS enums decode strictly (`ExerciseCategory`, `EquipmentType`, `SessionStatus`, …). One
unknown value in a response makes the old app's **whole request** fail, not just that field. Before
the API returns a new value in an existing enum field:

- give the Swift enum a fallback `init(from:)` first (like `SetType`, `ExerciseType` and
  `SessionSourceDevice` do), ship that app version, and only then let the API return the new value;
  or
- return the new value only to clients that can handle it.

Adding a value to a **new** field is safe, since old apps never decode that field.

## Data migrations

- Put backfills in the migration SQL. Keep them idempotent (`UPDATE ... WHERE new_col IS NULL`) and
  avoid long locks on large tables.
- Personal data never goes into migrations (see the import docs).
- Never edit a migration that has already been applied anywhere. Fix forward with a new one.

## Prisma workflow

```bash
yarn workspace @luki-fitti/database db:migrate:local -- <migration_name>
```

Always read the generated `migration.sql` before committing:

- Prisma turns a rename into `DROP COLUMN` + `ADD COLUMN`, which **loses data**. Follow the
  rename recipe above instead.
- `DROP` and `ALTER ... SET NOT NULL` belong only in a contract release.
- Check that defaults and backfills cover existing rows.

## When contracting is allowed

Remove an old column, field or endpoint only once the app versions that use it are no longer in
use. Until there is a minimum supported app version on the API, assume that is never for anything
the App Store app reads or writes. Prefer leaving a deprecated, unused field in place over breaking
old apps.

## PR checklist

- [ ] The migration only adds things, or this is a contract release and the old app versions no longer use what it drops.
- [ ] The previous API version still works on the new schema (rollback).
- [ ] New request fields are optional; "missing" leaves stored values unchanged.
- [ ] No response field is removed, renamed, or changed in type or nullability.
- [ ] No new value in an existing enum that old iOS versions decode strictly.
- [ ] The generated `migration.sql` was reviewed: no accidental `DROP` or rename-as-drop.
