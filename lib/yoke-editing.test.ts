import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultYokeMeasurements as m,
  calculateYokeTargets,
  suggestYokeSchedule,
} from "./yoke-plan";
import { createYokeProject } from "./yoke-project";
import { yokeChart } from "./yoke-chart";
import {
  yokeDrawing,
  editYokeSelection,
  copyYokeSelection,
  fillYoke,
  yokeRepeatsDiffer,
  copyYokeRepeat,
} from "./yoke-editing";
import { yokeCanvasViewport } from "./yoke-canvas-view";
import { yokeGeometry, yokeCellAt } from "./yoke-layout";
const make = () =>
  createYokeProject(m, suggestYokeSchedule(calculateYokeTargets(m), m.repeats));
const area = { startRow: 0, startColumn: 1, endRow: 1, endColumn: 2 };

test("choosing a repeat projects and edits only that repeat, or all when explicitly enabled", () => {
  const project = make();
  project.cells[project.cells.length - 1][
    2 * (project.cells.at(-1)!.length / m.repeats) + 1
  ] = 2;
  const d = yokeDrawing(project, 2);
  const width = d.document.width;
  assert.equal(
    d.document.cells[0][1],
    `yarn-${project.cells.at(-1)![2 * width + 1]}`,
  );
  const next = editYokeSelection(
    project,
    d,
    area,
    { type: "fill-yarn", color: "yarn-1" },
    false,
  ).project;
  assert.equal(next.cells.at(-1)![1], 0);
  assert.equal(next.cells.at(-1)![2 * width + 1], 1);
  assert.deepEqual(next.events, project.events);
  const all = editYokeSelection(
    next,
    yokeDrawing(next, 2),
    area,
    { type: "fill-yarn", color: "yarn-1" },
    true,
  ).project;
  for (let repeat = 0; repeat < m.repeats; repeat++)
    assert.equal(all.cells.at(-1)![repeat * width + 1], 1);
});
test("all full-yoke coordinates roundtrip, including half-view seams and increase cells", () => {
  const project = make(),
    d = yokeDrawing(project, null);
  project.cells.forEach((row, r) =>
    row.forEach((_, c) => {
      const p = d.chartCell(r, c);
      assert.deepEqual(d.yokeCell(p.row, p.column), { row: r, column: c });
    }),
  );
  assert.equal(d.yokeCell(0, d.document.width), null);
});
test("repeat-group fill, copying and selection affect only the linked repeats", () => {
  const project = make();
  const group = [1, 4];
  const row = project.cells.length - 1;
  const width = project.cells[row].length / m.repeats;
  const filled = fillYoke(
    project,
    yokeDrawing(project, 1),
    row,
    width,
    2,
    group,
    false,
  );
  const selected = (line: number[]) =>
    Array.from({ length: m.repeats }, (_, section) => line[section * width]);
  const expected = Array.from({ length: m.repeats }, (_, section) =>
    group.includes(section) ? 2 : 0,
  );
  assert.deepEqual(selected(filled.cells[row]), expected);
  assert.equal(
    fillYoke(project, yokeDrawing(project, null), row, 0, 2, group, false),
    project,
  );
  const painted = editYokeSelection(
    project,
    yokeDrawing(project, 1),
    {
      startRow: 0,
      endRow: 0,
      startColumn: 0,
      endColumn: 0,
    },
    { type: "fill-yarn", color: "yarn-2" },
    group,
  ).project;
  assert.deepEqual(selected(painted.cells[row]), expected);
  const source = { ...project, cells: project.cells.map((line) => [...line]) };
  source.cells[row][width] = 2;
  assert.deepEqual(
    selected(copyYokeRepeat(source, 1, group).cells[row]),
    expected,
  );
});
test("copy cut paste move and rotation change yarn without moving increases or losing the source", () => {
  const project = make(),
    d = yokeDrawing(project, 1);
  const painted = editYokeSelection(
    project,
    d,
    area,
    { type: "fill-yarn", color: "yarn-2" },
    false,
  ).project;
  const block = copyYokeSelection(yokeDrawing(painted, 1).document, area)!;
  const cut = editYokeSelection(
    painted,
    yokeDrawing(painted, 1),
    area,
    { type: "cut" },
    false,
  ).project;
  const restored = editYokeSelection(
    cut,
    yokeDrawing(cut, 1),
    area,
    { type: "paste", block },
    false,
  ).project;
  assert.deepEqual(restored.cells, painted.cells);
  for (const action of [
    { type: "move", rows: 1, columns: 1 },
    { type: "transform", transform: "horizontal" },
    { type: "transform", transform: "vertical" },
    { type: "transform", transform: "rotate" },
  ] as const) {
    const next = editYokeSelection(
      painted,
      yokeDrawing(painted, 1),
      area,
      action,
      false,
    ).project;
    assert.deepEqual(next.events, project.events);
    assert.deepEqual(
      next.cells.map((row) => row.length),
      project.cells.map((row) => row.length),
    );
    assert.deepEqual(
      yokeChart(next).document.stitchActions,
      yokeChart(project).document.stitchActions,
    );
  }
  assert.equal(project.cells.flat().some(Boolean), false);
  const invalidMove = editYokeSelection(
    painted,
    yokeDrawing(painted, 1),
    area,
    { type: "move", rows: -1, columns: 0 },
    true,
  );
  assert.equal(invalidMove.project, painted);
});
test("flood and row fill are distinct and same-colour fills still propagate to all repeats", () => {
  const project = make();
  const row = project.cells.length - 1,
    width = project.cells[row].length / m.repeats;
  project.cells[row][width] = 2;
  const line = fillYoke(
    project,
    yokeDrawing(project, 0),
    row,
    0,
    0,
    true,
    true,
  );
  assert.equal(line.cells[row][width], 0);
  const flood = fillYoke(
    project,
    yokeDrawing(project, 0),
    row,
    0,
    1,
    false,
    false,
  );
  assert.equal(flood.cells[0][0], 1);
  assert.equal(flood.cells[0][project.cells[0].length / m.repeats], 0);
});
test("moving a motif into no-stitch space is refused instead of dropping yarn", () => {
  const project = make(),
    d = yokeDrawing(project, 0);
  const row = d.document.height - 1;
  const hole = d.document.stitchActions![row].findIndex(
    (x) => x === "no-stitch",
  );
  const active = d.document.stitchActions![row].findIndex(
    (x) => x !== "no-stitch",
  );
  const from = {
    startRow: row,
    startColumn: active,
    endRow: row,
    endColumn: active,
  };
  const painted = editYokeSelection(
    project,
    d,
    from,
    { type: "fill-yarn", color: "yarn-1" },
    false,
  ).project;
  assert.throws(
    () =>
      editYokeSelection(
        painted,
        yokeDrawing(painted, 0),
        from,
        { type: "move", rows: 0, columns: hole - active },
        false,
      ),
    /no-stitch/,
  );
});
test("cropped, zoomed canvas geometry keeps cells drawable and hit tests exact", () => {
  const project = make(),
    counts = project.cells.map((row) => row.length);
  for (const view of ["repeat", "whole", "front", "back"] as const) {
    const v = yokeCanvasViewport(counts, m.repeats, view, 1.4),
      g = yokeGeometry(counts, m.repeats, view, 1.4);
    assert.ok(g.radialHeight * v.scale >= 22);
    const r = 3,
      c = 2,
      angle = g.startAngle + ((c + 0.5) / g.shownCounts[r]) * g.arc,
      radius = g.inner + (r + 0.5) * g.radialHeight;
    const x = g.cx + Math.cos(angle) * radius,
      y = g.cy + Math.sin(angle) * radius;
    assert.ok(
      x >= v.x && x <= v.x + v.width && y >= v.y && y <= v.y + v.height,
    );
    for (const zoom of [0.25, 1, 3]) {
      const screenX = (x - v.x) * v.scale * zoom,
        screenY = (y - v.y) * v.scale * zoom;
      assert.deepEqual(
        yokeCellAt(
          counts,
          m.repeats,
          view,
          1.4,
          v.x + screenX / (v.scale * zoom),
          v.y + screenY / (v.scale * zoom),
        ),
        { row: r, column: (c + g.columnOffsets[r]) % counts[r] },
      );
    }
  }
});

test("bucket fill crosses placeholder columns and increase branches, but stops at colour boundaries", () => {
  const project = make();
  const snapshot = JSON.stringify(project);
  const filled = fillYoke(
    project,
    yokeDrawing(project, 2),
    0,
    2 * (project.cells[0].length / m.repeats),
    1,
    false,
    false,
  );
  filled.cells.forEach((row) => {
    const width = row.length / m.repeats;
    assert.ok(row.slice(2 * width, 3 * width).every((color) => color === 1));
    assert.ok(row.slice(0, 2 * width).every((color) => color === 0));
  });
  assert.equal(JSON.stringify(project), snapshot);
  const barrier = structuredClone(project);
  barrier.cells[10] = barrier.cells[10].map(() => 2);
  const lower = fillYoke(
    barrier,
    yokeDrawing(barrier, 0),
    0,
    0,
    1,
    false,
    false,
  );
  assert.equal(lower.cells[9][0], 1);
  assert.equal(lower.cells[10][0], 2);
  assert.equal(lower.cells[11][0], 0);
});

test("copy-to-all uses the chosen repeat on every round and is independent of editing scope", () => {
  const project = make();
  assert.equal(yokeRepeatsDiffer(project), false);
  project.cells.forEach((row) => {
    const width = row.length / m.repeats;
    row[2 * width] = 2;
  });
  assert.equal(yokeRepeatsDiffer(project), true);
  const snapshot = JSON.stringify(project);
  const copied = copyYokeRepeat(project, 2);
  assert.equal(yokeRepeatsDiffer(copied), false);
  copied.cells.forEach((row) => {
    const width = row.length / m.repeats;
    for (let repeat = 0; repeat < m.repeats; repeat++)
      assert.equal(row[repeat * width], 2);
  });
  assert.deepEqual(copied.events, project.events);
  assert.equal(JSON.stringify(project), snapshot);
  assert.equal(copyYokeRepeat(copied, 0), copied);
});
