import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultDocument } from "./chart";
import { createChartLinkHandlers } from "./chart-link-handlers";
import {
  chartLinkSlug,
  chartLinkFromHash,
  chartLinkUrl,
  isChartLinkToken,
} from "./chart-links";
import { yokeDocument } from "./yoke-document";
import { makeYokeFixture } from "./yoke-test-fixtures";

const id = "c4a70eaa-94da-49f1-a2c8-830d6527e5a5";
const token = "abcdefghijklmno_0123456789abcdef";
const origin = "https://knitplot.test";
test("readable chart names label links without being used to look up a chart", () => {
  const shortKey = "k8J4qX";
  const url = new URL(
    chartLinkUrl(origin, shortKey, "Dutch Bunny (new version)"),
  );
  assert.equal(url.hash, "#dutch-bunny-new-version~" + shortKey);
  assert.deepEqual(chartLinkFromHash(url.hash), {
    token: shortKey,
    slug: "dutch-bunny-new-version",
  });
  assert.equal(chartLinkFromHash("#" + shortKey), null);
  assert.deepEqual(chartLinkFromHash("#" + token), { token });
  assert.deepEqual(chartLinkFromHash("#old-swatch~" + "a".repeat(22)), {
    token: "a".repeat(22),
  });
  assert.equal(chartLinkFromHash("#dutch-bunny"), null);
  assert.equal(chartLinkFromHash("#a~b~" + shortKey), null);
  assert.equal(chartLinkSlug("Étoile & Cœur"), "etoile-c-ur");
  assert.equal(chartLinkSlug("🐇"), "chart");
});
function fixture(results: Record<string, unknown>[][] = [], signedIn = true) {
  const queries: { text: string; values: unknown[] }[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ text: strings.join("?"), values });
    return results.shift() ?? [];
  };
  const handlers = createChartLinkHandlers({
    getViewer: async () => (signedIn ? { id: "owner" } : null),
    getDatabase: () =>
      sql as unknown as NonNullable<
        ReturnType<Parameters<typeof createChartLinkHandlers>[0]["getDatabase"]>
      >,
  });
  return { handlers, queries };
}
function request(body: unknown, method = "POST", from = origin) {
  return new Request(origin + "/api/chart-links", {
    method,
    headers: { origin: from, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("only same-origin signed-in users can create or revoke links", async () => {
  const { handlers, queries } = fixture([], false);
  assert.equal(
    (await handlers.create(request({}, "POST", "https://other.test"))).status,
    403,
  );
  assert.equal((await handlers.create(request({}))).status, 401);
  assert.equal((await handlers.revoke(request({}, "DELETE"))).status, 401);
  assert.equal(queries.length, 0);
});

test("create saves a snapshot of the requested owned revision, without overwriting an existing link", async () => {
  const { handlers, queries } = fixture([
    [{ name: "Saved chart", document: defaultDocument, version: 4 }],
    [{ token }],
  ]);
  const response = await handlers.create(request({ sourceId: id, version: 4 }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { token });
  assert.match(queries[0].text, /user_id = \?/);
  assert.match(queries[1].text, /user_id = \? and version = \?/);
  assert.match(queries[1].text, /on conflict \(source_id\) do nothing/);
  assert.ok(isChartLinkToken(queries[1].values[0]));
  assert.equal(JSON.parse(queries[1].values[1] as string).name, "Saved chart");
});

test("unknown sources, stale revisions, and unconfirmed yoke measurements create no link", async () => {
  for (const [rows, status] of [
    [[], 404],
    [
      [{ name: "Yoke", document: yokeDocument(makeYokeFixture()), version: 5 }],
      409,
    ],
    [
      [{ name: "Yoke", document: yokeDocument(makeYokeFixture()), version: 4 }],
      400,
    ],
  ] as const) {
    const { handlers, queries } = fixture([[...rows]]);
    assert.equal(
      (await handlers.create(request({ sourceId: id, version: 4 }))).status,
      status,
    );
    assert.equal(queries.length, 1);
  }
});

test("guests open only an exact token, kept out of the request URL and never cached", async () => {
  const { handlers, queries } = fixture(
    [[{ document: defaultDocument }]],
    false,
  );
  const link = new URL(chartLinkUrl(origin, token));
  assert.equal(link.pathname, "/shared-chart");
  assert.equal(link.search, "");
  assert.equal(link.hash, "#" + token);
  assert.equal((await handlers.open(request({ token: id }))).status, 404);
  assert.equal(queries.length, 0);
  const response = await handlers.open(request({ token }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  const project = await response.json();
  assert.equal(project.format, "colorwork-chart");
  assert.equal(project.document.name, defaultDocument.name);
  assert.deepEqual(queries[0].values, [token]);
  assert.equal((await handlers.open(request({ token }))).status, 404);
});

test("revocation matches the owner, source, and exact link so an old tab cannot revoke a new one", async () => {
  const { handlers, queries } = fixture([[{ source_id: id }]]);
  const response = await handlers.revoke(
    request({ sourceId: id, token }, "DELETE"),
  );
  assert.equal(response.status, 204);
  assert.match(queries[0].text, /charts.user_id = \? and links.token = \?/);
  assert.deepEqual(queries[0].values, [id, "owner", token]);
});
