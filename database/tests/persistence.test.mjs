import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createChartHandlers } from "../../lib/chart-route-handlers.ts";
import { createChartLinkHandlers } from "../../lib/chart-link-handlers.ts";
import { createDraftChartLinkHandlers } from "../../lib/draft-chart-link-handlers.ts";
import { defaultDocument } from "../../lib/chart.ts";
import { defaultAccountAvatar } from "../../lib/account-preferences.ts";
import { createYokeProject } from "../../lib/yoke-project.ts";
import {
  defaultYokeMeasurements,
  calculateYokeTargets,
  suggestYokeSchedule,
} from "../../lib/yoke-plan.ts";
import { yokeDocument } from "../../lib/yoke-document.ts";
import { yokeProgramFromProject } from "../../lib/yoke-program-from-project.ts";
import { withYokeProgram } from "../../lib/yoke-program-state.ts";
import { reviseYokeStitches } from "../../lib/yoke-stitch-revision.ts";
import { readCloudChartPayload } from "../../lib/cloud-charts.ts";
import { recordClubReport } from "../../lib/club-reports.ts";

// Never silently use DATABASE_URL: it may point at a real user's database.
const connectionString = process.env.TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/knitplot_test"
  ) {
    throw new Error(
      "Database tests require the disposable local knitplot_test database.",
    );
  }
} else if (process.env.CI) {
  throw new Error(
    "CI must provide TEST_DATABASE_URL for database integration tests.",
  );
}

test(
  "Chart Club limits new reservations without invalidating existing aliases",
  { skip: !connectionString },
  async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("begin");
      const author = randomUUID();
      const prefix = `limit_${author.slice(0, 8)}`;
      await client.query(
        "insert into knitplot_club_creators (user_id, handle) values ($1, $2)",
        [author, `${prefix}_0`],
      );
      const rename = (n) =>
        client.query(
          "update knitplot_club_creators set handle = $2 where user_id = $1",
          [author, `${prefix}_${n}`],
        );
      for (let i = 1; i < 5; i++) await rename(i);
      await client.query("savepoint username_limit");
      await assert.rejects(rename(5), { code: "KP001" });
      await client.query("rollback to username_limit");
      await rename(0);
      const { rows } = await client.query(
        "select handle from knitplot_club_handles where creator_id = $1 order by handle",
        [author],
      );
      assert.deepEqual(
        rows.map(({ handle }) => handle),
        Array.from({ length: 5 }, (_, n) => `${prefix}_${n}`),
      );
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);

test(
  "Chart Club reserves renamed handles, records private reports, and hides moderated posts",
  { skip: !connectionString },
  async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("begin");
      const author = randomUUID(),
        reader = randomUUID();
      const old = `old_${author.slice(0, 8)}`,
        current = `new_${author.slice(0, 8)}`;
      await client.query(
        "insert into knitplot_club_creators (user_id, handle) values ($1, $2)",
        [author, old],
      );
      await client.query(
        "update knitplot_club_creators set handle = $2 where user_id = $1",
        [author, current],
      );
      assert.deepEqual(
        (
          await client.query(
            "select c.handle from knitplot_club_handles h join knitplot_club_creators c on c.user_id = h.creator_id where h.handle = $1",
            [old],
          )
        ).rows,
        [{ handle: current }],
      );
      await client.query("savepoint before_duplicate");
      await assert.rejects(
        client.query(
          "insert into knitplot_club_creators (user_id, handle) values ($1, $2)",
          [reader, old],
        ),
        { code: "23505" },
      );
      await client.query("rollback to before_duplicate");
      const {
        rows: [source],
      } = await client.query(
        "insert into knitplot_charts (user_id, document) values ($1, '{}') returning id",
        [author],
      );
      const {
        rows: [post],
      } = await client.query(
        "insert into knitplot_club_posts (creator_id, source_id, title, description, summary, editable_document) values ($1, $2, 'Public', '', '{}', '{}') returning id",
        [author, source.id],
      );
      await client.query(
        "insert into knitplot_club_hearts (user_id, post_id) values ($1, $2)",
        [reader, post.id],
      );
      const feed =
        "select p.id from knitplot_club_public_posts p join knitplot_club_hearts h on p.id = h.post_id where h.user_id = $1";
      assert.deepEqual((await client.query(feed, [reader])).rows, [
        { id: post.id },
      ]);
      assert.deepEqual((await client.query(feed, [author])).rows, []);
      const sql = async (strings, ...values) =>
        (
          await client.query(
            strings.reduce(
              (query, part, i) => query + (i ? `$${i}` : "") + part,
              "",
            ),
            values,
          )
        ).rows;
      assert.equal(await recordClubReport(sql, author, post.id, "spam"), false);
      assert.equal(
        await recordClubReport(sql, reader, randomUUID(), "spam"),
        false,
      );
      assert.equal(await recordClubReport(sql, reader, post.id, "spam"), true);
      assert.equal(await recordClubReport(sql, reader, post.id, "other"), true);
      assert.deepEqual(
        (
          await client.query(
            "select reason from knitplot_club_reports where post_id = $1",
            [post.id],
          )
        ).rows,
        [{ reason: "spam" }],
      );
      await client.query(
        "update knitplot_club_posts set removed_at = now() where id = $1",
        [post.id],
      );
      assert.deepEqual((await client.query(feed, [reader])).rows, []);
      assert.equal(
        await recordClubReport(sql, randomUUID(), post.id, "spam"),
        false,
      );
      assert.equal(
        (
          await client.query("select 1 from knitplot_charts where id = $1", [
            source.id,
          ])
        ).rowCount,
        1,
      );
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);

test(
  "Chart Club follows need no follower profile and are isolated by account",
  { skip: !connectionString },
  async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("begin");
      const creator = randomUUID();
      const follower = randomUUID();
      await client.query(
        "insert into knitplot_club_creators (user_id, handle) values ($1, $2)",
        [creator, `club_${creator.slice(0, 8)}`],
      );
      const {
        rows: [chart],
      } = await client.query(
        "insert into knitplot_charts (user_id, document) values ($1, '{}') returning id",
        [creator],
      );
      await client.query(
        "insert into knitplot_club_posts (creator_id, source_id, title, description, summary) values ($1, $2, 'Public', '', '{}')",
        [creator, chart.id],
      );
      const follow =
        "insert into knitplot_club_follows values ($1, $2) on conflict do nothing";
      await client.query(follow, [follower, creator]);
      assert.equal(
        (await client.query(follow, [follower, creator])).rowCount,
        0,
      );
      const feed =
        "select p.title from knitplot_club_follows f join knitplot_club_posts p on p.creator_id = f.creator_id where f.follower_id = $1";
      assert.deepEqual((await client.query(feed, [follower])).rows, [
        { title: "Public" },
      ]);
      assert.deepEqual((await client.query(feed, [randomUUID()])).rows, []);
      await client.query(
        "delete from knitplot_club_follows where follower_id = $1 and creator_id = $2",
        [follower, creator],
      );
      assert.deepEqual((await client.query(feed, [follower])).rows, []);
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);

test(
  "Chart Club snapshots survive private edits and private chart deletion",
  { skip: !connectionString },
  async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("begin");
      const user = `club-test-${randomUUID()}`;
      const handle = `club_${randomUUID().slice(0, 8)}`;
      const {
        rows: [source],
      } = await client.query(
        "insert into knitplot_charts (user_id, name, document) values ($1, 'Private', '{}') returning id",
        [user],
      );
      assert.equal(
        (
          await client.query(
            "select 1 from knitplot_club_creators where user_id = $1",
            [user],
          )
        ).rowCount,
        0,
      );
      await client.query(
        "insert into knitplot_club_creators (user_id, handle) values ($1, $2)",
        [user, handle],
      );
      const {
        rows: [post],
      } = await client.query(
        "insert into knitplot_club_posts (creator_id, source_id, title, description, summary, editable_document) values ($1, $2, 'Public', '', '{}', '{\"snapshot\":true}') returning id",
        [user, source.id],
      );
      await client.query(
        "update knitplot_charts set name = 'New private name' where id = $1",
        [source.id],
      );
      assert.deepEqual(
        (
          await client.query(
            "select title, editable_document from knitplot_club_posts where id = $1",
            [post.id],
          )
        ).rows,
        [{ title: "Public", editable_document: { snapshot: true } }],
      );
      await client.query("delete from knitplot_charts where id = $1", [
        source.id,
      ]);
      assert.deepEqual(
        (
          await client.query(
            "select source_id, editable_document from knitplot_club_public_posts where id = $1",
            [post.id],
          )
        ).rows,
        [{ source_id: null, editable_document: { snapshot: true } }],
      );
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);

test(
  "unlisted snapshots stay out of Chart Club and only the owner can turn off a link",
  { skip: !connectionString },
  async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("begin");
      const owner = randomUUID();
      const {
        rows: [source],
      } = await client.query(
        "insert into knitplot_charts (user_id, name, document) values ($1, 'Friend link', $2) returning id, version",
        [owner, JSON.stringify(defaultDocument)],
      );
      const getDatabase =
        () =>
        async (strings, ...values) =>
          (
            await client.query(
              strings.reduce(
                (sql, text, i) => sql + (i ? `$${i}` : "") + text,
                "",
              ),
              values,
            )
          ).rows;
      const origin = "https://knitplot.test";
      const request = (body, method = "POST") =>
        new Request(origin + "/api/chart-links", {
          method,
          headers: { origin, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      const handlers = (id) =>
        createChartLinkHandlers({
          getViewer: async () => (id ? { id } : null),
          getDatabase,
        });
      const own = handlers(owner);
      const guest = handlers(null);
      const other = handlers(randomUUID());
      const create = () =>
        request({ sourceId: source.id, version: source.version });
      assert.equal((await other.create(create())).status, 404);
      const created = await own.create(create());
      assert.equal(
        created.status,
        201,
        JSON.stringify(await created.clone().json()),
      );
      const { token } = await created.json();
      assert.equal((await own.create(create())).status, 409);
      const revoke = () => request({ sourceId: source.id, token }, "DELETE");
      assert.equal((await other.revoke(revoke())).status, 404);
      const open = () => guest.open(request({ token }));
      await client.query(
        "update knitplot_charts set name = 'Changed draft' where id = $1",
        [source.id],
      );
      assert.equal((await (await open()).json()).document.name, "Friend link");
      assert.equal(
        (
          await client.query(
            "select 1 from knitplot_club_public_posts where source_id = $1",
            [source.id],
          )
        ).rowCount,
        0,
      );
      assert.equal((await own.revoke(revoke())).status, 204);
      assert.equal((await open()).status, 404);
      const revised = await own.create(
        request({ sourceId: source.id, version: source.version + 1 }),
      );
      assert.equal(revised.status, 201);
      const newToken = (await revised.json()).token;
      assert.notEqual(token, newToken);
      assert.equal((await own.revoke(revoke())).status, 404);
      await client.query("delete from knitplot_charts where id = $1", [
        source.id,
      ]);
      assert.equal(
        (await guest.open(request({ token: newToken }))).status,
        404,
      );
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);

test(
  "draft links need the chart name and code, survive age, and have a separate revoke key",
  { skip: !connectionString },
  async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("begin");
      const getDatabase =
        () =>
        async (strings, ...values) =>
          (
            await client.query(
              strings.reduce(
                (sql, text, i) => sql + (i ? `$${i}` : "") + text,
                "",
              ),
              values,
            )
          ).rows;
      const origin = "https://knitplot.test";
      const request = (body, method = "POST") =>
        new Request(origin + "/api/chart-links/draft", {
          method,
          headers: { origin, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      const draft = createDraftChartLinkHandlers(getDatabase);
      const guest = createChartLinkHandlers({
        getViewer: async () => null,
        getDatabase,
      });
      const create = await draft.POST(
        request({
          document: { ...defaultDocument, name: "Friend swatch" },
          confirmRights: true,
        }),
      );
      assert.equal(
        create.status,
        201,
        JSON.stringify(await create.clone().json()),
      );
      const { token, revokeToken } = await create.json();
      const slug = "friend-swatch";
      assert.match(token, /^[A-Za-z0-9]{6}$/);
      await client.query(
        "update knitplot_draft_chart_links set created_at = now() - interval '10 years' where token = $1",
        [token],
      );
      assert.equal((await guest.open(request({ token }))).status, 404);
      assert.equal(
        (await guest.open(request({ token, slug: "different-name" }))).status,
        404,
      );
      assert.equal(
        (await (await guest.open(request({ token, slug }))).json()).document
          .name,
        "Friend swatch",
      );
      assert.equal(
        (
          await draft.DELETE(
            request({ token, revokeToken: "a".repeat(32) }, "DELETE"),
          )
        ).status,
        404,
      );
      assert.equal(
        (await draft.DELETE(request({ token, revokeToken }, "DELETE"))).status,
        204,
      );
      assert.equal((await guest.open(request({ token, slug }))).status, 404);
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);

test(
  "revision migration preserves existing chart contents, pins and timestamps",
  { skip: !connectionString },
  async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("begin");
      const schema = `revision_test_${randomUUID().replaceAll("-", "")}`;
      await client.query(`create schema "${schema}"`);
      await client.query(`set local search_path to "${schema}", public`);
      for (const name of [
        "001_accounts_and_cloud_charts.sql",
        "002_chart_pins.sql",
      ]) {
        const source = await readFile(
          new URL(`../migrations/${name}`, import.meta.url),
          "utf8",
        );
        await client.query(source.split("-- Down Migration")[0]);
      }
      const before = (
        await client.query(
          "insert into knitplot_charts (user_id, name, document, pinned) values ('migration-test', 'Keep me', '{\"sentinel\":true}', true) returning id, name, document, pinned, updated_at::text",
        )
      ).rows[0];
      const migration = await readFile(
        new URL("../migrations/003_chart_revisions.sql", import.meta.url),
        "utf8",
      );
      const [up, down] = migration.split("-- Down Migration");
      await client.query(up);
      const after = (
        await client.query(
          "select id, name, document, pinned, updated_at::text, version from knitplot_charts",
        )
      ).rows[0];
      assert.deepEqual(after, { ...before, version: 1 });
      // Exercise rollback only inside this isolated local schema, never production.
      await client.query(down);
      assert.deepEqual(
        (
          await client.query(
            "select id, name, document, pinned, updated_at::text from knitplot_charts",
          )
        ).rows[0],
        before,
      );
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);

test(
  "real PostgreSQL preserves ownership, conflicts, pins and renames",
  { skip: !connectionString },
  async () => {
    // Revisions and compatibility tokens must not depend on session formatting.
    const pool = new pg.Pool({
      connectionString,
      options: "-c timezone=Pacific/Auckland -c DateStyle=SQL,DMY",
    });
    const ownerId = `test-${randomUUID()}`;
    const otherId = `test-${randomUUID()}`;
    const sql = async (strings, ...values) => {
      const text = strings.reduce(
        (query, part, index) => query + (index ? `$${index}` : "") + part,
        "",
      );
      return (await pool.query(text, values)).rows;
    };
    const handlersFor = (userId) =>
      createChartHandlers({
        getViewer: async () => ({
          id: userId,
          email: null,
          avatar: defaultAccountAvatar(null),
          pinnedChartIds: [],
        }),
        getDatabase: () => sql,
      });
    const owner = handlersFor(ownerId);
    const other = handlersFor(otherId);
    const request = (body) =>
      new Request("https://knitplot.test/api/charts", {
        method: "POST",
        headers: {
          origin: "https://knitplot.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    try {
      const created = await owner.POST(request({ document: defaultDocument }));
      assert.equal(created.status, 201);
      const first = await created.json();
      assert.equal(first.version, 1);
      const params = { params: Promise.resolve({ id: first.id }) };
      assert.equal((await other.GET(request({}), params)).status, 404);
      assert.equal(
        (
          await other.PUT(
            request({
              document: defaultDocument,
              expectedVersion: first.version,
            }),
            params,
          )
        ).status,
        409,
      );
      const payload = {
        document: { ...defaultDocument, name: "First edit" },
        expectedVersion: first.version,
      };
      const simultaneous = await Promise.all([
        owner.PUT(request(payload), params),
        owner.PUT(request(payload), params),
      ]);
      assert.deepEqual(
        simultaneous.map((response) => response.status).sort(),
        [200, 409],
      );
      const saved = await simultaneous
        .find((response) => response.status === 200)
        .json();
      assert.equal(saved.version, 2);
      const rename = await owner.PATCH(request({ name: "Renamed" }), params);
      assert.equal(rename.status, 200);
      assert.equal((await rename.json()).version, 3);
      const current = await (await owner.GET(request({}), params)).json();
      assert.equal(current.document.name, "Renamed");
      assert.equal((await owner.PUT(request(payload), params)).status, 409);
      assert.equal(
        (
          await owner.PUT(
            request({
              document: defaultDocument,
              expectedVersion: saved.version,
            }),
            params,
          )
        ).status,
        409,
      );

      const second = await (
        await owner.POST(request({ document: defaultDocument }))
      ).json();
      await Promise.all(
        [first.id, second.id].map((id) =>
          pool.query(
            "update knitplot_charts set pinned=true where id=$1 and user_id=$2",
            [id, ownerId],
          ),
        ),
      );
      const pins = await pool.query(
        "select count(*)::int as count from knitplot_charts where user_id=$1 and pinned=true",
        [ownerId],
      );
      assert.equal(pins.rows[0].count, 2);
      assert.equal(
        (await (await owner.GET(request({}), params)).json()).version,
        3,
      );

      // Previously-open tabs can save with their old timestamp, but not reuse it.
      const legacyPayload = {
        document: defaultDocument,
        expectedVersion: current.updatedAt,
      };
      const legacySave = await owner.PUT(request(legacyPayload), params);
      assert.equal(legacySave.status, 200);
      assert.equal((await legacySave.json()).version, 4);
      assert.equal(
        (await owner.PUT(request(legacyPayload), params)).status,
        409,
      );

      // Old deployments do not know about the new column. The trigger still
      // advances it, even if updated_at happens to remain exactly unchanged.
      await pool.query(
        "update knitplot_charts set document=document where id=$1",
        [first.id],
      );
      assert.equal(
        (await (await owner.GET(request({}), params)).json()).version,
        5,
      );
      assert.equal(
        (
          await owner.PUT(
            request({ document: defaultDocument, expectedVersion: 4 }),
            params,
          )
        ).status,
        409,
      );
      await other.DELETE(request({}), params);
      assert.equal((await owner.GET(request({}), params)).status, 200);
      await owner.DELETE(request({}), params);
      const remaining = await pool.query(
        "select count(*)::int as count from knitplot_charts where user_id=$1 and pinned=true",
        [ownerId],
      );
      assert.equal(remaining.rows[0].count, 1);
      const yoke = yokeDocument(
        createYokeProject(
          defaultYokeMeasurements,
          suggestYokeSchedule(
            calculateYokeTargets(defaultYokeMeasurements),
            defaultYokeMeasurements.repeats,
          ),
        ),
      );
      const createdYoke = await (
        await owner.POST(request({ document: yoke }))
      ).json();
      const yokeParams = { params: Promise.resolve({ id: createdYoke.id }) };
      const flattened = { ...yoke };
      delete flattened.yoke;
      assert.equal(
        (
          await owner.PUT(
            request({
              document: flattened,
              expectedVersion: createdYoke.version,
            }),
            yokeParams,
          )
        ).status,
        409,
      );
      const kept = await (await owner.GET(request({}), yokeParams)).json();
      assert.deepEqual(kept.document.yoke, yoke.yoke);
      assert.equal(
        (
          await owner.PUT(
            request({ document: yoke, expectedVersion: createdYoke.version }),
            yokeParams,
          )
        ).status,
        200,
      );
      const program = yokeProgramFromProject(yoke.yoke);
      const round = program.rounds.length - 1;
      const revised = yokeDocument(
        withYokeProgram(
          yoke.yoke,
          reviseYokeStitches(program, [
            {
              round,
              section: 0,
              operation: program.rounds[round][0][2].id,
              action: "ssk",
            },
          ]),
        ),
      );
      const createdRevision = await (
        await owner.POST(request({ document: revised }))
      ).json();
      const revisionParams = {
        params: Promise.resolve({ id: createdRevision.id }),
      };
      assert.equal(
        (
          await owner.PUT(
            request({
              document: yoke,
              expectedVersion: createdRevision.version,
            }),
            revisionParams,
          )
        ).status,
        409,
      );
      const restored = await (
        await owner.GET(request({}), revisionParams)
      ).json();
      assert.deepEqual(
        readCloudChartPayload(restored).document.yoke,
        revised.yoke,
      );
    } finally {
      // Only this test's random user records in the guarded disposable database.
      await pool.query(
        "delete from knitplot_charts where user_id = any($1::text[])",
        [[ownerId, otherId]],
      );
      await pool.end();
    }
  },
);
