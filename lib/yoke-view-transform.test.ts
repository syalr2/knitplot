import { test } from "node:test";
import assert from "node:assert/strict";
import {
  presentYokePoint,
  unpresentYokePoint,
  fitYokeZoom,
} from "./yoke-view-transform";
import { yokeGeometry, yokeCellAt } from "./yoke-layout";
import { yokeCanvasViewport, yokeBitmapScale } from "./yoke-canvas-view";

test("Retina bitmaps match screen density without exceeding the size budget", () => {
  assert.equal(yokeBitmapScale(600, 400, 1, 2), 2);
  assert.equal(yokeBitmapScale(600, 400, 2, 3), 6);
  const scale = yokeBitmapScale(12000, 6000, 4, 3);
  assert.ok(12000 * scale <= 8192);
  assert.ok(12000 * 6000 * scale * scale <= 12_000_000 + 1);
});

test("sideways view maps both edges and roundtrips without reflecting stitches", () => {
  assert.deepEqual(presentYokePoint({ x: 0, y: 0 }, 300, true), {
    x: 0,
    y: 300,
  });
  assert.deepEqual(presentYokePoint({ x: 300, y: 600 }, 300, true), {
    x: 600,
    y: 0,
  });
  for (const sideways of [false, true])
    for (const point of [
      { x: 1.5, y: 97 },
      { x: 0, y: 0 },
      { x: 299, y: 600 },
    ])
      assert.deepEqual(
        unpresentYokePoint(
          presentYokePoint(point, 300, sideways),
          300,
          sideways,
        ),
        point,
      );
});
test("rotated, cropped and zoomed points still identify the same stitch", () => {
  const counts = Array.from(
    { length: 118 },
    (_, r) => 120 + Math.floor(r / 10) * 12,
  );
  const g = yokeGeometry(counts, 12, "repeat", 1.4),
    v = yokeCanvasViewport(counts, 12, "repeat", 1.4);
  for (const r of [0, 58, 117])
    for (const sideways of [false, true])
      for (const zoom of [0.05, 1, 4]) {
        const c = 2,
          angle = g.startAngle + ((c + 0.5) / g.shownCounts[r]) * g.arc;
        const radius = g.inner + (r + 0.5) * g.radialHeight;
        const p = presentYokePoint(
          {
            x: g.cx + Math.cos(angle) * radius - v.x,
            y: g.cy + Math.sin(angle) * radius - v.y,
          },
          v.width,
          sideways,
        );
        const screen = { x: p.x * v.scale * zoom, y: p.y * v.scale * zoom };
        const actual = unpresentYokePoint(
          { x: screen.x / (v.scale * zoom), y: screen.y / (v.scale * zoom) },
          v.width,
          sideways,
        );
        assert.deepEqual(
          yokeCellAt(counts, 12, "repeat", 1.4, v.x + actual.x, v.y + actual.y),
          { row: r, column: c },
        );
      }
});
test("fit zoom fits both orientations, accepts small overviews and remains bounded", () => {
  for (const [width, height] of [
    [700, 5000],
    [5000, 700],
  ]) {
    const zoom = fitYokeZoom(width, height, 2, 900, 600);
    assert.ok((width * 2 * zoom) / 100 <= 880);
    assert.ok((height * 2 * zoom) / 100 <= 580);
    assert.ok(zoom < 15);
  }
  assert.equal(fitYokeZoom(1, 1, 1, 1000, 1000), 400);
  assert.equal(fitYokeZoom(1000, 1000, 1, 0, 0), 1);
});
