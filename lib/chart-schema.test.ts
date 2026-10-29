import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneDocument, defaultDocument } from "./chart";
import { readProject } from "./project-file";
import { readCloudChartPayload } from "./cloud-charts";
import { readChartDocument } from "./chart-schema";

const document = () => cloneDocument(defaultDocument);
test("project and cloud round trips preserve a chart", () => {
  const chart = document();
  assert.deepEqual(
    readProject({ format: "colorwork-chart", version: 2, document: chart }),
    chart,
  );
  assert.deepEqual(readCloudChartPayload({ document: chart }).document, chart);
});
for (const [name, mutate] of Object.entries({
  "unknown action": (c: Record<string, unknown>) => {
    c.stitchActions = Array.from({ length: defaultDocument.height }, () =>
      Array(defaultDocument.width).fill("bogus"),
    );
  },
  "invalid stitch colour": (c: Record<string, unknown>) => {
    c.stitchColors = { m1l: 123 };
  },
  "invalid action colour key": (c: Record<string, unknown>) => {
    c.stitchColors = { constructor: "#ffffff" };
  },
  "duplicate palette id": (c: Record<string, unknown>) => {
    c.palette = [
      { id: "a", hex: "#ffffff" },
      { id: "a", hex: "#000000" },
    ];
  },
  "unknown cell colour": (c: Record<string, unknown>) => {
    c.cells = [["missing"]];
  },
  "invalid cell override": (c: Record<string, unknown>) => {
    c.stitchCellColors = [["red"]];
  },
  "oversized chart": (c: Record<string, unknown>) => {
    c.width = 201;
  },
  "nonfinite gauge": (c: Record<string, unknown>) => {
    c.gaugeRows = Infinity;
  },
})) {
  test(`all boundaries reject ${name}`, () => {
    const chart = document();
    mutate(chart as unknown as Record<string, unknown>);
    assert.throws(() => readChartDocument(chart));
    assert.throws(() =>
      readProject({ format: "colorwork-chart", version: 2, document: chart }),
    );
    assert.throws(() => readCloudChartPayload({ document: chart }));
  });
}
test("old files receive instruction, guide and stitch defaults", () => {
  const chart = document() as unknown as Record<string, unknown>;
  delete chart.instructions;
  delete chart.guides;
  delete chart.stitchCellColors;
  assert.equal(
    readProject({ format: "colorwork-chart", version: 1, document: chart })
      .instructions.technique,
    "stranded",
  );
});
test("cloud settings reject invalid progress and preview", () => {
  for (const settings of [
    { preview: { repeatX: 200 } },
    { knitProgress: { markerStyle: "bogus" } },
    { knitProgress: { row: "1" } },
  ]) {
    assert.throws(() =>
      readCloudChartPayload({ document: document(), ...settings }),
    );
  }
});
test("cloud settings clamp valid progress after a resize", () => {
  assert.equal(
    readCloudChartPayload({ document: document(), knitProgress: { row: 150 } })
      .knitProgress.row,
    defaultDocument.height,
  );
});
