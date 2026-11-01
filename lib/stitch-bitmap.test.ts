import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneDocument, defaultDocument, createStitchActions } from "./chart";
import { stitchBitmap } from "./stitch-bitmap";

function fixture(width = 114, height = 150) {
  const doc = cloneDocument(defaultDocument);
  doc.width = width;
  doc.height = height;
  doc.palette = [
    { id: "pink", hex: "#ff809a" },
    { id: "green", hex: "#123456" },
  ];
  doc.cells = Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, column) =>
      (row + column) % 3 === 0 ? "pink" : "green",
    ),
  );
  return doc;
}

test("bitmap is exactly one opaque palette-coloured pixel per stitch, in chart order", () => {
  for (const [width, height] of [
    [114, 150],
    [200, 150],
    [18, 14],
  ]) {
    const doc = fixture(width, height);
    const before = JSON.stringify(doc);
    const result = stitchBitmap(doc);
    assert.equal(result.width, width);
    assert.equal(result.height, height);
    assert.equal(result.pixels.length, width * height * 4);
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const offset = (row * width + column) * 4;
        assert.deepEqual(
          Array.from(result.pixels.slice(offset, offset + 4)),
          doc.cells[row][column] === "pink"
            ? [255, 128, 154, 255]
            : [18, 52, 86, 255],
        );
      }
    }
    assert.equal(JSON.stringify(doc), before);
  }
});

test("gauge and stitch display colours never affect yarn pixels", () => {
  const doc = fixture(3, 2);
  const before = stitchBitmap(doc);
  doc.gaugeStitches = 10;
  doc.gaugeRows = 40;
  doc.stitchActions = createStitchActions(3, 2);
  doc.stitchActions[0][0] = "m1l";
  doc.stitchActions[1][1] = "purl";
  doc.stitchColors = { m1l: "#ffffff", purl: "#000000" };
  doc.stitchCellColors = [
    ["#abcdef", null, null],
    [null, "#ffffff", null],
  ];
  assert.deepEqual(stitchBitmap(doc), before);
});

test("no-stitch cells require an explicit palette colour and do not change dimensions", () => {
  const doc = fixture(3, 2);
  doc.stitchActions = createStitchActions(3, 2);
  doc.stitchActions[0][0] = "no-stitch";
  assert.throws(() => stitchBitmap(doc), /Choose a yarn colour/);
  assert.throws(() => stitchBitmap(doc, "missing"), /Choose a yarn colour/);
  const bitmap = stitchBitmap(doc, "green");
  assert.deepEqual(Array.from(bitmap.pixels.slice(0, 4)), [18, 52, 86, 255]);
  assert.equal(bitmap.width, 3);
  assert.equal(bitmap.height, 2);
  assert.equal(doc.stitchActions[0][0], "no-stitch");
});
