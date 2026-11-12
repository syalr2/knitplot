import { test } from "node:test";
import assert from "node:assert/strict";
import { createYokeProject, paintYoke } from "./yoke-project";
import {
  defaultYokeMeasurements as m,
  calculateYokeTargets,
  suggestYokeSchedule,
} from "./yoke-plan";
import { yokeDocument } from "./yoke-document";
import { yokeFabric } from "./yoke-fabric-preview";
import { planYokeShortRows } from "./yoke-short-rows";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { reviseYokeStitches } from "./yoke-stitch-revision";
import { withYokeProgram } from "./yoke-program-state";

const plain = () =>
  createYokeProject(m, suggestYokeSchedule(calculateYokeTargets(m), m.repeats));
test("complete yoke contains every live stitch, real bars and back-neck courses", () => {
  const project = plain();
  const document = yokeDocument(project);
  const original = JSON.stringify(document);
  const fabric = yokeFabric(document);
  const plan = planYokeShortRows(m);
  assert.deepEqual(
    fabric.rows.slice(0, project.cells.length).map((row) => row.length),
    project.cells.map((row) => row.length).reverse(),
  );
  const shortRows = fabric.rows.slice(project.cells.length).flat();
  assert.equal(shortRows.length, 4 * plan.distances.reduce((a, b) => a + b, 0));
  const edge = Math.max(...plan.distances);
  assert.ok(
    shortRows.every((n) => n.packed < edge || n.packed >= plan.neck - edge),
  );
  assert.ok(
    fabric.loops.some((n) => n.kind === "bar" && n.parents.length === 2),
  );
  assert.ok(
    fabric.loops.every(
      (n) =>
        Number.isFinite(n.x) &&
        Number.isFinite(n.y) &&
        n.yarn === project.palette[0],
    ),
  );
  assert.equal(JSON.stringify(document), original);
});

test("whole yoke closes every complete round around an open neckline", () => {
  const project = plain();
  const fabric = yokeFabric(yokeDocument(project));
  for (const row of fabric.rows.slice(0, project.cells.length)) {
    assert.equal(row[0].left, row.at(-1)!.id);
    assert.equal(row.at(-1)!.right, row[0].id);
  }
  assert.ok(Math.abs(fabric.width - fabric.height) < fabric.width * 0.05);
  assert.ok(fabric.loops.every(({ x, y }) => Math.hypot(x, y) > 2));
});

test("front and back partition each round, including the back-neck short rows", () => {
  const document = yokeDocument(plain());
  const whole = yokeFabric(document);
  const front = yokeFabric(document, "front");
  const back = yokeFabric(document, "back");
  for (const [index, row] of whole.rows.entries()) {
    assert.deepEqual(
      [...front.rows[index], ...back.rows[index]]
        .map((node) => node.action)
        .sort(),
      row.map((node) => node.action).sort(),
    );
    for (const node of front.rows[index]) {
      const original = whole.loops[node.id];
      assert.equal(node.x, -original.x);
      assert.equal(node.y, -original.y);
      assert.equal(node.angle, original.angle + Math.PI);
    }
    for (const node of back.rows[index]) {
      const original = whole.loops[node.id];
      assert.equal(node.x, original.x);
      assert.equal(node.y, original.y);
      assert.equal(node.angle, original.angle);
    }
  }
  assert.ok(back.rows.at(-1)!.length > front.rows.at(-1)!.length);
});

test("unequal repeats retain actual yarn, split, decrease and purl instructions", () => {
  const base = plain();
  const project = paintYoke(base, base.cells.length - 1, 3, 2, false);
  const program = yokeProgramFromProject(project),
    round = program.rounds.length - 1;
  const edited = reviseYokeStitches(program, [
    {
      round,
      section: 0,
      operation: program.rounds[round][0][3].id,
      action: "kfb",
    },
    {
      round,
      section: 1,
      operation: program.rounds[round][1][3].id,
      action: "ssk",
    },
    {
      round,
      section: 2,
      operation: program.rounds[round][2][3].id,
      action: "purl",
    },
  ]);
  const revised = withYokeProgram(project, edited);
  const fabric = yokeFabric(yokeDocument(revised));
  assert.equal(fabric.rows[0].length, revised.cells.at(-1)!.length);
  const split = fabric.rows[0].filter((n) => n.kind === "split");
  assert.equal(split.length, 2);
  assert.ok(
    split.every((n) => n.yarn === project.palette[2] && n.parents.length === 1),
  );
  assert.equal(split[0].column, split[1].column);
  assert.equal(split[0].parents[0], split[1].parents[0]);
  assert.equal(
    fabric.rows[0].find((n) => n.action === "ssk")?.parents.length,
    2,
  );
  assert.equal(
    fabric.rows[0].find((n) => n.action === "purl")?.parents.length,
    1,
  );
  const repeat = (index: number) =>
    yokeFabric(yokeDocument(revised), "repeat", index).rows[0];
  assert.equal(repeat(0).filter((n) => n.kind === "split").length, 2);
  assert.equal(repeat(1).filter((n) => n.action === "ssk").length, 1);
  assert.equal(repeat(2).filter((n) => n.action === "purl").length, 1);
  assert.ok(repeat(0).length > repeat(1).length);
});

test("bind-off edge is visible but its opening is not filled with yarn on the next round", () => {
  const project = plain();
  const program = yokeProgramFromProject(project),
    round = program.rounds.length - 2;
  const edited = reviseYokeStitches(program, [
    {
      round,
      section: 0,
      operation: program.rounds[round][0][3].id,
      action: "bind-off",
    },
  ]);
  const fabric = yokeFabric(yokeDocument(withYokeProgram(project, edited)));
  const edge = fabric.rows[1].find((n) => n.action === "bind-off");
  assert.equal(edge?.parents.length, 1);
  assert.ok(
    fabric.rows[0].some(
      (n, i, row) =>
        i > 0 && n.packed > row[i - 1].packed + 1 && n.left === undefined,
    ),
  );
  assert.equal(fabric.rows[0].length, project.cells.at(-1)!.length - 1);
});
