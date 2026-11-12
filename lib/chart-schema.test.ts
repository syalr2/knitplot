import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneDocument, defaultDocument } from "./chart";
import { readProject } from "./project-file";
import { readCloudChartPayload, readCloudChartRequest } from "./cloud-charts";
import { readChartDocument } from "./chart-schema";
import { newChartTab, readWorkspace, workspaceSave } from "./workspace";

const document = () => cloneDocument(defaultDocument);
test("a tall imported chart with long palette IDs fits the cloud request budget", async () => {
  const longId = "a".repeat(50);
  const otherId = "yarn-0";
  const grid = <T>(value: T) =>
    Array.from({ length: 300 }, () => Array<T>(200).fill(value));
  const chart = cloneDocument({
    ...defaultDocument,
    width: 200,
    height: 300,
    palette: [
      { id: longId, hex: "#aabbcc" },
      { id: otherId, hex: "#ffffff" },
    ],
    cells: grid(longId),
    stitchActions: grid("purl"),
    stitchCellColors: grid("#aabbcc"),
  });
  chart.cells[299][199] = otherId;
  const request = (doc: typeof chart) =>
    new Request("http://localhost/api/charts", {
      method: "POST",
      body: JSON.stringify({ document: doc }),
    });
  await assert.rejects(readCloudChartRequest(request(chart)), {
    status: 413,
  });
  const opened = readProject({
    format: "colorwork-chart",
    version: 2,
    document: chart,
  });
  const saved = readCloudChartPayload(
    await readCloudChartRequest(request(opened)),
  ).document;
  assert.deepEqual(
    saved.palette.map(({ hex }) => hex),
    ["#aabbcc", "#ffffff"],
  );
  assert.deepEqual(
    saved.cells,
    chart.cells.map((row) =>
      row.map((id) => saved.palette[id === longId ? 0 : 1].id),
    ),
  );
  assert.deepEqual(saved.stitchActions, chart.stitchActions);
  assert.deepEqual(saved.stitchCellColors, chart.stitchCellColors);
});

test("project and cloud round trips preserve a chart", () => {
  const chart = document();
  assert.deepEqual(
    readProject({ format: "colorwork-chart", version: 2, document: chart }),
    chart,
  );
  assert.deepEqual(readCloudChartPayload({ document: chart }).document, chart);
});
test("a 200 by 300 regular chart and last-row progress survive storage round trips", () => {
  const chart = cloneDocument({
    ...defaultDocument,
    width: 200,
    height: 300,
    cells: Array.from({ length: 300 }, () =>
      Array<string>(200).fill("background"),
    ),
  });
  const tab = newChartTab(chart, "tall-chart");
  tab.knitProgress.row = 300;
  assert.deepEqual(
    readProject({ format: "colorwork-chart", version: 2, document: chart }),
    chart,
  );
  assert.deepEqual(readCloudChartPayload(tab).document, chart);
  assert.equal(readCloudChartPayload(tab).knitProgress.row, 300);
  const reopened = readWorkspace(
    JSON.parse(JSON.stringify(workspaceSave([tab], tab.id))),
  ).workspace.tabs[0];
  assert.deepEqual(reopened.document, chart);
  assert.equal(reopened.knitProgress.row, 300);
  assert.throws(() =>
    readChartDocument(
      cloneDocument({
        ...defaultDocument,
        width: chart.width,
        height: 301,
        cells: [...chart.cells, chart.cells[0]],
      }),
    ),
  );
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
