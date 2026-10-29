import {
  buildStitchTopology,
  StitchTopology,
  TopologyAction,
  topologyDiagramPositions,
} from "./stitch-topology-prototype";

export type SwatchPoint = { x: number; y: number };

/** Small flat swatches only. Uniform row height, local horizontal spacing and
 * continuing-loop constraints; no row-centering or fan seed. One base loop
 * fixes translation, not the width of every row. Not a general drape solver. */
export function layoutYarnSwatch(
  graph: StitchTopology,
  rowHeight = 0.8,
): Map<string, SwatchPoint> {
  if (!Number.isFinite(rowHeight) || rowHeight <= 0)
    throw new Error("Invalid row height");
  const initial = topologyDiagramPositions(graph);
  const nodes = graph.rows.flat().map((loop) => ({
    loop,
    x: initial.get(loop.id)! / 2,
    links: [] as { id: string; delta: number; weight: number }[],
  }));
  const byId = new Map(nodes.map((n) => [n.loop.id, n]));
  const bars = new Map(graph.bars.map((b) => [b.id, b]));
  const link = (a: string, b: string, delta: number, weight: number) => {
    byId.get(a)!.links.push({ id: b, delta, weight });
    byId.get(b)!.links.push({ id: a, delta: -delta, weight });
  };
  for (const row of graph.rows)
    for (const [i, l] of row.entries()) {
      if (i) link(l.id, row[i - 1].id, 1, 4);
      if (l.attachment.kind === "through-loop")
        link(l.id, l.attachment.loop, 0, 8);
      if (l.attachment.kind === "through-loops") {
        // A decrease draws two parent heads together. An average position
        // alone leaves a full stitch-width opening between those heads.
        link(l.id, l.attachment.loops[0], 0.28, 8);
        link(l.id, l.attachment.loops[1], -0.28, 8);
      }
    }
  for (let iteration = 0; iteration < 600; iteration++) {
    const next = nodes.map((n, i) => {
      if (i === 0) return 0;
      let sum = 0,
        weight = 0;
      for (const edge of n.links) {
        sum += (byId.get(edge.id)!.x + edge.delta) * edge.weight;
        weight += edge.weight;
      }
      const a = n.loop.attachment;
      // A bar attachment is not a consumed parent loop. It supplies a local
      // birth position, not the through-loop continuity constraint above.
      if (a.kind === "lifted-bar") {
        const bar = bars.get(a.bar)!;
        sum += (byId.get(bar.left)!.x + byId.get(bar.right)!.x) / 2;
        weight += 1;
      } else if (a.kind === "through-loops") {
        sum += (byId.get(a.loops[0])!.x + byId.get(a.loops[1])!.x) * 2;
        weight += 4;
      }
      return weight ? n.x * 0.25 + (sum / weight) * 0.75 : n.x;
    });
    nodes.forEach((n, i) => {
      n.x = next[i];
    });
  }
  return new Map(
    nodes.map((n) => [n.loop.id, { x: n.x, y: -n.loop.row * rowHeight }]),
  );
}

export function yarnSwatchSample(
  action: "plain" | "m1l" | "m1r",
): StitchTopology {
  const rows: TopologyAction[][] = [];
  for (let r = 1; r < 12; r++) {
    if (r === 5 && action !== "plain")
      rows.push([
        "knit",
        "knit",
        "knit",
        "knit",
        action,
        "knit",
        "knit",
        "knit",
        "knit",
      ]);
    else
      rows.push(
        Array<TopologyAction>(r > 5 && action !== "plain" ? 9 : 8).fill("knit"),
      );
  }
  return buildStitchTopology(8, rows);
}

/** Four increases adjacent to original column 3 (visual left-to-right order).
 * Placement is independent of twist: M1L/M1R must not change the lineage. */
export function repeatedYarnSample(
  action: "m1l" | "m1r",
  side: "left" | "right",
): StitchTopology {
  const rows: TopologyAction[][] = [];
  let added = 0;
  for (let row = 1; row < 16; row++) {
    const operations = Array<TopologyAction>(8 + added).fill("knit");
    if ([3, 6, 9, 12].includes(row)) {
      const cursor = side === "left" ? 3 + added : 4;
      operations.splice(cursor, 0, action);
      added++;
    }
    rows.push(operations);
  }
  return buildStitchTopology(8, rows);
}

export type PurlSamplePattern = "single" | "row" | "patch";

export function additionalStitchSample(
  action: "ssk" | "k2tog" | "purl",
  purlPattern: PurlSamplePattern = "patch",
) {
  const operations: TopologyAction[][] = [];
  for (let row = 1; row < 12; row++) {
    if (row === 5 && action !== "purl")
      operations.push(["knit", "knit", "knit", action, "knit", "knit", "knit"]);
    else
      operations.push(
        Array<TopologyAction>(action !== "purl" && row > 5 ? 7 : 8).fill(
          "knit",
        ),
      );
  }
  const graph = buildStitchTopology(8, operations);
  // Purls retain the same one-to-one loop connection. This patch denotes
  // front-facing bumps, independently of flat/in-the-round conventions.
  const purls = new Set(
    action !== "purl"
      ? []
      : purlPattern === "single"
        ? [graph.rows[5][3].id]
        : purlPattern === "row"
          ? graph.rows[5].slice(1, 7).map((loop) => loop.id)
          : graph.rows
              .slice(4, 7)
              .flatMap((row) => row.slice(2, 5).map((loop) => loop.id)),
  );
  return { graph, purls };
}
