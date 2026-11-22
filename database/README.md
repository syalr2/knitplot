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

## Chart Club (004)

Apply 004 before exposing Chart Club. It adds two tables and does not backfill
profiles or copy private charts. A creator row is created when a user chooses
a Chart Club username. For application rollback, keep both tables rather than
dropping posts.

Migration 005 adds optional public profile fields to the Chart Club creator
table. It does not create profiles for existing KnitPlot accounts. Apply it
before deploying the creator pages, and keep it in place on application rollback.

Migration 006 adds private follows. Followers use their existing account ID;
they do not need a Chart Club profile. Apply it before deploying Following.
Leave the tables in place if rolling the app back.

Migration 007 adds optional Instagram and TikTok profile URLs. It does not
populate them for existing creators. Apply it before deploying the updated
creator pages; keep the columns if rolling back the application.

Migration 008 reserves old handles as profile aliases and adds private hearts
and reports. The public-post view excludes taken-down posts and old view-only
posts. No data from a private draft is automatically made public. Set
`CHART_CLUB_MODERATOR_ID` to the authorized Clerk user ID to enable report
review. Keep the migration applied on application rollback.

Migration 009 makes public snapshots independent of private chart deletion.
Private edits never update a public snapshot; creators can only change the public
title and description or remove the post. Apply 009 before deploying the new
management flow. Keep it applied on application rollback: the down migration
intentionally refuses to run once a post has lost its private source.

Migration 010 limits new username reservations to five per account, keeping
all existing aliases, and indexes the report queue. Apply it before deploying
the updated username API and moderation page. The moderator can open
**Account settings → Chart Club reports** or visit `/chart-club/moderation`
while signed in. The queue does not send notifications.

## Unlisted chart links (011)

Apply 011 before enabling **Share a link** on saved charts. It adds a separate
table for opt-in snapshots, with one active link per saved chart and no backfill.
Chart Club does not read this table. Turning off a link or deleting its source
chart removes the snapshot. Keep the table on application rollback; dropping it
would invalidate existing links.

Migration 012 adds non-expiring snapshots for **File → Share a link** without an
account or cloud save. Apply it before deploying the editor dialog. Revoke keys
are hashed separately from the share token; there is no account or source-chart
association. Admission has a hard ceiling of 10,000 live links and 256 MiB of
chart payloads; it rejects new requests at capacity instead of deleting
existing links. Monitor storage before raising the cap. Leave the table and
function in place if rolling back the app.
