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

## Integer chart revisions (003)

Apply migration 003 before deploying the integer-revision application. It adds
`version`, starting at 1 for existing charts, without changing chart content or
timestamps. A database trigger increments the revision for saves and renames,
including writes from the previous deployment during rollout or rollback. Pin
changes do not invalidate an editor's revision. Keep the column and trigger when
rolling the application back; do not run the down migration while new clients
may still be open.

New clients use numeric API revisions and persist their decimal representation
as opaque browser tokens. `updatedAt` remains a display timestamp. Already-open
clients and older browser workspaces may still send timezone-qualified timestamp
tokens; the API compares those as `timestamptz`, never formatted text. Its UTC
timestamp responses preserve microseconds for older clients. Both token formats
retain ownership and compare-and-swap checks. Renaming deliberately invalidates
an older editor so autosave cannot silently undo the rename.

Compatibility review: after the integer-revision release has been established,
remove timestamp-token support only with a safe upgrade path for dirty older
workspaces. Do not discard their saved token or silently rebase pending edits.

To run the database integration test locally, provision a disposable PostgreSQL
database named `knitplot_test` on localhost, migrate it, and provide its connection
string as `TEST_DATABASE_URL` to `npm run test:db`. The test deliberately refuses
non-local hosts and any other database name. Without that variable it is skipped
locally; CI requires it and runs the test after applying migrations twice.
