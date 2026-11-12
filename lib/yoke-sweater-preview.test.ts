import assert from "node:assert/strict";
import { test } from "node:test";
import { yokeFabric } from "./yoke-fabric-preview";
import { yokeSweaterFabric } from "./yoke-sweater-preview";
import { asymmetricYoke } from "./yoke-test-fixtures";
import { yokeDocument } from "./yoke-document";
import {
  calculateYokeTargets,
  defaultYokeMeasurements,
  suggestYokeSchedule,
} from "./yoke-plan";
import { createYokeProject } from "./yoke-project";

test("the sweater uses the actual front and back yoke stitches and main-colour plain fabric", () => {
  const { document, project } = asymmetricYoke;
  const main = project.palette[0];
  const motifs = [];
  for (const side of ["front", "back"] as const) {
    const original = yokeFabric(document, side, 0, false);
    const sweater = yokeSweaterFabric(document, side);
    const nodes = sweater.rows.flat();
    const yoke = nodes.filter((node) => node.id < original.loops.length);
    const plain = nodes.filter((node) => node.id >= original.loops.length);
    const stitches = (loops: typeof nodes) =>
      loops.map(({ yarn, action }) => ({ yarn, action }));
    assert.deepEqual(stitches(yoke), stitches(original.rows.flat()));
    assert.ok(plain.length > 0 && plain.every((node) => node.yarn === main));
    assert.ok(plain.some((node) => node.action === "purl"));
    assert.ok(
      nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)),
    );
    assert.ok(sweater.width > sweater.height);
    motifs.push(stitches(yoke.filter((node) => node.yarn !== main)));
  }
  assert.notDeepEqual(motifs[0], motifs[1]);
});

test("the renderer keeps a deep yoke and a wider crew-neck opening", () => {
  const { document } = asymmetricYoke;
  const source = yokeFabric(document, "front", 0, false);
  const sweater = yokeSweaterFabric(document, "front");
  const row = (index: number) =>
    source.rows[index].map(({ id }) => sweater.loops[id]);
  const lower = row(0);
  const neck = row(document.height - 1);
  const halfWidth = (nodes: typeof lower) =>
    Math.max(...nodes.map(({ x, span }) => Math.abs(x) + span / 2));
  const centre = (nodes: typeof lower) =>
    nodes.reduce((best, node) =>
      Math.abs(node.x) < Math.abs(best.x) ? node : best,
    );
  assert.ok(centre(lower).y - centre(neck).y >= 50);
  assert.ok(halfWidth(neck) / halfWidth(lower) >= 0.27);
});

test("the same measurements keep similar sweater proportions at bulky, DK and fine gauges", () => {
  const dimensions = [
    [14, 20],
    [22, 30],
    [28, 38],
  ].map(([stitches, rows]) => {
    const measurements = {
      ...defaultYokeMeasurements,
      gaugeStitches: stitches,
      gaugeRows: rows,
      backRise: 0,
    };
    const plan = calculateYokeTargets(measurements);
    const project = createYokeProject(
      measurements,
      suggestYokeSchedule(plan, measurements.repeats),
    );
    const document = yokeDocument(project);
    const source = yokeFabric(document, "front", 0, false);
    const sweater = yokeSweaterFabric(document, "front");
    const centre = (index: number) =>
      source.rows[index]
        .map(({ id }) => sweater.loops[id])
        .reduce((best, node) =>
          Math.abs(node.x) < Math.abs(best.x) ? node : best,
        );
    const edge = sweater.loops[source.rows[0][0].id];
    const lower = centre(0);
    const neck = centre(plan.rounds - 1);
    const sweep = (lower.y - edge.y) / (lower.y - neck.y);
    assert.ok(sweep > 0.35 && sweep < 0.65);
    return { depth: lower.y - neck.y, aspect: sweater.width / sweater.height };
  });
  const depths = dimensions.map(({ depth }) => depth);
  const aspects = dimensions.map(({ aspect }) => aspect);
  assert.ok(Math.max(...depths) - Math.min(...depths) < 8);
  assert.ok(Math.max(...aspects) - Math.min(...aspects) < 0.1);
});
