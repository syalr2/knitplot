import { test } from "node:test";
import assert from "node:assert/strict";
import { createChartHandlers } from "./chart-route-handlers";
import { defaultDocument } from "./chart";
import { defaultAccountAvatar } from "./account-preferences";

const id = "a21d4c9a-1122-4234-8234-123456789abc";
const params = { params: Promise.resolve({ id }) };
function fixture(rows: Record<string, unknown>[] = [], signedIn = true) {
  const queries: { text: string; values: unknown[] }[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ text: strings.join("?"), values });
    return rows;
  };
  const handlers = createChartHandlers({
    getViewer: async () =>
      signedIn
        ? {
            id: "user-one",
            email: null,
            avatar: defaultAccountAvatar(null),
            pinnedChartIds: [],
          }
        : null,
    getDatabase: () =>
      sql as unknown as NonNullable<
        ReturnType<Parameters<typeof createChartHandlers>[0]["getDatabase"]>
      >,
  });
  return { handlers, queries };
}
function request(body: unknown, origin = "https://knitplot.test") {
  return new Request(`https://knitplot.test/api/charts/${id}`, {
    method: "PUT",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
test("chart mutations reject cross-origin and unsigned requests before querying", async () => {
  const { handlers, queries } = fixture([], false);
  assert.equal(
    (await handlers.PUT(request({}, "https://other.test"), params)).status,
    403,
  );
  assert.equal((await handlers.PUT(request({}), params)).status, 401);
  assert.equal(queries.length, 0);
});
test("bad JSON and invalid stitches return 400 without database writes", async () => {
  const { handlers, queries } = fixture();
  assert.equal((await handlers.POST(request(null))).status, 400);
  assert.equal(
    (
      await handlers.POST(
        request({
          document: { ...defaultDocument, stitchColors: { m1l: 123 } },
        }),
      )
    ).status,
    400,
  );
  assert.equal(queries.length, 0);
});
test("a missing revision cannot overwrite a cloud chart", async () => {
  const { handlers, queries } = fixture();
  assert.equal(
    (await handlers.PUT(request({ document: defaultDocument }), params)).status,
    428,
  );
  assert.equal(queries.length, 0);
});
test("cloud writes require both ownership and the exact loaded revision", async () => {
  const { handlers, queries } = fixture([{ id, version: 8 }]);
  const result = await handlers.PUT(
    request({ document: defaultDocument, expectedVersion: 7 }),
    params,
  );
  assert.equal(result.status, 200);
  assert.equal((await result.json()).version, 8);
  assert.match(queries[0].text, /user_id = \?/);
  assert.match(queries[0].text, /version = \?/);
  assert.ok(queries[0].values.includes(7));
  assert.ok(queries[0].values.includes("user-one"));
  assert.doesNotMatch(queries[0].text, /updated_at::text/);
});
test("a stale revision returns 409, not successful last-writer-wins", async () => {
  const { handlers } = fixture([]);
  assert.equal(
    (
      await handlers.PUT(
        request({ document: defaultDocument, expectedVersion: 6 }),
        params,
      )
    ).status,
    409,
  );
});
test("invalid integer revisions never reach the database", async () => {
  const { handlers, queries } = fixture();
  for (const expectedVersion of [0, -1, 1.5, 2147483648, "7", "stale", null]) {
    assert.equal(
      (
        await handlers.PUT(
          request({ document: defaultDocument, expectedVersion }),
          params,
        )
      ).status,
      428,
    );
  }
  assert.equal(queries.length, 0);
});
test("already-open clients retain timestamp compare-and-swap during rollout", async () => {
  const { handlers, queries } = fixture([{ id, version: 2 }]);
  assert.equal(
    (
      await handlers.PUT(
        request({
          document: defaultDocument,
          expectedVersion: "2026-10-29 12:00:00.123456+00",
        }),
        params,
      )
    ).status,
    200,
  );
  assert.ok(queries[0].values.includes("2026-10-29T12:00:00.123456+00:00"));
  assert.match(queries[0].text, /updated_at = \?::timestamptz/);
});
test("read and delete queries are scoped to the signed-in user", async () => {
  const { handlers, queries } = fixture([{ id, document: defaultDocument }]);
  await handlers.GET(request({}), params);
  await handlers.DELETE(request({}), params);
  for (const query of queries) {
    assert.match(query.text, /user_id = \?/);
    assert.ok(query.values.includes("user-one"));
  }
});
test("infrastructure errors produce a generic 503, not a misleading validation error", async () => {
  const { handlers } = fixture();
  // A thrown database error must never be sent to the browser.
  const broken = createChartHandlers({
    getViewer: async () => ({
      id: "user-one",
      email: null,
      avatar: defaultAccountAvatar(null),
      pinnedChartIds: [],
    }),
    getDatabase: () =>
      (() => {
        throw new Error("password=secret");
      }) as never,
  });
  const result = await broken.POST(request({ document: defaultDocument }));
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /secret/);
  assert.equal((await handlers.POST(request(null))).status, 400);
});
