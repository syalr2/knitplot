import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cloneDocument,
  contrastTextColor,
  defaultDocument,
  floodFillActive,
  floodFillStitchActions,
  stitchDisplayColor,
  chartCellDisplayColor,
  copyStitchCellColors,
  paintStitchCells,
  recolourStitchType,
  paintYarnCells,
  yarnFillTargets,
  stitchFillTargets,
  resizeCellsCentered,
  rotateGridClockwise,
  flipGrid,
  validStitchCellColors,
  type StitchAction,
} from "./chart";

test("stitch backgrounds follow yarn colours unless explicitly overridden", () => {
  const document = cloneDocument(defaultDocument);
  assert.equal(stitchDisplayColor(document, "m1l", "#ffaaaa"), "#ffaaaa");
  assert.equal(stitchDisplayColor(document, "purl", "#111111"), "#111111");
  document.stitchColors = { m1l: "#ffee00" };
  assert.equal(stitchDisplayColor(document, "m1l", "#ffaaaa"), "#ffee00");
  delete document.stitchColors.m1l;
  assert.equal(stitchDisplayColor(document, "m1l", "#ffaaaa"), "#ffaaaa");
});

test("no-stitch retains its special background and readable symbols", () => {
  assert.equal(
    stitchDisplayColor(defaultDocument, "no-stitch", "#ffffff"),
    "#303632",
  );
  assert.equal(contrastTextColor("#111111"), "#ffffff");
  assert.equal(contrastTextColor("#ffffff"), "#17211d");
});

test("colour filling includes shaping and purl cells without erasing symbols", () => {
  const cells = [
    ["a", "a", "b"],
    ["a", "a", "b"],
  ];
  const actions: StitchAction[][] = [
    ["m1l", "knit", "knit"],
    ["purl", "k2tog", "no-stitch"],
  ];
  const snapshot = JSON.stringify({ cells, actions });
  assert.deepEqual(floodFillActive(cells, actions, 0, 0, "c"), [
    ["c", "c", "b"],
    ["c", "c", "b"],
  ]);
  assert.equal(JSON.stringify({ cells, actions }), snapshot);
});

test("removing stitch symbols preserves colours and other stitch types", () => {
  const cells = [["a", "b", "a"]];
  const actions: StitchAction[][] = [["m1l", "m1l", "purl"]];
  assert.deepEqual(floodFillStitchActions(cells, actions, 0, 0, "knit"), [
    ["knit", "knit", "purl"],
  ]);
  assert.deepEqual(cells, [["a", "b", "a"]]);
  assert.deepEqual(actions, [["m1l", "m1l", "purl"]]);
});

test("adding a stitch leaves the underlying yarn colours unchanged", () => {
  const cells = [["a", "a", "b"]];
  assert.deepEqual(floodFillStitchActions(cells, undefined, 0, 0, "purl"), [
    ["purl", "purl", "knit"],
  ]);
  assert.deepEqual(cells, [["a", "a", "b"]]);
});

test("saved document copies retain independent colour and stitch layers", () => {
  const document = {
    ...cloneDocument(defaultDocument),
    stitchActions: [["m1l"]] as StitchAction[][],
    stitchColors: { m1l: "#ffee00" },
  };
  const copied = cloneDocument(JSON.parse(JSON.stringify(document)));
  assert.deepEqual(copied.cells, document.cells);
  assert.deepEqual(copied.stitchActions, document.stitchActions);
  assert.deepEqual(copied.stitchColors, document.stitchColors);
  assert.notEqual(copied.stitchActions, document.stitchActions);
});

test("individual stitch painting can override one cell without changing neighbours", () => {
  const original = cloneDocument(defaultDocument);
  const marked = paintStitchCells(
    original,
    [
      [0, 0],
      [0, 1],
    ],
    "m1l",
  );
  const brush = { ...marked, stitchColors: { m1l: "#ffee00" } };
  assert.equal(chartCellDisplayColor(brush, 0, 0, "#334c44"), "#334c44");
  const painted = paintStitchCells(brush, [[0, 0]], "m1l");
  assert.equal(chartCellDisplayColor(painted, 0, 0, "#334c44"), "#ffee00");
  assert.equal(chartCellDisplayColor(painted, 0, 1, "#334c44"), "#334c44");
  assert.deepEqual(painted.cells, original.cells);
  assert.equal(painted.stitchActions?.[0][0], "m1l");
  assert.equal(marked.stitchCellColors?.[0][0], null);
});

test("individual stitch painting can clear a cell override without changing neighbours", () => {
  const brush = {
    ...cloneDocument(defaultDocument),
    stitchColors: { m1l: "#ffee00" },
  };
  const painted = paintStitchCells(
    brush,
    [
      [0, 0],
      [0, 1],
    ],
    "m1l",
  );
  const resetBrush = { ...painted, stitchColors: {} };
  const reset = paintStitchCells(resetBrush, [[0, 0]], "m1l");
  assert.equal(chartCellDisplayColor(reset, 0, 0, "#334c44"), "#334c44");
  assert.equal(chartCellDisplayColor(reset, 0, 1, "#334c44"), "#ffee00");
  const removed = paintStitchCells(reset, [[0, 1]], "knit");
  assert.equal(removed.stitchCellColors?.[0][1], null);
  assert.equal(removed.stitchActions?.[0][1], "knit");
  assert.deepEqual(removed.cells, painted.cells);
});

test("fill can repaint an existing group of the same stitch type", () => {
  const original = paintStitchCells(
    cloneDocument(defaultDocument),
    [
      [0, 0],
      [0, 1],
      [2, 2],
    ],
    "purl",
  );
  const brush = { ...original, stitchColors: { purl: "#123456" } };
  const painted = paintStitchCells(
    brush,
    stitchFillTargets(brush, 0, 0),
    "purl",
  );
  assert.equal(painted.stitchCellColors?.[0][0], "#123456");
  assert.equal(painted.stitchCellColors?.[0][1], "#123456");
  assert.equal(painted.stitchCellColors?.[2][2], null);
});

test("old shared display colours migrate without later brush edits changing them", () => {
  const legacy = {
    ...defaultDocument,
    stitchActions: [["m1l", "m1l"]] as StitchAction[][],
    width: 2,
    height: 1,
    cells: [["background", "ink"]],
    stitchColors: { m1l: "#ffee00" },
  };
  const migrated = cloneDocument(legacy);
  assert.equal(
    JSON.stringify(migrated.stitchCellColors),
    JSON.stringify([["#ffee00", "#ffee00"]]),
  );
  migrated.stitchColors = { m1l: "#123456" };
  assert.equal(chartCellDisplayColor(migrated, 0, 0, "#ffffff"), "#ffee00");
  const restored = cloneDocument(JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(restored.stitchCellColors, migrated.stitchCellColors);
  restored.stitchCellColors![0][0] = null;
  assert.equal(migrated.stitchCellColors![0][0], "#ffee00");
});

test("display colours follow grid transforms and canvas resize", () => {
  const colours = [
    ["#123456", null],
    [null, "#ffee00"],
  ];
  assert.deepEqual(rotateGridClockwise(colours), [
    [null, "#123456"],
    ["#ffee00", null],
  ]);
  assert.deepEqual(flipGrid(colours, "horizontal"), [
    [null, "#123456"],
    ["#ffee00", null],
  ]);
  const expanded = resizeCellsCentered<string | null>(colours, 4, 4, null);
  assert.equal(expanded[1][1], "#123456");
  assert.equal(expanded[2][2], "#ffee00");
  assert.equal(expanded[0][0], null);
  assert.ok(validStitchCellColors(expanded, 4, 4));
  assert.ok(!validStitchCellColors([["red"]], 1, 1));
  assert.ok(!validStitchCellColors([[null]], 2, 1));
  assert.equal(
    copyStitchCellColors(defaultDocument).length,
    defaultDocument.height,
  );
});

test("stitch palette recolours all matching stitches; yarn painting overrides one without removing its letters", () => {
  let document = paintStitchCells(
    cloneDocument(defaultDocument),
    [
      [0, 0],
      [0, 1],
    ],
    "m1l",
  );
  document = paintStitchCells(document, [[0, 2]], "purl");
  const yarn = JSON.stringify(document.cells);
  const coloured = recolourStitchType(document, "m1l", "#ffee00");
  assert.equal(chartCellDisplayColor(coloured, 0, 0, "#f2eadf"), "#ffee00");
  assert.equal(chartCellDisplayColor(coloured, 0, 1, "#f2eadf"), "#ffee00");
  assert.equal(chartCellDisplayColor(coloured, 0, 2, "#f2eadf"), "#f2eadf");
  assert.equal(JSON.stringify(coloured.cells), yarn);
  const painted = paintYarnCells(coloured, [[0, 0]], "ink");
  assert.equal(chartCellDisplayColor(painted, 0, 0, "#334c44"), "#334c44");
  assert.equal(chartCellDisplayColor(painted, 0, 1, "#f2eadf"), "#ffee00");
  assert.equal(painted.stitchActions?.[0][0], "m1l");
  const reset = recolourStitchType(painted, "m1l", null);
  assert.equal(chartCellDisplayColor(reset, 0, 0, "#334c44"), "#334c44");
  assert.equal(chartCellDisplayColor(reset, 0, 1, "#f2eadf"), "#f2eadf");
  assert.deepEqual(reset.cells, painted.cells);
  const recoloured = recolourStitchType(painted, "m1l", "#123456");
  assert.equal(chartCellDisplayColor(recoloured, 0, 0, "#334c44"), "#123456");
  assert.equal(chartCellDisplayColor(recoloured, 0, 1, "#f2eadf"), "#123456");
});

test("painting the same underlying yarn colour still clears a stitch display override", () => {
  const marked = paintStitchCells(
    cloneDocument(defaultDocument),
    [[0, 0]],
    "m1l",
  );
  const coloured = recolourStitchType(marked, "m1l", "#ffee00");
  const painted = paintYarnCells(coloured, [[0, 0]], "background");
  assert.equal(chartCellDisplayColor(painted, 0, 0, "#f2eadf"), "#f2eadf");
  assert.equal(painted.stitchActions?.[0][0], "m1l");
  const filled = paintYarnCells(
    coloured,
    yarnFillTargets(coloured, 0, 0),
    "background",
  );
  assert.equal(chartCellDisplayColor(filled, 0, 0, "#f2eadf"), "#f2eadf");
  assert.equal(filled.stitchActions?.[0][0], "m1l");
});
