import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { defaultDocument } from "./chart";
import { createDraftChartLinkHandlers } from "./draft-chart-link-handlers";
import { createChartLinkHandlers } from "./chart-link-handlers";
import { isChartLinkToken, isDraftChartLinkToken } from "./chart-links";
import { yokeDocument } from "./yoke-document";
import { makeYokeFixture } from "./yoke-test-fixtures";

const origin = "https://knitplot.test";
function request(data: unknown, method = "POST", from = origin) {
  return new Request(origin + "/api/chart-links/draft", {
    method,
    headers: { origin: from, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
function fixture(rows: Record<string, unknown>[]) {
  const queries: { text: string; values: unknown[] }[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ text: strings.join("?"), values });
    return rows.map((row) =>
      row.outcome === "created"
        ? { token: values[0], slug: values[4], ...row }
        : row,
    );
  };
  const database = () =>
    sql as unknown as NonNullable<
      ReturnType<Parameters<typeof createDraftChartLinkHandlers>[0]>
    >;
  return {
    queries,
    handlers: createDraftChartLinkHandlers(database),
    open: createChartLinkHandlers({
      getViewer: async () => null,
      getDatabase: database,
    }).open,
  };
}

test("an unsaved chart creates a permanent snapshot without ownership metadata", async () => {
  const { handlers, queries } = fixture([{ outcome: "created" }]);
  const result = await handlers.POST(
    request({
      document: {
        ...defaultDocument,
        name: "Unsaved",
        privateExtra: "not part of chart",
      },
      confirmRights: true,
    }),
  );
  assert.equal(result.status, 201);
  assert.equal(result.headers.get("cache-control"), "no-store");
  const response = await result.json();
  const { token, revokeToken } = response;
  assert.ok(isDraftChartLinkToken(token));
  assert.match(token, /^[A-Za-z0-9]{6}$/);
  assert.ok(isChartLinkToken(revokeToken));
  assert.deepEqual(Object.keys(response).sort(), ["revokeToken", "token"]);
  const [, hash, snapshot, size, slug] = queries[0].values;
  assert.equal(hash, createHash("sha256").update(revokeToken).digest("hex"));
  assert.equal(JSON.parse(String(snapshot)).name, "Unsaved");
  assert.doesNotMatch(String(snapshot), /privateExtra/);
  assert.equal(size, Buffer.byteLength(String(snapshot)));
  assert.equal(slug, "unsaved");
});

test("a retried create retains the first token and canonical slug", async () => {
  const key = "r".repeat(32);
  const { handlers, queries } = fixture([
    { outcome: "existing", token: "k8J4qX", slug: "first-chart" },
  ]);
  const result = await handlers.POST(
    request({
      document: { ...defaultDocument, name: "Renamed chart" },
      confirmRights: true,
      revokeToken: key,
    }),
  );
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    token: "k8J4qX",
    slug: "first-chart",
  });
  assert.equal(
    queries[0].values[1],
    createHash("sha256").update(key).digest("hex"),
  );
});

test("recovery uses the private key without requiring a chart or workspace tab", async () => {
  const key = "r".repeat(32);
  const { handlers, queries } = fixture([
    { token: "k8J4qX", slug: "first-chart" },
  ]);
  const result = await handlers.PATCH(request({ revokeToken: key }, "PATCH"));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    token: "k8J4qX",
    slug: "first-chart",
  });
  assert.deepEqual(queries[0].values, [
    createHash("sha256").update(key).digest("hex"),
  ]);
});

test("origin, rights and yoke consent are checked before writing", async () => {
  const { handlers, queries } = fixture([]);
  assert.equal(
    (await handlers.POST(request({}, "POST", "https://other.test"))).status,
    403,
  );
  assert.equal(
    (await handlers.POST(request({ document: defaultDocument }))).status,
    400,
  );
  assert.equal(
    (
      await handlers.POST(
        request({
          document: yokeDocument(makeYokeFixture()),
          confirmRights: true,
        }),
      )
    ).status,
    400,
  );
  assert.equal(queries.length, 0);
});

test("a full store refuses new links and does not change how existing links open or revoke", async () => {
  const capped = fixture([{ outcome: "full" }]);
  assert.equal(
    (
      await capped.handlers.POST(
        request({ document: defaultDocument, confirmRights: true }),
      )
    ).status,
    429,
  );
  const token = "a".repeat(6);
  const slug = "my-swatch";
  const active = fixture([{ token, document: defaultDocument }]);
  assert.equal((await active.open(request({ token }))).status, 404);
  assert.equal(active.queries.length, 0);
  assert.equal((await active.open(request({ token, slug }))).status, 200);
  assert.match(active.queries[0].text, /from knitplot_draft_chart_links/);
  assert.deepEqual(active.queries[0].values, [token, false, slug]);
  assert.doesNotMatch(active.queries[0].text, /expires_at/);
  const revoke = "b".repeat(32);
  assert.equal(
    (
      await active.handlers.DELETE(
        request({ token, revokeToken: revoke }, "DELETE"),
      )
    ).status,
    204,
  );
  assert.deepEqual(active.queries[1].values, [
    createHash("sha256").update(revoke).digest("hex"),
    token,
    token,
  ]);
  assert.equal(
    (await fixture([]).open(request({ token, slug: "another-swatch" }))).status,
    404,
  );
});
