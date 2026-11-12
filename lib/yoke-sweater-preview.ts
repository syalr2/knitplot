import type { ChartDocument } from "./chart";
import type { ConnectedFabric, ConnectedLoop } from "./connected-preview";
import { yokeFabric } from "./yoke-fabric-preview";
import { calculateYokeTargets } from "./yoke-plan";

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** An upright, flat-lay sketch. Reproject the chart's real courses and use the
 * same stitch sprites to add plain fabric below the split and ribbed edges. */
export function yokeSweaterFabric(
  document: ChartDocument,
  side: "front" | "back",
): ConnectedFabric {
  const project = document.yoke;
  if (!project) throw new Error("This chart has no yoke instructions.");
  const fabric = yokeFabric(document, side, 0, false);
  const plan = calculateYokeTargets(project.measurements);
  const gauge = document.gaugeStitches / document.gaugeRows;
  const bodyHalf = 53;
  const unit = (4 * bodyHalf) / plan.body;
  const sleeveRoot = clamp((plan.sleeveFromYoke * unit) / 2, 19, 37);
  const neckHalf = clamp(plan.neck * unit * 0.28, 22, 32);
  const joinHalf = bodyHalf + sleeveRoot;
  const courseCounts = fabric.courseWidths.slice(0, plan.rounds).reverse();
  const neckCount = courseCounts[0];
  const endCount = courseCounts.at(-1)!;
  // Derive vertical scale from the same stitch spacing that spans the neckline
  // and lower edge. Compensate for the shortening at the curved shoulder.
  const neckPitch = (4 * neckHalf) / Math.max(1, neckCount);
  const endPitch = (4 * joinHalf) / Math.max(1, endCount);
  const depth = clamp(
    (plan.rounds - 1) * gauge * mix(neckPitch, endPitch, 0.65) * 1.4,
    42,
    90,
  );
  // Smooth abrupt jumps at increase rounds without making the middle courses
  // artificially wide. The endpoints still meet the collar and garment split.
  const smoothing = Math.max(2, Math.floor(plan.rounds / 7));
  const courseHalves = courseCounts.map((_, r) => {
    if (!r) return neckHalf;
    if (r === plan.rounds - 1) return joinHalf;
    let sum = 0,
      weight = 0;
    for (
      let i = Math.max(0, r - smoothing);
      i <= Math.min(plan.rounds - 1, r + smoothing);
      i++
    ) {
      const w = smoothing + 1 - Math.abs(i - r);
      sum += courseCounts[i] * w;
      weight += w;
    }
    const t = r / (plan.rounds - 1);
    const growth =
      endCount > neckCount
        ? clamp((sum / weight - neckCount) / (endCount - neckCount), 0, 1)
        : t;
    return mix(
      neckHalf,
      joinHalf,
      mix(growth, Math.sin((t * Math.PI) / 2), 0.25),
    );
  });
  const yokePitch = depth / Math.max(1, plan.rounds - 1);
  const shortPitch = Math.min(yokePitch * 0.45, 0.35);
  const plainSpan = clamp(unit, 0.55, 2.1);
  const plainPitch = clamp(gauge * plainSpan, 0.44, 1.65);
  const dip = neckHalf * (side === "front" ? 0.49 : 0.18);
  const yarn = project.palette[0];
  // The flat-lay reference has a low centre-front arc, not a flattened
  // trapezoid. Use the same arc for the last patterned row and the join.
  const hemBow = depth * 0.43;
  const courseArc = (u: number) => Math.cos((u * Math.PI) / 2);
  const lowerCourse = (x: number) =>
    depth - hemBow * (1 - courseArc(x / joinHalf));

  function coursePosition(packed: number, width: number, round: number) {
    const frontStart = Math.floor(width / 4);
    const frontSize = Math.ceil(width / 2);
    const start = side === "front" ? frontStart : frontStart + frontSize;
    const size = Math.max(1, side === "front" ? frontSize : width - frontSize);
    let offset = (packed - start + width) % width;
    if (offset > (width + size) / 2) offset -= width;
    // Keep the same left/right orientation as the existing half-yoke views.
    const u = 1 - (2 * (offset + 0.5)) / size;
    const t = clamp(round / Math.max(1, plan.rounds - 1), 0, 1);
    const half = courseHalves[Math.max(0, round)];
    const edge = clamp(u, -1, 1);
    const bow = mix(dip, hemBow, t);
    const x = half * u;
    const y =
      (depth - hemBow) * t +
      bow * courseArc(edge) +
      Math.min(0, round) * shortPitch;
    const dx = half;
    const dy = -(Math.PI / 2) * Math.sin((edge * Math.PI) / 2) * bow;
    return {
      x,
      y,
      span: Math.max(0.15, (2 * Math.hypot(dx, dy)) / size),
      angle: Math.atan2(dy, dx),
      heightScale: Math.max(0.14, (round < 0 ? shortPitch : yokePitch) / gauge),
    };
  }

  // Keep the full loop table: edge increases may refer to a loop on the far side.
  const loops = fabric.loops.map((node) => ({
    ...node,
    ...coursePosition(
      node.packed,
      fabric.courseWidths[node.row],
      plan.rounds - 1 - node.row,
    ),
  }));
  const pattern = fabric.rows.map((row) => row.map((node) => loops[node.id]));
  function plainBand(
    row: ConnectedLoop[],
    left: number,
    right: number,
    y: number,
    rib: boolean,
    slope = 0,
    edge?: (x: number) => number,
  ) {
    const count = Math.max(1, Math.round((right - left) / plainSpan));
    const span = (right - left) / count;
    for (let column = 0; column < count; column++) {
      const x = left + (column + 0.5) * span;
      const node: ConnectedLoop & { heightScale: number } = {
        id: loops.length,
        row: 0,
        column,
        packed: column,
        action: rib && column % 4 >= 2 ? "purl" : "knit",
        kind: "start",
        parents: [],
        boundary: false,
        x,
        y: y + (column + 0.5 - count / 2) * span * slope + (edge?.(x) ?? 0),
        span,
        angle: Math.atan(slope),
        heightScale: plainPitch / gauge,
        yarn,
      };
      loops.push(node);
      row.push(node);
    }
  }

  const body = [];
  const bodyRows = Math.ceil(83 / plainPitch);
  const sleeveRows = Math.ceil(86 / plainPitch);
  for (let r = 0; r < Math.max(bodyRows, sleeveRows); r++) {
    const y = yokePitch / 2 + (r + 0.5) * plainPitch;
    const row: ConnectedLoop[] = [];
    if (r < bodyRows) {
      const t = r / (bodyRows - 1);
      const half = bodyHalf - 2 * t ** 5;
      plainBand(row, -half, half, y, bodyRows - r <= 9, 0, (x) =>
        mix(lowerCourse(x), depth, Math.min(1, t * 2)),
      );
    }
    if (r < sleeveRows) {
      const t = r / (sleeveRows - 1);
      const width = mix(sleeveRoot, sleeveRoot * 0.6, t ** 0.85);
      const inner = bodyHalf + 37 * t + 3 * Math.sin(t * Math.PI);
      const cuffHeight = lowerCourse(bodyHalf + sleeveRoot * 0.55);
      const sleeveEdge = (x: number) => {
        const local = (Math.abs(x) - inner) / width;
        return mix(lowerCourse(bodyHalf + local * sleeveRoot), cuffHeight, t);
      };
      plainBand(
        row,
        inner,
        inner + width,
        y,
        sleeveRows - r <= 9,
        -0.18 * t,
        sleeveEdge,
      );
      plainBand(
        row,
        -inner - width,
        -inner,
        y,
        sleeveRows - r <= 9,
        0.18 * t,
        sleeveEdge,
      );
    }
    body.push(row);
  }

  const collar: ConnectedLoop[][] = [];
  const neck = fabric.courseWidths[plan.rounds - 1];
  // The topmost existing course at each neck position is higher on the back.
  const shortRowDepth = new Map<number, number>();
  for (const row of fabric.rows.slice(plan.rounds))
    for (const node of row)
      shortRowDepth.set(
        node.packed,
        Math.max(
          shortRowDepth.get(node.packed) ?? 0,
          node.row - plan.rounds + 1,
        ),
      );
  const start =
    Math.floor(neck / 4) + (side === "back" ? Math.ceil(neck / 2) : 0);
  const size = side === "front" ? Math.ceil(neck / 2) : Math.floor(neck / 2);
  const neckRiseAt = (u: number) => {
    const offset = Math.min(size - 1, Math.floor(((1 - u) / 2) * size));
    return (shortRowDepth.get((start + offset) % neck) ?? 0) * shortPitch;
  };
  for (let r = 0; r < 3; r++) {
    const row: ConnectedLoop[] = [];
    const half = neckHalf * (1 - r * 0.013);
    plainBand(row, -half, half, 0, true);
    for (const [column, node] of row.entries()) {
      const u = (2 * (column + 0.5)) / row.length - 1;
      node.y =
        dip * courseArc(u) -
        neckRiseAt(u) -
        yokePitch * 0.32 -
        (r + 0.12) * plainPitch;
      node.angle = Math.atan2(
        -(Math.PI / 2) * dip * Math.sin((u * Math.PI) / 2),
        half,
      );
      node.span /= Math.cos(node.angle);
    }
    collar.push(row);
  }

  // A front flat-lay also shows a little of the higher back neckband behind
  // the opening. Join its ends to the front band without filling the opening.
  const farCollar: ConnectedLoop[][] = [];
  if (side === "front")
    for (let r = 0; r < Math.ceil((dip + 6) / plainPitch); r++) {
      const row: ConnectedLoop[] = [];
      const half = neckHalf + plainSpan;
      plainBand(row, -half, half, 0, true);
      farCollar.push(
        row.filter((node) => {
          const u = node.x / half;
          const edgeRise = mix(neckRiseAt(-1), neckRiseAt(1), (u + 1) / 2);
          node.y =
            -edgeRise -
            yokePitch * 0.4 +
            (r - 0.6) * plainPitch +
            2.6 * courseArc(u) +
            5 * u ** 4;
          node.angle = Math.atan(
            (20 * u ** 3 - 4.1 * Math.sin((u * Math.PI) / 2)) / half,
          );
          node.action = r < 2 ? node.action : "purl";
          // Tuck the lining underneath the front band. Stopping precisely at
          // its curve can leave a white seam between the two sets of sprites.
          const frontU = clamp(node.x / neckHalf, -1, 1);
          return node.y < dip * courseArc(frontU) + 4 + 2 * plainPitch;
        }),
      );
    }

  // The stitch renderer paints rows in reverse order.
  const rows = [...body.reverse(), ...pattern, ...collar, ...farCollar];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const row of rows)
    for (const node of row) {
      minX = Math.min(minX, node.x - 2);
      maxX = Math.max(maxX, node.x + 2);
      minY = Math.min(minY, node.y - 2);
      maxY = Math.max(maxY, node.y + 2);
    }
  return {
    document,
    loops,
    rows,
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
    unresolvedRows: [],
    inferredRows: [],
    inputCountDecreaseRows: [],
  };
}
