import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildStitchTopology,
  topologyDiagramPositions,
} from "./stitch-topology-prototype";

for (const increase of ["m1l", "m1r"] as const)
  test(`${increase} creates a bar-rooted loop without consuming either neighbour`, () => {
    const g = buildStitchTopology(2, [
      ["knit", increase, "knit"],
      ["knit", "knit", "knit"],
    ]);
    assert.deepEqual(
      g.rows.map((r) => r.length),
      [2, 3, 3],
    );
    assert.deepEqual(g.rows[1][0].attachment, {
      kind: "through-loop",
      loop: "0:0",
    });
    assert.deepEqual(g.rows[1][2].attachment, {
      kind: "through-loop",
      loop: "0:1",
    });
    assert.deepEqual(g.rows[1][1].attachment, {
      kind: "lifted-bar",
      bar: "bar-0:0",
      twist: increase === "m1l" ? "left" : "right",
    });
    assert.deepEqual(g.rows[2][1].attachment, {
      kind: "through-loop",
      loop: "1:1",
    });
    const x = topologyDiagramPositions(g);
    assert.equal(x.get("0:0"), x.get("2:0"));
    assert.equal(x.get("0:1"), x.get("2:2"));
    assert.ok(x.get("1:1")! > x.get("0:0")! && x.get("1:1")! < x.get("0:1")!);
  });
test("decreases join two loops, not a bar", () => {
  for (const a of ["ssk", "k2tog"] as const) {
    const g = buildStitchTopology(3, [
      [a, "knit"],
      ["knit", "knit"],
    ]);
    assert.deepEqual(g.rows[1][0].attachment, {
      kind: "through-loops",
      loops: ["0:0", "0:1"],
      lean: a === "ssk" ? "left" : "right",
    });
    assert.deepEqual(g.rows[1][1].attachment, {
      kind: "through-loop",
      loop: "0:2",
    });
  }
});
test("invalid edge increases and missing stitches are rejected, not guessed", () => {
  assert.throws(
    () => buildStitchTopology(2, [["m1l", "knit", "knit"]]),
    /bar between/,
  );
  assert.throws(
    () => buildStitchTopology(2, [["knit", "knit", "m1r"]]),
    /bar between/,
  );
  assert.throws(() => buildStitchTopology(2, [["knit"]]), /not worked/);
  assert.throws(
    () => buildStitchTopology(2, [["knit", "m1l", "m1r", "knit"]]),
    /same bar/,
  );
});
test("changing M1 twist does not move the diagram tracks", () => {
  assert.deepEqual(
    topologyDiagramPositions(buildStitchTopology(2, [["knit", "m1l", "knit"]])),
    topologyDiagramPositions(buildStitchTopology(2, [["knit", "m1r", "knit"]])),
  );
});
