import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cloneDocument,
  defaultDocument,
  type ChartDocument,
  type CellSelection,
} from "./chart";
import {
  copySelectionBlock,
  reduceSelectionEdit,
  canRotateSelection,
} from "./chart-selection";

function fixture(): ChartDocument {
  const doc = cloneDocument(defaultDocument);
  return {
    ...doc,
    width: 4,
    height: 3,
    cells: [
      ["a", "b", "c", "d"],
      ["e", "f", "g", "h"],
      ["i", "j", "k", "l"],
    ],
    palette: [
      { id: "background", hex: "#ffffff" },
      ..."abcdefghijkl".split("").map((id) => ({ id, hex: "#123456" })),
    ],
    stitchActions: [
      ["m1l", "purl", "knit", "knit"],
      ["ssk", "k2tog", "knit", "knit"],
      ["knit", "knit", "knit", "knit"],
    ],
    stitchCellColors: [
      ["#112233", "#445566", null, null],
      ["#778899", null, null, null],
      [null, null, null, null],
    ],
  };
}
const square: CellSelection = {
  startRow: 0,
  endRow: 1,
  startColumn: 0,
  endColumn: 1,
};
function frozenState(selection: CellSelection | null = square) {
  const state = { document: fixture(), selection };
  function freeze(value: unknown) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  }
  freeze(state);
  return state;
}
test("copy normalizes reverse drags and copies all three layers independently", () => {
  const doc = fixture();
  const block = copySelectionBlock(doc, {
    startRow: 1,
    endRow: 0,
    startColumn: 1,
    endColumn: 0,
  })!;
  assert.deepEqual(block.cells, [
    ["a", "b"],
    ["e", "f"],
  ]);
  assert.deepEqual(block.stitchActions, [
    ["m1l", "purl"],
    ["ssk", "k2tog"],
  ]);
  block.cells[0][0] = "changed";
  block.stitchActions[0][0] = "knit";
  block.stitchCellColors[0][0] = null;
  assert.equal(doc.cells[0][0], "a");
  assert.equal(doc.stitchActions![0][0], "m1l");
  assert.equal(doc.stitchCellColors![0][0], "#112233");
});
test("cut clears yarn, symbols and display overrides without moving the selection", () => {
  const state = frozenState();
  const next = reduceSelectionEdit(state, { type: "cut" });
  assert.deepEqual(next.document.cells, [
    ["background", "background", "c", "d"],
    ["background", "background", "g", "h"],
    ["i", "j", "k", "l"],
  ]);
  assert.equal(next.document.stitchActions, undefined);
  assert.equal(next.document.stitchCellColors![0][0], null);
  assert.deepEqual(next.selection, square);
});
test("paste clips at chart edges and carries symbols and display overrides", () => {
  const doc = fixture();
  const block = copySelectionBlock(doc, square)!;
  const state = frozenState({
    startRow: 2,
    endRow: 2,
    startColumn: 3,
    endColumn: 3,
  });
  const next = reduceSelectionEdit(state, { type: "paste", block });
  assert.equal(next.document.cells[2][3], "a");
  assert.equal(next.document.stitchActions![2][3], "m1l");
  assert.equal(next.document.stitchCellColors![2][3], "#112233");
  assert.deepEqual(next.selection, state.selection);
  assert.equal(next.document.cells[1][3], "h");
});
test("paste without a selection starts at the top-left", () => {
  const block = copySelectionBlock(fixture(), {
    startRow: 2,
    endRow: 2,
    startColumn: 2,
    endColumn: 3,
  })!;
  const next = reduceSelectionEdit(frozenState(null), { type: "paste", block });
  assert.deepEqual(next.document.cells[0], ["k", "l", "c", "d"]);
  assert.deepEqual(next.selection, {
    startRow: 0,
    endRow: 0,
    startColumn: 0,
    endColumn: 1,
  });
});
test("overlapping moves use an intact source block, leaving only vacated cells blank", () => {
  const next = reduceSelectionEdit(frozenState(), {
    type: "move",
    rows: 0,
    columns: 1,
  });
  assert.deepEqual(next.document.cells[0], ["background", "a", "b", "d"]);
  assert.deepEqual(next.document.stitchActions![0], [
    "knit",
    "m1l",
    "purl",
    "knit",
  ]);
  assert.deepEqual(next.document.stitchCellColors![0], [
    null,
    "#112233",
    "#445566",
    null,
  ]);
  assert.deepEqual(next.selection, {
    startRow: 0,
    endRow: 1,
    startColumn: 1,
    endColumn: 2,
  });
});
test("out-of-bounds moves and missing selections are no-ops", () => {
  const state = frozenState();
  assert.equal(
    reduceSelectionEdit(state, { type: "move", rows: -1, columns: 0 }),
    state,
  );
  const empty = frozenState(null);
  assert.equal(reduceSelectionEdit(empty, { type: "cut" }), empty);
});
for (const transform of ["horizontal", "vertical"] as const) {
  test(`${transform} flip reorders every layer without changing stitch meanings`, () => {
    const next = reduceSelectionEdit(frozenState(), {
      type: "transform",
      transform,
    });
    assert.equal(
      next.document.cells[0][0],
      transform === "horizontal" ? "b" : "e",
    );
    assert.equal(
      next.document.stitchActions![0][0],
      transform === "horizontal" ? "purl" : "ssk",
    );
    assert.equal(
      next.document.stitchCellColors![0][0],
      transform === "horizontal" ? "#445566" : "#778899",
    );
    assert.equal(next.document.cells[2][3], "l");
  });
}
test("rectangular rotation clears the old footprint and updates selection dimensions", () => {
  const selection = { startRow: 0, endRow: 1, startColumn: 0, endColumn: 2 };
  assert.equal(canRotateSelection(fixture(), selection), true);
  const next = reduceSelectionEdit(frozenState(selection), {
    type: "transform",
    transform: "rotate",
  });
  assert.deepEqual(next.document.cells, [
    ["e", "a", "background", "d"],
    ["f", "b", "background", "h"],
    ["g", "c", "k", "l"],
  ]);
  assert.deepEqual(next.selection, {
    startRow: 0,
    endRow: 2,
    startColumn: 0,
    endColumn: 1,
  });
  assert.equal(next.document.stitchActions![0][0], "ssk");
  assert.equal(next.document.stitchCellColors![0][1], "#112233");
});
test("a rotation that would extend beyond the chart is a no-op", () => {
  const state = frozenState({
    startRow: 1,
    endRow: 2,
    startColumn: 1,
    endColumn: 3,
  });
  assert.equal(canRotateSelection(state.document, state.selection), false);
  assert.equal(
    reduceSelectionEdit(state, { type: "transform", transform: "rotate" }),
    state,
  );
});
test("yarn fill retains symbols and clears their display overrides", () => {
  const next = reduceSelectionEdit(frozenState(), {
    type: "fill-yarn",
    color: "c",
  });
  assert.equal(next.document.cells[0][0], "c");
  assert.equal(next.document.stitchActions![0][0], "m1l");
  assert.equal(next.document.stitchCellColors![0][0], null);
  assert.equal(next.selection, null);
});
test("stitch fill retains underlying yarn colours and deselects", () => {
  const next = reduceSelectionEdit(frozenState(), {
    type: "fill-stitch",
    stitch: "purl",
  });
  assert.deepEqual(next.document.cells, fixture().cells);
  assert.equal(next.document.stitchActions![1][1], "purl");
  assert.equal(next.selection, null);
});
