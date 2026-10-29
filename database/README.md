# Database migrations

Migrations use `node-pg-migrate`, with a database-side `pgmigrations` ledger,
transactions and an advisory lock to prevent concurrent migration runners.

Set `DATABASE_URL` explicitly for the intended database, then run:

```sh
npm run db:migrate
```

Never run migrations automatically during builds. Back up the target database
before a production rollout and review pending SQL first. Do not print connection
strings or commit environment files.

## Existing installations

Migration 001 is idempotent: databases previously created by running its SQL by
hand can apply it once through the runner to initialise the migration ledger.
Migration 002 adds a nullable pin flag. Existing users' Clerk pin preferences are
imported on their first My Charts load; later pin/unpin operations update the chart
row atomically. Deleting a chart also deletes its pin.

Apply migration 002 **before** deploying code that reads the pin column. If the
application needs rollback, leave the additive column in place: the old code
ignores it. Do not drop it without exporting pins first. Rolling back migration 001
is intentionally unsupported because it would destroy user charts and credentials.

New migrations must have an increasing numeric prefix and `-- Up Migration` /
`-- Down Migration` sections where rollback is safe. Do not edit already-applied
migrations. CI runs migrations against a disposable PostgreSQL database, never
against production.

To run the database integration test locally, provision a disposable PostgreSQL
database named `knitplot_test` on localhost, migrate it, and provide its connection
string as `TEST_DATABASE_URL` to `npm run test:db`. The test deliberately refuses
non-local hosts and any other database name. Without that variable it is skipped
locally; CI requires it and runs the test after applying migrations twice.
