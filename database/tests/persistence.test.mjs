import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createChartHandlers } from "../../lib/chart-route-handlers.ts";
import { defaultDocument } from "../../lib/chart.ts";
import { defaultAccountAvatar } from "../../lib/account-preferences.ts";

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
