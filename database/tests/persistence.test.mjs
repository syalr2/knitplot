import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
  "real PostgreSQL preserves ownership, conflicts, pins and renames",
  { skip: !connectionString },
  async () => {
    const pool = new pg.Pool({ connectionString });
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
      const params = { params: Promise.resolve({ id: first.id }) };
      assert.equal((await other.GET(request({}), params)).status, 404);
      assert.equal(
        (
          await other.PUT(
            request({
              document: defaultDocument,
              expectedVersion: first.updatedAt,
            }),
            params,
          )
        ).status,
        409,
      );
      const payload = {
        document: { ...defaultDocument, name: "First edit" },
        expectedVersion: first.updatedAt,
      };
      const simultaneous = await Promise.all([
        owner.PUT(request(payload), params),
        owner.PUT(request(payload), params),
      ]);
      assert.deepEqual(
        simultaneous.map((response) => response.status).sort(),
        [200, 409],
      );
      const rename = await owner.PATCH(request({ name: "Renamed" }), params);
      assert.equal(rename.status, 200);
      const current = await (await owner.GET(request({}), params)).json();
      assert.equal(current.document.name, "Renamed");
      assert.equal((await owner.PUT(request(payload), params)).status, 409);

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
