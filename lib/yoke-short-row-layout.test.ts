import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultYokeMeasurements } from "./yoke-plan";
import { planYokeShortRows } from "./yoke-short-rows";
import { shortRowCells, shortRowViewCells } from "./yoke-short-row-layout";

test("whole-yoke partial rows join round one without gaps in either turn direction", () => {
  for (const distances of [
    [25, 30, 34],
    [34, 30, 25],
  ]) {
    const plan = planYokeShortRows(defaultYokeMeasurements, { distances });
    const cells = shortRowCells(plan, 95, 4);
    assert.equal(cells.length, 4 * distances.reduce((a, b) => a + b, 0));
    for (let column = 0; column < plan.neck; column++) {
      const stack = cells.filter((cell) => cell.column === column);
      const expected =
        distances.filter((d) => column < d || column >= plan.neck - d).length *
        2;
      assert.equal(stack.length, expected);
      if (stack.length) assert.equal(stack.at(-1)!.outer, 95);
      stack.forEach((cell, index) => {
        assert.ok(cell.inner >= 35);
        if (index) assert.equal(cell.inner, stack[index - 1].outer);
      });
    }
    assert.equal(cells.filter((cell) => cell.column === 0).length, 6);
    assert.equal(cells.filter((cell) => cell.column === 42).length, 0);
  }
});

test("back half shows the actual back-centred courses; the front centre stays unworked", () => {
  const plan = planYokeShortRows(defaultYokeMeasurements);
  const back = shortRowViewCells(plan, 95, 4, "back"),
    front = shortRowViewCells(plan, 95, 4, "front");
  const coversCentre = (cell: { start: number; end: number }) =>
    cell.start <= Math.PI / 2 && cell.end > Math.PI / 2;
  assert.equal(back.filter(coversCentre).length, plan.extraRows);
  assert.equal(front.filter(coversCentre).length, 0);
  assert.notDeepEqual(back, front);
  assert.equal(back.length + front.length, shortRowCells(plan, 95, 4).length);
  for (const cell of [...back, ...front])
    assert.ok(cell.start >= 0 && cell.end <= Math.PI);
});

test("zero short rows produce no cells and large height allowances retain a neck opening", () => {
  assert.equal(
    shortRowCells(
      planYokeShortRows({ ...defaultYokeMeasurements, backRise: 0 }),
      95,
      4,
    ).length,
    0,
  );
  const cells = shortRowCells(
    planYokeShortRows(defaultYokeMeasurements),
    95,
    100,
  );
  assert.equal(Math.min(...cells.map((cell) => cell.inner)), 35);
});
