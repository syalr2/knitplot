import type { ChartDocument, StitchAction } from "./chart";
import {
  settleConnectedFabric,
  type ConnectedLoop,
  type FabricConnection,
} from "./connected-preview";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { resolvedYokeProgram } from "./yoke-program-state";
import { yokeProgramSurface } from "./yoke-program-surface";
import { planYokeShortRows } from "./yoke-short-rows";
import { inYokePreviewHalf, type YokePreviewView } from "./yoke-preview-view";

function connection(action: StitchAction, parents: number): FabricConnection {
  if (action === "m1l" || action === "m1r") return "bar";
  if (action === "kfb" || action === "inc") return "split";
  if (action === "cast-on" || action === "bind-off") return action;
  if (parents > 1) return "merge";
  return parents ? "loop" : "start";
}

const TAU = 2 * Math.PI;

/** A fabric projection, not a flattened picture of the chart.
 * Follow resolved loop ancestry and keep the real order of all repeats. */
export function yokeFabric(
  document: ChartDocument,
  view: Exclude<YokePreviewView, "sweater-front" | "sweater-back"> = "whole",
  repeat = 0,
  settle = true,
) {
  if (!document.yoke) throw new Error("This chart has no yoke instructions.");
  const project = document.yoke;
  const program = project.program ?? yokeProgramFromProject(project);
  const rounds = resolvedYokeProgram(program);
  const surface = yokeProgramSurface({ ...project, program });
  const plan = planYokeShortRows(project.measurements, project.shortRows);
  const h = document.gaugeStitches / document.gaugeRows;
  const count = rounds.length;
  const widths = surface.rows.map((row) => row.length);
  const selectedRepeat = Math.max(
    0,
    Math.min(program.startingCounts.length - 1, repeat),
  );
  function order(sectionWidths: number[]) {
    const width = sectionWidths.reduce((a, b) => a + b, 0);
    const start = sectionWidths
      .slice(0, selectedRepeat)
      .reduce((a, b) => a + b, 0);
    // Only the single-repeat view uses a laid-out fan.
    const cut =
      view === "repeat"
        ? (start + Math.floor((sectionWidths[selectedRepeat] + width) / 2)) %
          Math.max(1, width)
        : 0;
    return { width, cut, start, end: start + sectionWidths[selectedRepeat] };
  }
  const visible = new Set<number>();
  function show(original: number, layout: ReturnType<typeof order>) {
    if (view === "whole") return true;
    if (view === "repeat")
      return original >= layout.start && original < layout.end;
    return inYokePreviewHalf(view, original, layout.width);
  }
  const growth = (widths.at(-1)! - widths[0]) / Math.max(1, count - 1);
  const circular = view !== "repeat";
  // A shaped garment is not necessarily flat. For the top-down projection,
  // share the radial depth across rounds and fit every course into one turn.
  const circularPitch = Math.min(h, Math.max(h * 0.5, growth / TAU));
  const circularNeck = Math.max(
    plan.neck / TAU,
    (plan.extraRows + 2) * circularPitch,
  );
  const direction = Math.sign(growth);
  const turn = Math.abs(growth) / h;
  const curved = turn > 0.035;
  const maxWidth = Math.max(plan.neck, ...widths);
  const radius0 = curved
    ? Math.max(
        widths[0] / Math.min(6.1, turn),
        ...widths.map((width, r) => width / 6.1 - direction * r * h),
        direction > 0 ? (plan.extraRows + 2) * h : 0,
      )
    : 0;
  const rows: ConnectedLoop[][] = Array.from(
    { length: count + plan.extraRows },
    () => [],
  );
  const all: ConnectedLoop[] = [];
  const ids = new Map<string, number>();
  function add(
    row: number,
    packed: number,
    width: number,
    column: number,
    action: StitchAction,
    yarn: string,
    parentIds: (string | undefined)[],
    id?: string,
  ) {
    const parents = parentIds.flatMap((key) => {
      const parent = key === undefined ? undefined : ids.get(key);
      if (parent === undefined) return [];
      // Connections across the display seam cannot pull the edges together.
      if (!circular && Math.abs(all[parent].packed - packed) > width / 2)
        return [];
      return [parent];
    });
    const r = count - 1 - row;
    const radius = circular
      ? circularNeck + r * circularPitch
      : radius0 + direction * r * h;
    const angle = circular
      ? ((packed + 0.5) / width) * TAU
      : curved
        ? (packed + 0.5 - width / 2) / radius
        : 0;
    const node: ConnectedLoop = {
      id: all.length,
      row,
      packed,
      column,
      action,
      yarn,
      parents,
      kind: connection(action, parents.length),
      x:
        circular || curved
          ? radius * Math.sin(angle)
          : (maxWidth - width) / 2 + packed + 0.5,
      y: circular
        ? -radius * Math.cos(angle)
        : curved
          ? -direction * radius * Math.cos(angle)
          : row * h,
      span: 1,
      angle: 0,
      boundary: false,
    };
    const previous = rows[row].at(-1);
    if (previous && previous.packed + 1 === packed) {
      previous.right = node.id;
      node.left = previous.id;
    } else if (previous) {
      previous.boundary = true;
      node.boundary = true;
    }
    rows[row].push(node);
    all.push(node);
    if (id) ids.set(id, node.id);
    return node;
  }
  function closeCourse(row: ConnectedLoop[], width: number) {
    const first = row[0],
      last = row.at(-1);
    if (
      circular &&
      first &&
      last &&
      first !== last &&
      first.packed === 0 &&
      last.packed === width - 1 &&
      first.action !== "bind-off" &&
      last.action !== "bind-off"
    ) {
      first.left = last.id;
      last.right = first.id;
    }
  }

  // Partial courses are front-facing stockinette, packed next to round 1
  // only on the stitches actually worked by the back-neck turns.
  const seeds = program.startingCounts.flatMap((n, section) =>
    Array.from({ length: n }, (_, i) => `seed-${section}-${i}`),
  );
  const extra = seeds.map(
    (_, col) =>
      2 * plan.distances.filter((d) => col < d || col >= plan.neck - d).length,
  );
  const neckLayout = order(program.startingCounts);
  const rotatedSeeds = [
    ...seeds.slice(neckLayout.cut),
    ...seeds.slice(0, neckLayout.cut),
  ];
  for (let depth = plan.extraRows; depth > 0; depth--) {
    rotatedSeeds.forEach((seed, packed) => {
      const col = (packed + neckLayout.cut) % plan.neck;
      if (extra[col] < depth) return;
      // Reuse the seed key for the most recent partial course in this wale.
      const node = add(
        count - 1 + depth,
        packed,
        plan.neck,
        col,
        "knit",
        project.palette[0],
        [seed],
        seed,
      );
      if (show(col, neckLayout)) visible.add(node.id);
    });
    closeCourse(rows[count - 1 + depth], plan.neck);
  }

  rounds.forEach((round, r) => {
    const loops = round.sections.flat();
    const operations = new Map(
      round.operations.flat().map((op) => [op.id, op]),
    );
    const slots = surface.rows[r];
    const layout = order(surface.widths[r]);
    const ordered = [...slots.slice(layout.cut), ...slots.slice(0, layout.cut)];
    // Group the two outputs of a split under one instruction column.
    const columns = new Map<string, number>();
    ordered.forEach((slot, packed) => {
      const op =
        slot.operation === undefined
          ? undefined
          : operations.get(slot.operation);
      if (!op || (slot.gap && op.action !== "bind-off")) return;
      const column = columns.get(op.id) ?? packed;
      columns.set(op.id, column);
      const isBar = op.action === "m1l" || op.action === "m1r";
      const node = add(
        count - 1 - r,
        packed,
        slots.length,
        column,
        op.action,
        project.palette[op.color],
        isBar ? [op.left, op.right] : op.inputs,
        slot.gap ? undefined : loops[slot.loop].id,
      );
      if (show((packed + layout.cut) % slots.length, layout))
        visible.add(node.id);
    });
    closeCourse(rows[count - 1 - r], slots.length);
  });
  // Large complete yokes can have 180,000 loops. Bound total solver work;
  // the gauge-spaced initial pose is already a useful layout on its own.
  const fabric = settleConnectedFabric(
    document,
    rows,
    all,
    undefined,
    settle
      ? Math.min(
          circular ? 36 : 700,
          Math.floor(2_500_000 / Math.max(1, all.length)),
        )
      : 0,
    circular ? circularPitch : undefined,
  );
  const courseWidths = [
    ...widths.toReversed(),
    ...Array<number>(plan.extraRows).fill(plan.neck),
  ];
  if (view === "whole") return { ...fabric, courseWidths };
  // The front is opposite the centre-back origin. Turn the entire coordinate
  // frame, including off-screen parents, so both halves display neckline-up.
  if (view === "front")
    for (const node of all) {
      node.x = -node.x;
      node.y = -node.y;
      node.angle += Math.PI;
    }
  // Keep the full loop table: the visible edge still depends on neighbouring
  // stitches and on parents that may fall outside this view.
  const cropped = rows.map((row) => row.filter((node) => visible.has(node.id)));
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const row of cropped)
    for (const node of row) {
      const margin = Math.max(node.span * 0.8, h);
      minX = Math.min(minX, node.x - margin);
      minY = Math.min(minY, node.y - margin);
      maxX = Math.max(maxX, node.x + margin);
      maxY = Math.max(maxY, node.y + margin);
    }
  return {
    ...fabric,
    courseWidths,
    rows: cropped,
    minX: visible.size ? minX : 0,
    minY: visible.size ? minY : 0,
    width: visible.size ? maxX - minX : 1,
    height: visible.size ? maxY - minY : h,
  };
}
