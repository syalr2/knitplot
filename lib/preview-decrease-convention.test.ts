import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ChartDocument, defaultDocument, StitchAction } from "./chart";
import { adaptInputCountDecreases } from "./preview-decrease-convention";
import { connectedFabric, expandPreviewDocument } from "./connected-preview";

const K: StitchAction = "knit",
  N: StitchAction = "no-stitch",
  T: StitchAction = "k2tog",
  S: StitchAction = "ssk";
function chart(rows: StitchAction[][]): ChartDocument {
  return {
    ...defaultDocument,
    width: rows[0].length,
    height: rows.length,
    stitchActions: rows,
    cells: rows.map((row) => row.map(() => "background")),
  };
}
function inputChart() {
  return chart([
    [N, K, K, K, K, K, K, N],
    [K, K, T, K, K, S, K, K],
    Array<StitchAction>(8).fill(K),
  ]);
}

test("input-count decrease rows combine companions without changing the source chart", () => {
  const doc = inputChart(),
    snapshot = JSON.stringify(doc),
    result = adaptInputCountDecreases(doc);
  assert.deepEqual(result.rows, [1]);
  assert.deepEqual(result.document.stitchActions![1], [K, N, T, K, K, S, N, K]);
  assert.equal(JSON.stringify(doc), snapshot);
  const f = connectedFabric(doc);
  assert.deepEqual(
    f.rows.map((row) => row.length),
    [6, 6, 8],
  );
  assert.deepEqual(f.unresolvedRows, []);
  assert.deepEqual(f.inferredRows, []);
  assert.deepEqual(
    f.rows[1]
      .filter((n) => n.kind === "merge")
      .map((n) => n.parents.map((id) => f.loops[id].column)),
    [
      [1, 2],
      [5, 6],
    ],
  );
  assert.deepEqual(
    f.rows[1].flatMap((n) => n.parents),
    f.rows[2].map((n) => n.id),
    "every input loop is consumed once, not dropped or duplicated",
  );
});

test("ordinary output-count decrease charts are not adapted", () => {
  const doc = chart([
    [K, K, K, K, K, K, N, N],
    [K, T, K, S, K, K, N, N],
    Array<StitchAction>(8).fill(K),
  ]);
  assert.deepEqual(adaptInputCountDecreases(doc).rows, []);
  assert.deepEqual(connectedFabric(doc).unresolvedRows, []);
});

test("count evidence must agree on both sides of the decrease row", () => {
  const doc = inputChart();
  doc.stitchActions![0] = Array<StitchAction>(8).fill(K);
  assert.deepEqual(adaptInputCountDecreases(doc).rows, []);
});

test("companion cells cannot be shared between operations", () => {
  const doc = chart([
    [N, K, K, K, K, K, K, N],
    [S, K, T, K, K, K, K, K],
    Array<StitchAction>(8).fill(K),
  ]);
  assert.deepEqual(adaptInputCountDecreases(doc).rows, []);
});

test("a matching total cannot hide inconsistent counts between separate shoulders", () => {
  const doc = chart([
    [K, K, K, N, N, N, N, K],
    [K, T, K, N, N, S, K, K],
    [K, K, K, N, N, K, K, K],
  ]);
  assert.deepEqual(adaptInputCountDecreases(doc).rows, []);
});

test("normal and mirrored repeats consume the right input loops exactly once", () => {
  for (const repeats of [1, 2, 3])
    for (const mirrored of [false, true]) {
      const doc = inputChart(),
        expanded = expandPreviewDocument(doc, repeats, mirrored),
        adapted = adaptInputCountDecreases(expanded);
      assert.deepEqual(adapted.rows, [1]);
      const f = connectedFabric(doc, repeats, mirrored);
      assert.deepEqual(f.unresolvedRows, []);
      assert.deepEqual(
        f.rows.map((row) => row.length),
        [6 * repeats, 6 * repeats, 8 * repeats],
      );
      assert.equal(
        new Set(f.rows[1].flatMap((n) => n.parents)).size,
        8 * repeats,
      );
      assert.ok(
        f.rows[1]
          .filter((n) => n.kind === "merge")
          .every((n) => n.parents.length === 2),
      );
    }
});

test("a centred double decrease consumes three loops in the input-count convention", () => {
  const doc = chart([
      [N, K, K, K, K, N],
      [K, K, "cdd", K, K, K],
      Array<StitchAction>(6).fill(K),
    ]),
    f = connectedFabric(doc);
  assert.deepEqual(f.inputCountDecreaseRows, [1]);
  assert.deepEqual(f.unresolvedRows, []);
  const decrease = f.rows[1].find((n) => n.action === "cdd")!;
  assert.deepEqual(
    decrease.parents.map((id) => f.loops[id].column),
    [1, 2, 3],
  );
});

test("narrowing neckline courses keep parents beyond the new shoulder edge", () => {
  const doc = chart([
    [K, K, N, N, N, K, K],
    [K, K, N, N, N, K, K],
    [K, T, K, N, K, S, K],
    [K, K, K, N, K, K, K],
  ]);
  const f = connectedFabric(doc);
  assert.deepEqual(f.inputCountDecreaseRows, [2]);
  assert.deepEqual(f.unresolvedRows, []);
  for (const n of f.rows[1]) assert.equal(n.parents.length, 1);
  const right = f.rows[1].filter((n) => n.column > 3);
  assert.ok(
    right.every((n) => f.loops[n.parents[0]].column > 3),
    "never steal parents from the opposite shoulder",
  );
});
