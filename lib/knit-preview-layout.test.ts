import { strict as assert } from "node:assert";
import { test } from "node:test";
import { defaultDocument, StitchAction } from "./chart";
import {
  fabricSurface,
  layoutFabric,
  layoutPreviewRows,
} from "./knit-preview-layout";
import { shapingFixture } from "./knit-preview-fixtures";

const K: StitchAction = "knit",
  N: StitchAction = "no-stitch",
  B: StitchAction = "bind-off";
function layout(actions: StitchAction[][]) {
  return layoutPreviewRows({
    ...defaultDocument,
    width: actions[0].length,
    height: actions.length,
    stitchActions: actions,
  });
}

test("ordinary placeholders pack into continuous rows of different widths", () => {
  const rows = layout([
    [K, K, K, K, K],
    [K, "m1l", K, N, K],
    [K, N, K, N, K],
  ]);
  assert.deepEqual(
    rows.map((r) => r.width),
    [5, 4, 3],
  );
  assert.deepEqual(
    rows[2].loops.map((l) => l.x),
    [0, 1, 2],
  );
  assert.deepEqual(
    rows[2].loops.map((l) => l.column),
    [0, 2, 4],
  );
});

test("bind-off neckline stays open above its closing edge", () => {
  const rows = layout([
    [K, N, N, N, K],
    [K, K, N, K, K],
    [K, K, B, K, K],
    [K, K, K, K, K],
  ]);
  assert.deepEqual(
    rows.map((r) => r.width),
    [5, 5, 5, 5],
  );
  assert.deepEqual(
    rows[0].loops.map((l) => l.x),
    [0, 4],
  );
  assert.deepEqual(
    rows[1].loops.map((l) => l.x),
    [0, 1, 3, 4],
  );
  assert.equal(rows[2].loops.length, 5);
});

test("unrelated placeholders still collapse on rows with an opening", () => {
  const rows = layout([
    [K, N, K, N, K],
    [K, N, K, B, K],
  ]);
  assert.equal(rows[0].width, 4);
  assert.deepEqual(
    rows[0].loops.map((l) => l.x),
    [0, 1, 3],
  );
});

test("cast-on reconnects an opening without changing rows beneath", () => {
  const rows = layout([
    [K, N, K],
    [K, "cast-on", K],
    [K, N, K],
    [K, B, K],
  ]);
  assert.deepEqual(
    rows.map((r) => r.width),
    [2, 3, 3, 3],
  );
  assert.equal(rows[2].loops.length, 2);
});

test("shoulders stay separate before a cast-on joins them", () => {
  const rows = layout([
    [K, K, K, K, K],
    [K, K, "cast-on", K, K],
    [K, K, N, K, K],
    [K, N, N, N, K],
  ]);
  assert.deepEqual(
    rows.map((r) => r.width),
    [5, 5, 5, 5],
  );
  assert.deepEqual(
    rows[3].loops.map((l) => l.x),
    [0, 4],
  );
  assert.deepEqual(
    rows[1].loops.map((l) => l.sources),
    [[0], [1], [], [3], [4]],
  );
});

test("cast-on history stops at worked cells and does not preserve unrelated placeholders", () => {
  const rows = layout([
    [K, N, "cast-on", K],
    [K, N, N, K],
    [K, K, K, K],
    [K, N, N, K],
  ]);
  assert.equal(rows[1].width, 4);
  assert.equal(rows[2].width, 4);
  assert.equal(rows[3].width, 2);
  assert.deepEqual(
    layout([
      [K, N, K, "cast-on", K],
      [K, N, K, N, K],
    ])[1].loops.map((l) => l.x),
    [0, 1, 3],
  );
});

test("edge cast-ons preserve the earlier underarm indentation", () => {
  const rows = layout([
    [K, K, K, K, K],
    ["cast-on", K, K, K, "cast-on"],
    [N, K, K, K, N],
    [N, N, K, N, N],
  ]);
  assert.deepEqual(
    rows[2].loops.map((l) => l.x),
    [1, 2, 3],
  );
  assert.deepEqual(
    rows[3].loops.map((l) => l.x),
    [2],
  );
});

test("several cast-on joins preserve separate earlier gaps", () => {
  const rows = layout([
    [K, "cast-on", K, "cast-on", K],
    [K, N, K, N, K],
  ]);
  assert.deepEqual(
    rows[1].loops.map((l) => l.x),
    [0, 2, 4],
  );
  assert.deepEqual(
    rows[0].loops.map((l) => l.sources),
    [[0], [], [2], [], [4]],
  );
});

test("edge bind-offs preserve armhole indentation", () => {
  const rows = layout([
    [N, N, K, K, N],
    [N, B, K, K, B],
    [K, K, K, K, K],
  ]);
  assert.deepEqual(
    rows[0].loops.map((l) => l.x),
    [2, 3],
  );
});

test("bind-off-adjacent gaps remain open in top-down chart orientation too", () => {
  const rows = layout([
    [K, K, K, K, K],
    [K, K, B, K, K],
    [K, K, N, K, K],
    [K, N, N, N, K],
  ]);
  assert.deepEqual(
    rows.map((r) => r.width),
    [5, 5, 5, 5],
  );
  assert.deepEqual(
    rows[2].loops.map((n) => n.x),
    [0, 1, 3, 4],
  );
  assert.deepEqual(
    rows[3].loops.map((n) => n.x),
    [0, 4],
  );
});

test("top-down bind-off gap history stops at a solid worked row", () => {
  const rows = layout([
    [K, B, K],
    [K, N, K],
    [K, K, K],
    [K, N, K],
  ]);
  assert.deepEqual(
    rows.map((r) => r.width),
    [3, 3, 3, 2],
  );
});

test("a BO supported from above does not discard ordinary connections on either boundary row", () => {
  const rows = layout([
    [K, K, K, K, K],
    [K, K, B, K, K],
    [K, K, N, K, K],
    [K, N, N, N, K],
  ]);
  assert.deepEqual(
    rows[0].loops.map((n) => n.sources),
    [[0], [1], [2], [3], [4]],
  );
  assert.deepEqual(
    rows[1].loops.map((n) => n.sources),
    [[0], [1], [], [3], [4]],
  );
});

test("output loops use existing shaping maths, not input stitch count", () => {
  const rows = layout([
    [
      "kfb",
      "inc",
      "m1l",
      "m1r",
      "k2tog",
      "ssk",
      "cdd",
      "dec",
      "purl",
      "cast-on",
    ],
  ]);
  assert.equal(rows[0].width, 12);
  assert.deepEqual(
    rows[0].loops.map((l) => l.column),
    [0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test("blank chart has no phantom fabric", () => {
  assert.deepEqual(
    layout([
      [N, N],
      [N, N],
    ]),
    [
      { width: 0, loops: [] },
      { width: 0, loops: [] },
    ],
  );
});

test("ordinary colour chart retains original dimensions", () => {
  assert.deepEqual(
    layoutPreviewRows({
      ...defaultDocument,
      width: 3,
      height: 2,
      stitchActions: undefined,
    }).map((r) => r.width),
    [3, 3],
  );
});

test("M1 connects to the bar between neighbours without consuming a parent", () => {
  const rows = layout([
    [K, "m1l", K],
    [K, N, K],
  ]);
  assert.deepEqual(
    rows[0].loops.map((l) => l.sources),
    [[0], [0, 1], [1]],
  );
});

test("both decrease directions consume two parents and preserve remaining order", () => {
  for (const action of ["ssk", "k2tog"] as StitchAction[]) {
    const rows = layout([
      [action, K, N],
      [K, K, K],
    ]);
    assert.deepEqual(
      rows[0].loops.map((l) => l.sources),
      [[0, 1], [2]],
    );
  }
});

test("KFB output loops share a parent", () => {
  assert.deepEqual(
    layout([
      ["kfb", K],
      [K, K],
    ])[0].loops.map((l) => l.sources),
    [[0], [0], [1]],
  );
});

test("lineage never crosses a bind-off opening", () => {
  const rows = layout([
    [K, N, K],
    [K, B, K],
    [K, K, K],
  ]);
  assert.deepEqual(
    rows[0].loops.map((l) => l.sources),
    [[0], [2]],
  );
});

test("incompatible row counts do not invent connections", () => {
  assert.equal(
    layout([
      [K, K, K],
      [K, N, K],
    ])[0].loops[0].sources,
    undefined,
  );
});

function fabric(actions: StitchAction[][], repeats = 1, mirrored = false) {
  return layoutFabric(
    {
      ...defaultDocument,
      width: actions[0].length,
      height: actions.length,
      stitchActions: actions,
    },
    repeats,
    mirrored,
  );
}
test("changing M1 lean does not translate the fabric", () => {
  const left = fabric([
    [K, K, K],
    [K, "m1l", K],
    [K, N, K],
  ]);
  const right = fabric([
    [K, K, K],
    [K, "m1r", K],
    [K, N, K],
  ]);
  assert.deepEqual(left, right);
});
test("plain fabric stays on an exact regular grid", () => {
  const { rows } = fabric([
    [K, K, K],
    [K, K, K],
    [K, K, K],
  ]);
  for (const row of rows) {
    assert.deepEqual(
      row.loops.map((l) => l.center),
      [0.5, 1.5, 2.5],
    );
    assert.deepEqual(
      row.loops.map((l) => l.span),
      [1, 1, 1],
    );
  }
});
test("repeated increases widen actual fabric without stretching narrower rows to fit", () => {
  const { rows } = fabric(
    [
      [K, K, K, K, K],
      [K, "m1l", K, "m1l", K],
      [K, N, K, N, K],
    ],
    3,
  );
  assert.deepEqual(
    rows.map((row) => row.width),
    [15, 15, 9],
  );
  for (const row of rows) {
    assert.ok(
      Math.abs(
        row.loops.reduce((sum, loop) => sum + loop.span, 0) - row.width,
      ) < 1e-9,
    );
    for (const loop of row.loops) assert.ok(loop.span > 0.6 && loop.span < 1.4);
    for (let i = 1; i < row.loops.length; i++) {
      const a = row.loops[i - 1],
        b = row.loops[i];
      assert.ok(
        Math.abs(a.center + a.span / 2 - (b.center - b.span / 2)) < 1e-9,
      );
    }
  }
});
test("ordinary stitches retain the correct parents across repeat boundaries", () => {
  const { rows } = fabric(
    [
      [K, "m1l", K],
      [K, N, K],
    ],
    3,
  );
  assert.deepEqual(
    rows[0].loops
      .filter((l) => l.column % 3 !== 1)
      .map((l) => l.parentCenters[0]),
    rows[1].loops.map((l) => l.center),
  );
});
test("mirrored repeats reverse shaping positions before finding parents", () => {
  const { rows } = fabric(
    [
      [K, "m1l", K, K],
      [K, N, K, K],
    ],
    2,
    true,
  );
  assert.deepEqual(
    rows[0].loops.map((l) => l.parentCenters.length),
    [1, 2, 1, 1, 1, 1, 2, 1],
  );
  assert.equal(rows[1].loops.length, 6);
});
test("decreases narrow repeated fabric by the correct stitch count", () => {
  const { rows } = fabric(
    [
      [K, "ssk", K, N],
      [K, K, K, K],
    ],
    3,
  );
  assert.deepEqual(
    rows.map((r) => r.width),
    [9, 12],
  );
});
test("shaping is symmetric without a direction-driven row offset", () => {
  const { rows, pitch } = fabric([
    [K, K, K],
    [K, "m1l", K],
    [K, N, K],
  ]);
  for (const row of rows)
    assert.ok(
      Math.abs(row.loops[0].center + row.loops.at(-1)!.center - pitch) < 1e-9,
    );
});
test("relaxation keeps a bind-off neckline open", () => {
  const { rows } = fabric([
    [K, N, N, N, K],
    [K, K, N, K, K],
    [K, K, B, K, K],
    [K, K, K, K, K],
  ]);
  assert.ok(rows[0].loops[1].center - rows[0].loops[0].center > 3);
  assert.equal(rows[0].loops[0].parentCenters.length, 1);
  assert.equal(rows[0].loops[1].parentCenters.length, 1);
});

function growingSurface(repeats = 3, decreasing = false) {
  // Reversing an increase chart does not create valid decrease instructions.
  const document = shapingFixture(decreasing ? 8 : 4, decreasing ? 4 : 8, 9);
  const layout = layoutFabric(document, repeats);
  return {
    layout,
    surface: fabricSurface(document, layout.rows, layout.pitch),
  };
}
test("growth bends rows without progressively squashing later repeats", () => {
  for (const decreasing of [false, true]) {
    const { layout, surface } = growingSurface(3, decreasing);
    assert.equal(surface.curved, true);
    const points = [
      [0, 0.2],
      [3, 0.7],
      [7, 0.4],
    ];
    const distance = (repeat: number) => {
      const p = points.map(([r, f]) =>
        surface.point(r, (layout.rows[r].width / 3) * (repeat + f)),
      );
      return [
        Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
        Math.hypot(p[1].x - p[2].x, p[1].y - p[2].y),
      ];
    };
    for (const repeat of [1, 2])
      distance(repeat).forEach((d, i) =>
        assert.ok(Math.abs(d / distance(0)[i] - 1) < 0.1),
      );
  }
});
test("repeat count changes visible extent, not motif dimensions", () => {
  const distance = (repeats: number) => {
    const { layout, surface } = growingSurface(repeats);
    assert.equal(surface.curved, true);
    const a = surface.point(0, (layout.rows[0].width / repeats) * 0.3);
    const b = surface.point(7, (layout.rows[7].width / repeats) * 0.6);
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  assert.ok(Math.abs(distance(1) / distance(3) - 1) < 0.1);
});
test("ordinary charts keep straight rows and original gauge", () => {
  const document = {
    ...defaultDocument,
    width: 8,
    height: 9,
    stitchActions: undefined,
  };
  const layout = layoutFabric(document, 3);
  const surface = fabricSurface(document, layout.rows, layout.pitch);
  assert.equal(surface.curved, false);
  assert.deepEqual(surface.point(2, 7), {
    x: 7,
    y: (2.5 * document.gaugeStitches) / document.gaugeRows,
    angle: 0,
    scale: 1,
  });
});
test("bind-offs prevent inferred bending of a vest neckline", () => {
  const actions: StitchAction[][] = [
    [K, N, N, N, K],
    [K, K, N, K, K],
    [K, K, B, K, K],
    [K, K, K, K, K],
  ];
  const document = {
    ...defaultDocument,
    width: 5,
    height: 4,
    stitchActions: actions,
  };
  const layout = layoutFabric(document, 3);
  assert.equal(
    fabricSurface(document, layout.rows, layout.pitch).curved,
    false,
  );
});
test("surface bounds include every stitch centre", () => {
  const { layout, surface } = growingSurface();
  layout.rows.forEach((row, r) =>
    row.loops.forEach((loop) => {
      const p = surface.point(r, loop.x + 0.5);
      assert.ok(
        p.x >= surface.minX - 1e-9 &&
          p.x <= surface.minX + surface.width + 1e-9,
      );
      assert.ok(
        p.y >= surface.minY - 1e-9 &&
          p.y <= surface.minY + surface.height + 1e-9,
      );
      assert.ok(p.scale >= 0.65 && p.scale <= 1.35);
    }),
  );
});
